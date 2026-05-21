import { supabase } from './supabase'

/**
 * 학습 시스템 — 자연어 사고 룰(ai_instructions) + 매 저장 누적 로그(edit_learning_logs)
 */

// ───────────────────────────────────────────
// 자연어 사고 룰 (clinic_settings.ai_instructions)
// composeReport 시스템 프롬프트에 박힘
// ───────────────────────────────────────────

export async function loadAiInstructions() {
  const { data, error } = await supabase
    .from('clinic_settings')
    .select('value')
    .eq('id', 'ai_instructions')
    .maybeSingle()
  if (error) {
    console.warn('loadAiInstructions failed:', error.message)
    return []
  }
  return (data?.value?.items || []).filter(Boolean)
}

export async function saveAiInstructions(items) {
  const value = { items: (items || []).filter(Boolean) }
  // upsert: id 가 PK 가 아닐 수 있으므로 (clinic_settings 의 다른 사용처도 update 방식) update 우선
  const { data: existing } = await supabase
    .from('clinic_settings')
    .select('id')
    .eq('id', 'ai_instructions')
    .maybeSingle()
  if (existing) {
    const { error } = await supabase
      .from('clinic_settings')
      .update({ value, updated_at: new Date().toISOString() })
      .eq('id', 'ai_instructions')
    if (error) throw error
  } else {
    const { error } = await supabase
      .from('clinic_settings')
      .insert({ id: 'ai_instructions', value })
    if (error) throw error
  }
}

// ───────────────────────────────────────────
// 매 저장 학습 로그 (edit_learning_logs)
// ───────────────────────────────────────────

function stripHtml(html) {
  if (!html || typeof html !== 'string') return ''
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

function normalize(s) {
  return (s || '').replace(/\s+/g, ' ').trim()
}

/**
 * h2 섹션 단위로 본문을 쪼개 비교.
 * 출력: [{ section, draft, edited, kind }]
 *   kind: 'changed' | 'added' | 'removed' | 'unchanged'
 */
export function extractDiffSegments(draftHtml, editedHtml) {
  const parse = (html) => {
    const sections = {}
    if (!html) return sections
    try {
      const parser = new DOMParser()
      const doc = parser.parseFromString(`<div id="root">${html}</div>`, 'text/html')
      const root = doc.getElementById('root')
      if (!root) return sections
      let curTitle = '__PREAMBLE__'
      let curParts = []
      const push = () => {
        if (!sections[curTitle]) sections[curTitle] = ''
        sections[curTitle] += curParts.join('')
      }
      for (const node of Array.from(root.childNodes)) {
        if (node.nodeType === 1 && node.tagName === 'H2') {
          push()
          curTitle = (node.textContent || '').trim() || '__UNTITLED__'
          curParts = []
        } else if (node.nodeType === 1) {
          curParts.push(node.outerHTML)
        } else if (node.nodeType === 3) {
          curParts.push(node.textContent || '')
        }
      }
      push()
      return sections
    } catch {
      return sections
    }
  }

  const a = parse(draftHtml)
  const b = parse(editedHtml)
  const allTitles = new Set([...Object.keys(a), ...Object.keys(b)])
  const out = []
  for (const title of allTitles) {
    const draft = stripHtml(a[title] || '')
    const edited = stripHtml(b[title] || '')
    let kind = 'unchanged'
    if (!draft && edited) kind = 'added'
    else if (draft && !edited) kind = 'removed'
    else if (normalize(draft) !== normalize(edited)) kind = 'changed'
    else continue // unchanged 는 저장 안 함 (용량 절약)
    out.push({ section: title, draft, edited, kind })
  }
  return out
}

/**
 * 매 저장 호출. draft 와 edited 가 같으면 저장 안 함.
 * 실패해도 사용자 경험에 영향 X (백그라운드).
 */
export async function saveEditLearningLog({ reportId, clinicalForm, staffForm, draftBody, editedBody }) {
  try {
    if (!draftBody || !editedBody) return
    const diff = extractDiffSegments(draftBody, editedBody)
    if (diff.length === 0) return // 변경 없음

    const { error } = await supabase.from('edit_learning_logs').insert({
      report_id: reportId || null,
      clinical_form_snapshot: clinicalForm || null,
      staff_form_snapshot: staffForm || null,
      draft_body: draftBody,
      edited_body: editedBody,
      diff_segments: diff,
    })
    if (error) throw error
  } catch (err) {
    console.warn('saveEditLearningLog failed:', err.message)
  }
}

/**
 * 누적된 학습 로그 개수.
 */
export async function countLearningLogs() {
  const { count, error } = await supabase
    .from('edit_learning_logs')
    .select('*', { count: 'exact', head: true })
  if (error) {
    console.warn('countLearningLogs failed:', error.message)
    return 0
  }
  return count || 0
}

/**
 * 패턴 분석용으로 최근 N건 로딩.
 */
export async function loadRecentLearningLogs(limit = 50) {
  const { data, error } = await supabase
    .from('edit_learning_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) {
    console.warn('loadRecentLearningLogs failed:', error.message)
    return []
  }
  return data || []
}

// ───────────────────────────────────────────
// 패턴 분석 프롬프트 빌더 — PC2 Claude 워커에 전달
// ───────────────────────────────────────────

function summarizeClinicalForm(cf) {
  if (!cf) return '(입력 없음)'
  const parts = []
  if (cf.summary?.combined) {
    parts.push(cf.summary.combined.slice(0, 800))
  } else {
    if (cf.summary?.skeletal) parts.push(`[골격] ${cf.summary.skeletal}`)
    if (cf.summary?.dental) parts.push(`[치성] ${cf.summary.dental}`)
    if (cf.summary?.etc) parts.push(`[기타] ${cf.summary.etc}`)
    if (cf.summary?.overall) parts.push(`[메모] ${cf.summary.overall}`)
    const plans = (cf.summary?.treatmentPlans || []).filter(Boolean)
    plans.forEach((p, i) => parts.push(`[계획#${i + 1}] ${p}`))
  }
  return parts.join('\n').slice(0, 1500) || '(입력 비어있음)'
}

function summarizeDiff(diffSegments) {
  if (!Array.isArray(diffSegments) || diffSegments.length === 0) return '(변경 없음)'
  return diffSegments
    .filter(d => d.kind !== 'unchanged')
    .map(d => {
      const head = `[${d.section}] (${d.kind})`
      const draft = (d.draft || '').slice(0, 500)
      const edited = (d.edited || '').slice(0, 500)
      return `${head}\n  AI 초안: ${draft}\n  사용자 수정: ${edited}`
    })
    .join('\n\n')
    .slice(0, 3000)
}

/**
 * 누적 학습 로그 N건 + 기존 자연어 룰 → Claude 에 보내는 프롬프트 생성.
 * 출력: { systemPrompt, userMessage }
 */
export function buildAnalyzePatternsPrompt(logs, existingInstructions = []) {
  const systemPrompt = `당신은 한국 치과 진단서 AI 의 사고 룰을 발견하는 분석가입니다.

상황:
- 매니저가 환자별로 진단/치료 계획을 입력하면 AI 가 진단서 본문을 작성함
- 사용자(원장·매니저)가 AI 초안을 수정해 최종 본문을 만듦
- 입력 + AI 초안 + 사용자 수정본 비교 데이터가 N건 누적됨

당신의 일:
- 누적 데이터에서 **사용자가 반복적으로 정정하는 패턴**을 발견
- 그 패턴을 다음 진단서 작성 시 AI 가 따라야 할 **자연어 사고 룰 후보**로 제안
- 룰은 짧고 명령형으로 ("~ 금지", "~만 사용", "~ 시 반드시 ~"), 한 문장
- 단순 단어 치환(예: "A → B") 같은 사전형 룰 ❌ — 사고·판단 룰만
- 사용자가 자주 수정한 경향이 명확할 때만 제안 (단발성 수정은 제외)

이미 적용된 사고 룰 목록을 받음 — **중복·유사한 룰은 제안 금지**, 기존 룰의 보강·정밀화는 가능

출력 형식 (JSON 한 덩어리만):
{
  "candidates": ["새 사고 룰 후보 1", "새 사고 룰 후보 2", ...],
  "summary": "이번 분석에서 발견한 핵심 경향 1~2문장"
}

룰은 0~5개. 의미 있는 패턴 못 찾으면 빈 배열.`

  const existingBlock = existingInstructions.length > 0
    ? existingInstructions.map((g, i) => `${i + 1}. ${g}`).join('\n')
    : '(없음)'

  const logsBlock = (logs || []).map((log, i) => {
    return `─── 사례 #${i + 1} (${log.created_at?.slice(0, 10) || '?'}) ───
[환자 입력 요약]
${summarizeClinicalForm({ summary: log.clinical_form_snapshot?.summary || log.clinical_form_snapshot })}

[AI 초안 ↔ 사용자 수정 차이]
${summarizeDiff(log.diff_segments)}`
  }).join('\n\n')

  const userMessage = `## 이미 적용 중인 사고 룰 (중복 제안 금지)
${existingBlock}

## 누적 수정 사례 (${logs.length}건)
${logsBlock}

위 데이터에서 발견되는 사용자의 반복적 정정 패턴을 분석하고, 새 사고 룰 후보를 JSON 으로 반환하시오.`

  return { systemPrompt, userMessage }
}

