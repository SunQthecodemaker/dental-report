import { supabase } from './supabase'
import { summaryWithKoreanTeeth } from './toothCode'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const EDGE_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/generate-text`

async function loadClinicSettings() {
  const { data } = await supabase.from('clinic_settings').select('*')
  const settings = { guidelines: [], terminology: [], strengths: [], toneRules: [] }
  if (data) {
    for (const row of data) {
      if (row.id === 'writing_guidelines') settings.guidelines = row.value.items || []
      if (row.id === 'terminology') settings.terminology = row.value.items || []
      if (row.id === 'clinic_strengths') settings.strengths = row.value.items || []
      if (row.id === 'tone_rules_table') settings.toneRules = row.value.items || []
    }
  }
  return settings
}

// HTML 태그 제거 (문장 비교용)
function stripHtml(html) {
  if (!html || typeof html !== 'string') return ''
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

/**
 * Gemini Vision — 치과 사진을 보고 한국어 한 줄 캡션 자동 생성
 * 입력: File 객체 (이미지)
 * 출력: 문자열 (예: "파노라마 방사선 — 16번 임플란트", "구내 사진 · 상악 교합면")
 */
export async function generateImageCaption(file) {
  if (!file || !file.type?.startsWith('image/')) return ''

  // File → base64
  const base64 = await new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      const s = reader.result || ''
      const comma = s.indexOf(',')
      resolve(comma >= 0 ? s.slice(comma + 1) : '')
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })

  const systemPrompt = `당신은 치과 상담 사진을 보고 **사진 종류만** 한 줄 한국어 라벨로 분류하는 도우미입니다.

**⛔ 절대 금지 — 소견·진단·발견 사항 부연 일체 금지:**
- "— 매복 사랑니", "— 16번 임플란트", "— 충치", "— 보철" 같은 **소견·진단성 부연 절대 금지**
- 사진에서 무엇이 보이든, 소견은 의사의 진단 입력에서만 나와야 함. AI가 사진만 보고 소견을 라벨화하면 환자 진단서에 폼 입력에 없는 정보가 새어나가는 환각이 됨.
- 출력은 오직 "사진이 무엇인지(분류)" 만.

**사진 종류 (정확히 이 분류 중 하나만 출력):**
- 파노라마 방사선
- 측모두부 방사선
- 구내 사진 · 전면
- 구내 사진 · 우측 측방
- 구내 사진 · 좌측 측방
- 구내 사진 · 상악 교합면
- 구내 사진 · 하악 교합면
- 전치부 근접
- 얼굴 사진 · 정면
- 얼굴 사진 · 측면
- 기타 치과 사진

**규칙:**
- 한 줄 라벨만 출력 (마크다운·번호·따옴표·" — 소견" 부분 금지)
- 분류가 애매하면 상위 카테고리 ("구내 사진", "방사선 사진", "기타 치과 사진")
- 설명·소견·진단 일절 금지`

  try {
    const response = await fetch(EDGE_FUNCTION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [{
          parts: [
            { text: '이 사진의 한 줄 캡션:' },
            { inline_data: { mime_type: file.type || 'image/png', data: base64 } },
          ],
        }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 80,
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
    })
    const data = await response.json()
    if (data.error) return ''
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text
    if (!text) return ''
    let cleaned = text.trim().replace(/^["'`]+|["'`]+$/g, '').split('\n')[0].trim()
    // 방어선: 프롬프트에서 금지했지만 모델이 혹시 " — 소견" / " : 소견" 부연을 붙여올 경우 잘라냄
    cleaned = cleaned.split(/\s[—–\-:]\s/)[0].trim()
    return cleaned
  } catch (err) {
    console.warn('image caption generation failed:', err)
    return ''
  }
}

function normalizeForCompare(s) {
  return (s || '').replace(/\s+/g, ' ').replace(/[\u200B-\u200D\uFEFF]/g, '').trim()
}

export async function saveCorrections(originalText, editedText) {
  const orig = stripHtml(originalText)
  const edit = stripHtml(editedText)
  if (!orig || !edit) return
  if (normalizeForCompare(orig) === normalizeForCompare(edit)) return
  const origSentences = orig.split(/(?<=[.。!?])\s+/).map(s => s.trim()).filter(Boolean)
  const editSentences = edit.split(/(?<=[.。!?])\s+/).map(s => s.trim()).filter(Boolean)
  const corrections = []
  const len = Math.min(origSentences.length, editSentences.length)
  for (let i = 0; i < len; i++) {
    const o = origSentences[i], e = editSentences[i]
    if (normalizeForCompare(o) !== normalizeForCompare(e)) {
      corrections.push({
        original_term: o,
        corrected_term: e,
        context: 'AI생성 텍스트 수동 교정',
      })
    }
  }
  if (corrections.length > 0) {
    await supabase.from('charting_corrections').insert(corrections)
  }
}

/**
 * 새 지침이 기존 지침과 중복/충돌하는지 AI에 검수 요청.
 * 반환: { status: 'ok' | 'duplicate' | 'conflict' | 'similar', reason, conflictIndex?, mergedText? }
 *  - ok: 추가해도 무방
 *  - duplicate: 이미 같은 의미가 있음
 *  - conflict: 기존과 모순 (사용자에게 선택 요청)
 *  - similar: 의미가 겹쳐 병합 제안
 */
export async function validateNewGuideline(existing, newText) {
  const text = (newText || '').trim()
  if (!text) return { status: 'ok', reason: '' }
  if (!existing || existing.length === 0) return { status: 'ok', reason: '' }

  const systemPrompt = `당신은 치과 진단서 AI 작성 지침을 관리하는 검수관입니다.
새로 추가하려는 지침이 기존 지침 목록과 중복되거나 충돌하는지 판단하세요.

판단 기준:
- duplicate: 기존 지침 중 **거의 같은 의미**의 항목이 있음 (표현만 다를 뿐)
- conflict: 기존 지침과 **서로 모순되는** 내용 (예: "짧게 써" vs "자세히 써")
- similar: 주제가 겹쳐 **하나로 합치는 편이** 더 명확한 경우
- ok: 독립적인 새 지침, 그대로 추가 가능

반드시 JSON만 출력하시오:
{ "status": "ok" | "duplicate" | "conflict" | "similar", "reason": "짧은 한국어 설명", "conflictIndex": <기존 배열의 0-based 인덱스, 해당 시>, "mergedText": "similar인 경우 병합된 문장" }`

  const userMessage = `기존 지침 목록(0-based):
${existing.map((g, i) => `${i}. ${g}`).join('\n')}

새로 추가하려는 지침:
"${text}"`

  try {
    const response = await fetch(EDGE_FUNCTION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [{ parts: [{ text: userMessage }] }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 400,
          responseMimeType: 'application/json',
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
    })
    const data = await response.json()
    if (data.error) return { status: 'ok', reason: '' }
    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text
    if (!raw) return { status: 'ok', reason: '' }
    const parsed = JSON.parse(raw)
    if (!['ok', 'duplicate', 'conflict', 'similar'].includes(parsed.status)) {
      return { status: 'ok', reason: '' }
    }
    return parsed
  } catch (err) {
    console.warn('validateNewGuideline failed:', err)
    return { status: 'ok', reason: '' }
  }
}

/**
 * 기존 지침 전체를 AI가 중복 제거·주제별로 재구성해 간결한 배열로 반환.
 * 반환: { cleaned: string[], summary: string }
 */
export async function cleanupGuidelines(existing) {
  const items = (existing || []).filter(Boolean)
  if (items.length < 2) return { cleaned: items, summary: '정리할 지침이 충분하지 않습니다.' }

  const systemPrompt = `당신은 치과 진단서 AI 작성 지침을 정리하는 편집자입니다.
주어진 지침 목록에서 **의미가 겹치는 항목은 하나로 병합**하고, **모호한 문장은 구체적으로** 다듬고, **순서는 주제별**로 재정렬하세요.

엄격한 원칙:
- 원래 지침의 의도를 바꾸지 마시오
- 모순되는 지침이 있으면 둘 다 유지하되 순서를 인접시키시오
- 각 지침은 한 줄(최대 80자 권장), 명령형·구체적 표현
- 개수는 가능하면 줄이되, 합쳐도 의미가 흐려지면 따로 두시오

반드시 JSON만 출력:
{ "cleaned": ["지침1", "지침2", ...], "summary": "어떤 정리를 했는지 1~2문장 한국어 요약" }`

  const userMessage = `정리 대상 지침 (${items.length}개):
${items.map((g, i) => `${i + 1}. ${g}`).join('\n')}`

  try {
    const response = await fetch(EDGE_FUNCTION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [{ parts: [{ text: userMessage }] }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 2000,
          responseMimeType: 'application/json',
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
    })
    const data = await response.json()
    if (data.error) throw new Error(data.error.message)
    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text
    if (!raw) throw new Error('AI 응답 비어있음')
    const parsed = JSON.parse(raw)
    const cleaned = Array.isArray(parsed.cleaned)
      ? parsed.cleaned.map(s => String(s || '').trim()).filter(Boolean)
      : items
    return { cleaned, summary: parsed.summary || '' }
  } catch (err) {
    console.warn('cleanupGuidelines failed:', err)
    throw err
  }
}

function summaryIsEmpty(summary) {
  if (!summary) return true
  if (summary.combined && summary.combined.trim()) return false
  const plans = (summary.treatmentPlans || []).filter(Boolean)
  return !summary.skeletal && !summary.dental && !summary.etc && plans.length === 0 && !summary.overall
}

// 성향 키 → 한국어 라벨 매핑 (AI 프롬프트 가독성용, 본문에는 절대 노출되면 안 됨)
const STAFF_KEY_LABEL = {
  personality: '성격·반응 성향',
  anxiety: '불안 요소',
  costReaction: '비용 반응',
  interests: '주요 관심사',
  willingness: '치료 의지(5점)',
  understanding: '이해도(5점)',
}

function buildStaffLines(staffForm = {}) {
  const lines = []
  for (const key of ['personality', 'anxiety', 'costReaction', 'interests']) {
    const arr = staffForm[key]
    if (Array.isArray(arr) && arr.length > 0) {
      lines.push(`- ${STAFF_KEY_LABEL[key]}: ${arr.join(', ')}`)
    }
  }
  for (const key of ['willingness', 'understanding']) {
    if (typeof staffForm[key] === 'number') {
      lines.push(`- ${STAFF_KEY_LABEL[key]}: ${staffForm[key]}/5`)
    }
  }
  return lines.length > 0 ? lines.join('\n') : '(성향 정보 없음)'
}

/**
 * 진단서 본문 생성 — 정리된 소스(summary) + 환자 성향(staffForm) → 환자용 본문(HTML)
 *
 * 출력 구조 (3섹션):
 *   - 문제 목록 (ul/li): 입력의 문제성 항목을 자연 문장 bullet 으로
 *   - 치료 계획 (p): 입력의 계획을 환자용 산문으로
 *   - 종합 안내 (p): 문제+치료를 연결한 한 단락 (추가메모의 비-문제 맥락 흡수)
 *
 * 환각 방지 vs 조합 허용 분리:
 *   - 환자별 사실(부위·치료옵션·심도) 추가는 금지
 *   - 입력 항목들을 조합·연결한 자연 문장 만들기는 허용
 *   - 명시 항목에 대한 일반론적 의미·중요성 부연도 허용 (단, 환자 특이 사실 추가 금지)
/**
 * suggestTags — 진단/치료계획/성향에서 라이브러리 태그 풀과 매칭되는 항목을 AI가 골라줌.
 * 절대 규칙: 입력된 tagPool 안에서만 선택, 새 태그 만들지 않음.
 *
 * 입력: { summary, staffForm, casePool: string[], strengthPool: string[] }
 * 출력: { caseTags: string[], strengthTags: string[] }
 */
export async function suggestTags({ summary, staffForm, casePool, strengthPool }) {
  const cp = Array.isArray(casePool) ? casePool : []
  const sp = Array.isArray(strengthPool) ? strengthPool : []
  if (cp.length === 0 && sp.length === 0) return { caseTags: [], strengthTags: [] }

  const koreanSummary = summaryWithKoreanTeeth(summary)
  const skel = (koreanSummary?.skeletal || '').trim()
  const dent = (koreanSummary?.dental || '').trim()
  const etc = (koreanSummary?.etc || '').trim()
  const plans = Array.isArray(koreanSummary?.treatmentPlans) ? koreanSummary.treatmentPlans : []
  const overall = (koreanSummary?.overall || '').trim()
  const combined = (koreanSummary?.combined || '').trim()

  const personality = (staffForm?.personality || []).join(', ')
  const concerns = (staffForm?.concerns || []).join(', ')
  const motivations = (staffForm?.motivations || []).join(', ')
  const special = (staffForm?.specialCircumstances || '').trim()

  const systemPrompt = `당신은 치과 진단 데이터를 보고 미리 정의된 태그 풀에서 어울리는 항목을 골라주는 AI입니다.

**절대 규칙:**
1. caseTags는 반드시 "케이스 태그 풀"에 있는 단어만 사용. 새 단어 만들지 마시오.
2. strengthTags는 반드시 "어필포인트 태그 풀"에 있는 단어만 사용. 새 단어 만들지 마시오.
3. 입력값에 명확히 근거가 있는 태그만 선택. 추측·확장 금지.
4. 각 분류당 최대 5개. 어울리는 게 없으면 빈 배열.
5. 출력은 JSON 한 덩어리 — 그 외 텍스트·코드블록 금지.

**케이스 태그 풀 (이 안에서만 선택):**
${cp.map(t => `- ${t}`).join('\n') || '(없음)'}

**어필포인트 태그 풀 (이 안에서만 선택):**
${sp.map(t => `- ${t}`).join('\n') || '(없음)'}

**출력 JSON 스키마:**
{ "caseTags": ["태그1", "태그2"], "strengthTags": ["태그A", "태그B"] }`

  const userMessage = `# 진단
- 골격: ${skel || '(없음)'}
- 치성: ${dent || '(없음)'}
- 기타: ${etc || '(없음)'}

# 치료 계획
${plans.length ? plans.map((p, i) => `## 계획 #${i + 1}\n${p}`).join('\n\n') : '(없음)'}

# 정리 / 추가 메모
${combined || overall || '(없음)'}

# 환자 성향
- 성향: ${personality || '(없음)'}
- 걱정/고민: ${concerns || '(없음)'}
- 관심사: ${motivations || '(없음)'}
- 특이 상황: ${special || '(없음)'}

위 내용에 근거해 위 두 태그 풀에서만 골라 JSON으로 반환하시오.`

  const response = await fetch(EDGE_FUNCTION_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: [{ parts: [{ text: userMessage }] }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 1000,
        responseMimeType: 'application/json',
        thinkingConfig: { thinkingBudget: 0 },
      },
    }),
  })

  const data = await response.json()
  if (data.error) throw new Error(data.error.message || 'AI 태그 추천 실패')
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) return { caseTags: [], strengthTags: [] }

  let parsed
  try { parsed = JSON.parse(text) }
  catch {
    const m = text.match(/\{[\s\S]*\}/)
    parsed = m ? JSON.parse(m[0]) : {}
  }

  // 풀 안에 있는 항목만 통과시킴 (대소문자 무시) — 환각 방어
  const lcCase = new Set(cp.map(t => t.toLowerCase()))
  const lcStr = new Set(sp.map(t => t.toLowerCase()))
  const filterPool = (arr, lcSet, pool) => {
    if (!Array.isArray(arr)) return []
    const out = []
    const seen = new Set()
    for (const t of arr) {
      const s = String(t).trim().replace(/^#+/, '').trim()
      if (!s) continue
      const lc = s.toLowerCase()
      if (!lcSet.has(lc)) continue
      if (seen.has(lc)) continue
      seen.add(lc)
      // pool에서 원본 표기 찾기
      const original = pool.find(p => p.toLowerCase() === lc) || s
      out.push(original)
    }
    return out.slice(0, 5)
  }

  return {
    caseTags: filterPool(parsed.caseTags, lcCase, cp),
    strengthTags: filterPool(parsed.strengthTags, lcStr, sp),
  }
}

/**
 * 출력: { body: HTML, personalNote, appealPoints }
 *   body 섹션 순서: 문제 목록(ul) → 치료 계획(p) → 종합 안내(p)
 */
export async function composeReport({ summary, staffForm }) {
  if (summaryIsEmpty(summary)) {
    return getEmptyDraft()
  }

  const koreanSummary = summaryWithKoreanTeeth(summary)
  const settings = await loadClinicSettings()

  let guidelinesBlock = ''
  if (settings.guidelines.length > 0) {
    guidelinesBlock = `\n\n**치과 작성 지침 (톤/표현만 참고, 내용 추가 금지):**\n${settings.guidelines.map((g) => `- ${g}`).join('\n')}`
  }

  let terminologyBlock = ''
  if (settings.terminology.length > 0) {
    terminologyBlock = `\n\n**용어/표현 사전 (이 변환만 적용, 의미 추가 금지):**\n${settings.terminology.map((t) => `- "${t.from}" → "${t.to}"`).join('\n')}`
  }

  let strengthsBlock = ''
  if (settings.strengths.length > 0) {
    strengthsBlock = `\n\n**치과 특장점 (appealPoints에만 활용. 소스와 직접 관련된 것만 선별):**\n${settings.strengths.map((s) => {
      const content = typeof s === 'string' ? s : s.title || ''
      return `- ${content}`
    }).join('\n')}`
  }

  // 톤 규칙 표 (DB 관리 — Settings '톤 규칙' 탭에서 편집)
  const enabledToneRules = (settings.toneRules || []).filter(r => r.enabled !== false && r.trait && r.rule)
  const toneTableBlock = enabledToneRules.length > 0
    ? `\n\n| 선택된 성향 | 반영 방법 (문체 조절) |\n|---|---|\n${enabledToneRules.map(r => `| ${r.trait} | ${r.rule} |`).join('\n')}`
    : ''

  const systemPrompt = `당신은 한국 치과 진단서를 환자가 한 번에 읽고 자기 상황을 이해할 수 있도록 작성하는 AI입니다.

핵심 원칙은 두 축:
1. **환자별 사실 환각 금지** — 입력에 없는 부위·치료옵션·심도는 단 한 단어도 추가하지 않음
2. **조합·연결 적극 허용** — 입력에 명시된 항목들을 묶어 자연스러운 한국어 문장으로 풀어 쓰고, 명시 항목에 대한 일반론적 의미·중요성도 부연 가능

═══════════════════════════════════
**📋 출력 본문(body) 구조 — 정확히 3섹션 고정 순서**
═══════════════════════════════════

**1. 문제 목록** (\`<h2>문제 목록</h2>\` + \`<ul><li>\`)
- 입력의 [치성/골격/기타] 및 [전체 추가 메모] 중 *문제성* 항목을 **순서대로** bullet 으로 나열
- ⛔ 입력 카테고리 라벨(골격/치성/기타/추가메모) 노출 금지 — 자연스러운 한 줄 서술
- ⛔ "심함"/"경미" 태그 자체를 단어로 노출하지 말고, 입력에 그 태그가 붙어 있을 때만 "큰", "비교적 약한" 등 자연 표현으로 반영
- 한 항목 한 줄 (1.5줄 이하). 입력 한 줄을 그대로 옮기지 말고, 이 항목이 *어떤 의미인지*까지 한 문장에 담을 것
- 예: 입력 "골격성 III급 (심함)" → ❌ "골격성 III급 (심함)" / ✅ "위턱과 아래턱 크기 차이가 커서 맞물림에 큰 영향을 줍니다"
- 예: 입력 "공간폐쇄 (#16)" → ✅ "오른쪽 위 첫 번째 큰어금니 자리에 빈 공간이 있어 닫아주는 처치가 필요합니다"

**2. 치료 계획** (\`<h2>치료 계획</h2>\`)
- 입력 [치료 계획 #1, #2 …] 그대로 환자용 산문으로
- 여러 개면 \`<p><strong>계획 #1: …</strong></p><p>설명</p>\` 형식
- 기간/장치/비용은 입력에 있을 때만 언급
- **🦷 1차/2차 교정 단계 규칙:**
  - 입력에 \`교정 단계: 1차\` 가 있는 계획은 본문 어딘가에 다음 두 가지를 **반드시 함께** 언급:
    1) 이 1차 교정이 다루는 **범위** (입력의 1차 처치/공간확보/장치/교정 범위 등에 근거 — 즉 1차에서 무엇을 하는지)
    2) 추후 **2차 교정의 필요성** (1차로 완결되지 않고 2차 교정으로 이어진다는 점)
  - 위 두 가지는 해당 계획 산문의 **마지막 문장** 에 묶거나, **종합 안내** 단락에 자연스럽게 녹여도 됨 (둘 중 한 곳에 한 번만 들어가면 충분 — 양쪽 중복 불필요)
  - 입력에 \`교정 단계: 2차\` 가 있으면 단계 언급 불필요. 일반 치료 계획으로 그대로 작성.

**3. 종합 안내** (\`<h2>종합 안내</h2>\` + \`<p>\`)
- 위 문제 목록과 치료 계획을 **연결한 산문 한 단락 (3~5문장)**
- "어떤 문제가 → 그래서 어떤 계획이 → 어떻게 해결하는지" 흐름
- [전체 추가 메모] 중 *비-문제 맥락* (라이프스타일·시기·동기·환자 의향 등)이 있으면 이 단락에 자연스레 녹임
- ⛔ "추가 사항" 같은 메타 라벨을 본문 단어로 쓰지 말 것

═══════════════════════════════════
**⛔ 환각 금지 (환자별 사실 — 절대 추가 금지)**
═══════════════════════════════════
1. 입력에 명시되지 않은 **부위·영역·방향** 추가 금지: "오른쪽 위", "왼쪽 아래", "구치부", "전치부", "앞쪽", "한쪽". 단, 입력 #숫자에서 변환한 부위명은 사용 가능.
2. 입력에 없는 **치아 문제**(과개교합·개방교합·반대교합·정중선 편위·총생·공간·매복치·잇몸질환 등) 추가 금지
3. 입력에 없는 **치료 옵션**(임플란트·보철·크라운·미백·라미네이트·사랑니 발치 등) 추가 금지. 단, 입력(추가 메모 포함)에 해당 단어가 있으면 허용.
4. 입력의 강조 표현("절대", "반드시", "금지", "~만", "필수")은 출력에서 **그대로 동일 강도** 유지. 약화·완곡 변환 금지.
5. 정도 수식("경미한", "심한", "약간", "살짝", "매우")은 입력에 (심함)/(경미) 태그가 있는 항목에만 사용.
6. 추측 표현 금지: "아마도", "가능성이", "~할 수도", "추정", "예상", "~로 보입니다".

═══════════════════════════════════
**✅ 적극 허용 (이전엔 막혀있던 부분 — 이제 풀어줌)**
═══════════════════════════════════
- 입력의 여러 항목을 **하나의 흐름 있는 문장**으로 묶기 ("X가 있고 Y도 있어서 ~한 상태입니다")
- 입력에 명시된 문제·치료에 대한 **일반론적 의미·중요성** 한 줄 부연 — 환자 특이 사실은 추가하지 않고 "일반적으로", "보통" 같은 일반화 표현으로
  - 예: 입력 "공간폐쇄" → 허용: "공간을 그대로 두면 옆 치아가 기울 수 있어 닫아주는 게 좋습니다" (일반론)
  - 금지: "환자분은 오른쪽 위 어금니가 …" (입력에 부위 없으면 부위 환각)
- 전문용어를 환자 친화 표현으로 풀어 쓰기 (의미 동일 유지)
- 같은 의미를 더 자연스러운 한국어로 재구성

═══════════════════════════════════
**✅ 톤 규칙 (성향 라벨은 절대 본문에 노출 금지)**
═══════════════════════════════════
⛔ 성향 라벨(꼼꼼함, 감성적, 바쁨, 불안, 의지 높음 등)을 body나 personalNote에 단어 그대로 쓰지 마시오. 성향은 문장의 상세도·어조·비유 사용 여부·설명 순서만 조절.${toneTableBlock}

특이 상황(내원 거리·시간 등)은 personalNote에 접근성 고려 문구로만 반영.

═══════════════════════════════════
**🦷 치아번호 변환 (소스에 #숫자가 남아있으면 반드시 적용)**
═══════════════════════════════════
- #16 → 오른쪽 위 첫 번째 큰어금니
- #26 → 왼쪽 위 첫 번째 큰어금니
- #36 → 왼쪽 아래 첫 번째 큰어금니
- #46 → 오른쪽 아래 첫 번째 큰어금니
- 끝자리 1=중앙 앞니, 2=옆 앞니, 3=송곳니, 4=첫 번째 작은어금니, 5=두 번째 작은어금니, 6=첫 번째 큰어금니, 7=두 번째 큰어금니, 8=사랑니
- 사분면(#10/#20/#30/#40)만 있으면 "오른쪽 위/왼쪽 위/왼쪽 아래/오른쪽 아래" 영역
- 출력에 "#숫자"가 그대로 남으면 안 됨

═══════════════════════════════════
**언어 — 100% 한글**
═══════════════════════════════════
- 한국어로 출력하되 **반드시 한글 정자체**로만 작성. **한자 금지** (단독·괄호 병기 모두 금지).
  ❌ 治療, 患者, 計劃, 案內, 問題 / "치료(治療)", "환자(患者)" 같은 한자 병기 / 한자 단독 표기
  ✅ 치료, 환자, 계획, 안내, 문제 (전부 한글)
- 영어 병기 금지. 괄호 안 영어 설명 금지.
- h2 섹션 라벨은 정확히 다음 셋 중 하나만 (다른 표기·번역·한자·영어 병기 일체 금지):
  "문제 목록" / "치료 계획" / "종합 안내"
- 라틴 문자(영어 알파벳)는 의학 약어가 입력에 명시된 경우("Class I/II/III", "Angle's Class" 등)만 그대로 허용. 그 외 보통명사 영어 사용 금지.

═══════════════════════════════════
**📦 출력 JSON 스키마 (반드시 이 형태)**
═══════════════════════════════════
{
  "body": "<h2>문제 목록</h2><ul><li>...</li><li>...</li></ul><h2>치료 계획</h2><p><strong>계획 #1: ...</strong></p><p>...</p><h2>종합 안내</h2><p>...</p>",
  "personalNote": "환자 성향/특이 상황 반영 3~5문장 맞춤 메시지 (치료 추천 근거, 안심, 다음 단계)",
  "appealPoints": [ { "title": "제목", "description": "1~2문장 설명" } ]
}

**body HTML 규칙:**
- 섹션 순서 고정: **문제 목록 → 치료 계획 → 종합 안내**
- 옛 섹션명("치성 관계", "골격 관계", "추가 사항") 사용 금지
- 입력 소스가 완전히 비어있는 섹션은 h2째 생략 (단, 종합 안내는 가능한 한 작성)
- 사용 가능 태그: \`<h2>\`, \`<p>\`, \`<ul>\`, \`<li>\`, \`<strong>\`, \`<em>\`
- \`<img>\`, \`<script>\`, \`<style>\` 절대 금지 (이미지는 사용자가 나중 삽입)
- 줄바꿈/공백 없는 한 줄 HTML 문자열

**appealPoints 규칙:**
- 치과 특장점 중 위 소스와 **직접 관련된** 것만 2~3개. 관련 없으면 빈 배열([]).

═══════════════════════════════════
**⛔ 최종 자기검수 (출력 JSON 만들기 전 반드시 통과)**
═══════════════════════════════════
1. body의 모든 부위·치료가 입력에 명시되어 있는가? (일반론 부연은 "일반적으로"/"보통" 같은 일반화 표현으로만 — 환자 특이 사실 추가는 X)
2. 입력에 없는 치아 문제·치료 옵션이 추가되지 않았는가?
3. 입력의 강조어("절대"/"반드시"/"필수")가 약화되지 않았는가?
4. 입력 (심함)/(경미) 태그 없는 항목에 정도 수식이 임의로 추가되지 않았는가?
5. "추가 사항"/"치성 관계"/"골격 관계" 같은 메타·옛 라벨이 본문에 남지 않았는가?
6. "#숫자"가 그대로 남아있지 않은가?
7. 성향 라벨(꼼꼼·바쁨·감성 등)이 본문/personalNote에 그대로 노출되지 않았는가?
8. 문제 목록이 단순 키워드 나열이 아닌 **의미 담긴 한 줄 문장** 인가?
9. 종합 안내가 단순 항목 반복이 아닌 **연결된 산문**(흐름 있는 단락) 인가?
10. 입력에 \`교정 단계: 1차\` 가 있는 계획에 대해, 본문(해당 계획 산문 마지막 또는 종합 안내) 어딘가에 **1차 범위**와 **2차 교정 필요성** 두 가지가 모두 언급되었는가? (2차 단계 계획은 해당 없음)
11. 본문 어디에도 한자(治療·患者·計劃·案內·問題 등)가 섞여 들어가지 않았는가? h2 섹션 라벨이 정확히 \`문제 목록\` / \`치료 계획\` / \`종합 안내\` 중 하나인가?

하나라도 실패하면 즉시 해당 부분 재작성 후 다시 체크. 통과 후에만 JSON 출력.${guidelinesBlock}${terminologyBlock}${strengthsBlock}`

  // 정리 탭에서 사용자가 편집한 통합 텍스트가 있으면 단일 블록으로 그대로 전달
  // (`## 골격 문제` / `## 치성 문제` / `## 치료 계획 #1` / `## 전체 추가 메모` 헤더 포함)
  const sourceBlock = (koreanSummary.combined && koreanSummary.combined.trim())
    ? koreanSummary.combined
    : (() => {
        const planLines = (koreanSummary.treatmentPlans || [])
          .map((p, i) => `계획 ${i + 1}:\n${p || '(빈 계획)'}`).join('\n\n') || '(치료 계획 없음)'
        return `### [치성 문제] (→ 문제 목록 ul로 흡수)
${koreanSummary.dental || '(비어있음)'}

### [골격 문제] (→ 문제 목록 ul로 흡수)
${koreanSummary.skeletal || '(비어있음)'}

### [기타 진단 항목] (→ 문제 목록 ul로 흡수)
${koreanSummary.etc || '(비어있음)'}

### [치료 계획] (→ 치료 계획 섹션)
${planLines}

### [전체 추가 메모] (문제성 항목은 문제 목록에, 비-문제 맥락은 종합 안내에 녹임)
${koreanSummary.overall || '(비어있음)'}`
      })()

  const userMessage = `## 입력 소스 (환자별 사실은 여기 있는 것만 사용 — 부위·치료옵션·심도 환각 금지)
※ 치아번호는 이미 환자 친화적 한글 부위명으로 변환되어 있습니다. 그대로 사용하시면 됩니다.
※ 입력 카테고리(치성/골격/기타/추가메모)는 **출력 구조에서 흡수처가 표시**되어 있습니다. 카테고리 라벨 자체는 출력에 노출하지 마시오.

${sourceBlock}

---

## 환자 성향 (문체만 조절, 내용 추가·라벨 노출 금지)
${buildStaffLines(staffForm)}

## 환자 특이 상황 (personalNote 맞춤화에만 사용)
${staffForm?.specialCircumstances || '(없음)'}

---

**최종 지시:**
출력 body HTML은 **문제 목록(ul) → 치료 계획(p) → 종합 안내(p)** 3섹션 고정 순서.
- 환자별 사실은 입력에 명시된 것만 사용 (부위·치료옵션·심도 환각 금지).
- 입력 항목들을 조합·연결한 자연 문장으로 풀어 쓰는 것은 적극 허용 — 단순 키워드 나열 ❌, 의미 담긴 한 줄 문장 ✅.
- 명시 항목에 대한 일반론적 의미·중요성 부연 허용 (단, "일반적으로"/"보통" 같은 일반화 표현으로 — 환자 특이 사실 추가 X).
- 종합 안내는 문제·치료를 연결한 한 단락 (3~5문장) 산문.`

  const response = await fetch(EDGE_FUNCTION_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: [{ parts: [{ text: userMessage }] }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 8000,
        responseMimeType: 'application/json',
        thinkingConfig: { thinkingBudget: 0 },
      },
    }),
  })

  const data = await response.json()
  if (data.error) throw new Error(data.error.message || 'Gemini API 호출 실패')

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) throw new Error('AI 응답이 비어있습니다.')

  try {
    return migrateToNewFormat(sanitize(JSON.parse(text)))
  } catch {
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (jsonMatch) return migrateToNewFormat(sanitize(JSON.parse(jsonMatch[0])))
    return getEmptyDraft()
  }
}

/**
 * 기존 body HTML에서 섹션별(h2 기준) figure/img를 수집
 * AI 재호출 시 새 body에 다시 주입하기 위함
 * 반환: { '치성 관계': ['<figure>...</figure>', '<img>'], '골격 관계': [...] }
 */
export function extractImagesBySection(html) {
  if (!html || typeof html !== 'string') return {}
  try {
    const parser = new DOMParser()
    const doc = parser.parseFromString(`<div id="root">${html}</div>`, 'text/html')
    const root = doc.getElementById('root')
    if (!root) return {}

    const result = {}
    let curTitle = '__PREAMBLE__'
    let curItems = []

    const pushIf = () => {
      if (curItems.length) {
        if (!result[curTitle]) result[curTitle] = []
        result[curTitle].push(...curItems)
      }
    }

    for (const node of Array.from(root.childNodes)) {
      if (node.nodeType === 1 && node.tagName === 'H2') {
        pushIf()
        curTitle = node.textContent.trim()
        curItems = []
        continue
      }
      if (node.nodeType !== 1) continue

      if (node.tagName === 'FIGURE') {
        curItems.push(node.outerHTML)
      } else if (node.tagName === 'IMG') {
        curItems.push(node.outerHTML)
      } else {
        // 하위에 figure/img가 있으면 꺼내기
        const innerFigs = node.querySelectorAll('figure')
        const innerImgs = node.querySelectorAll('img')
        innerFigs.forEach(f => curItems.push(f.outerHTML))
        innerImgs.forEach(img => {
          if (img.closest('figure')) return
          curItems.push(img.outerHTML)
        })
      }
    }
    pushIf()
    return result
  } catch {
    return {}
  }
}

/**
 * 새 body HTML에 이전 섹션별 이미지를 재삽입
 * - 같은 h2 타이틀이 새 body에 있으면 해당 섹션 끝에 붙임
 * - 옛 섹션명(치성 관계/골격 관계/추가 사항)은 새 섹션명(문제 목록/종합 안내)으로 자동 매핑
 * - 새 body에 없는 섹션은 맨 뒤에 h2+이미지 블록으로 추가 (분실 방지)
 */
const SECTION_MIGRATION = {
  '치성 관계': '문제 목록',
  '골격 관계': '문제 목록',
  '추가 사항': '종합 안내',
}
export function reinsertImagesBySection(newHtml, imagesBySection) {
  const rawMap = imagesBySection || {}
  // 옛 섹션명 → 새 섹션명으로 사전 머지 (이미지 분실 방지 — 옛 진단서 재생성 호환)
  const map = {}
  for (const [k, items] of Object.entries(rawMap)) {
    if (!items || !items.length) continue
    const target = SECTION_MIGRATION[k] || k
    if (!map[target]) map[target] = []
    map[target].push(...items)
  }
  const hasAny = Object.values(map).some(arr => arr && arr.length)
  if (!hasAny) return newHtml || ''

  try {
    const parser = new DOMParser()
    const doc = parser.parseFromString(`<div id="root">${newHtml || ''}</div>`, 'text/html')
    const root = doc.getElementById('root')
    if (!root) return newHtml || ''

    // h2 기준 섹션 그룹화
    const sections = []
    let cur = { title: null, nodes: [] }
    for (const node of Array.from(root.childNodes)) {
      if (node.nodeType === 1 && node.tagName === 'H2') {
        if (cur.title || cur.nodes.length) sections.push(cur)
        cur = { title: node.textContent.trim(), nodes: [] }
      } else {
        cur.nodes.push(node)
      }
    }
    if (cur.title || cur.nodes.length) sections.push(cur)

    const usedTitles = new Set()
    const rebuilt = []

    // preamble 영역(타이틀 없는 맨 앞)에는 __PREAMBLE__ 이미지 합치기
    if (sections.length && !sections[0].title) {
      const s0 = sections[0]
      const parts = s0.nodes.map(n => n.nodeType === 1 ? n.outerHTML : (n.textContent || ''))
      if (map['__PREAMBLE__']?.length) parts.push(...map['__PREAMBLE__'])
      rebuilt.push(parts.join(''))
      sections.shift()
    } else if (map['__PREAMBLE__']?.length) {
      rebuilt.push(map['__PREAMBLE__'].join(''))
    }

    for (const sec of sections) {
      const parts = []
      if (sec.title) parts.push(`<h2>${escapeHtml(sec.title)}</h2>`)
      for (const n of sec.nodes) {
        if (n.nodeType === 1) parts.push(n.outerHTML)
        else if (n.nodeType === 3) parts.push(n.textContent || '')
      }
      if (sec.title && map[sec.title]?.length) {
        parts.push(...map[sec.title])
        usedTitles.add(sec.title)
      }
      rebuilt.push(parts.join(''))
    }

    // 새 body에 없는 섹션의 이미지는 분실 방지를 위해 맨 뒤에 추가
    for (const [title, items] of Object.entries(map)) {
      if (title === '__PREAMBLE__') continue
      if (usedTitles.has(title)) continue
      if (!items?.length) continue
      rebuilt.push(`<h2>${escapeHtml(title)}</h2>` + items.join(''))
    }

    return rebuilt.join('')
  } catch {
    return newHtml || ''
  }
}

export function getEmptyDraft() {
  return {
    body: '',
    personalNote: '',
    appealPoints: [],
  }
}

// 이전 구조(skeletalRelationship 등) → 새 구조(body HTML) 변환
export function migrateToNewFormat(obj) {
  if (!obj) return getEmptyDraft()

  // 이미 새 구조면 그대로
  if (typeof obj.body === 'string') {
    return {
      body: obj.body || '',
      personalNote: obj.personalNote || '',
      appealPoints: obj.appealPoints || [],
    }
  }

  // 이전 구조 → body HTML 합성 (치성 → 골격 → 치료계획 → 추가사항)
  const parts = []
  if (obj.dentalRelationship) {
    parts.push(`<h2>치성 관계</h2><p>${escapeHtml(obj.dentalRelationship).replace(/\n\n+/g, '</p><p>').replace(/\n/g, '<br>')}</p>`)
  }
  if (obj.skeletalRelationship) {
    parts.push(`<h2>골격 관계</h2><p>${escapeHtml(obj.skeletalRelationship).replace(/\n\n+/g, '</p><p>').replace(/\n/g, '<br>')}</p>`)
  }
  if (Array.isArray(obj.treatmentOptions) && obj.treatmentOptions.length > 0) {
    const planParts = obj.treatmentOptions.map((opt, i) => {
      const lines = []
      if (opt.name) lines.push(`<p><strong>계획 #${i + 1}: ${escapeHtml(opt.name)}</strong></p>`)
      if (opt.description) lines.push(`<p>${escapeHtml(opt.description)}</p>`)
      if (opt.expectedEffect) lines.push(`<p><em>기대 효과:</em> ${escapeHtml(opt.expectedEffect)}</p>`)
      const meta = []
      if (opt.duration) meta.push(`기간: ${opt.duration}`)
      if (opt.appliance) meta.push(`장치: ${opt.appliance}`)
      if (meta.length) lines.push(`<p>${escapeHtml(meta.join(' / '))}</p>`)
      return lines.join('')
    }).join('')
    parts.push(`<h2>치료 계획</h2>${planParts}`)
  }
  if (obj.additionalNotes) {
    parts.push(`<h2>추가 사항</h2><p>${escapeHtml(obj.additionalNotes).replace(/\n\n+/g, '</p><p>').replace(/\n/g, '<br>')}</p>`)
  }

  return {
    body: parts.join(''),
    personalNote: obj.personalNote || '',
    appealPoints: obj.appealPoints || [],
  }
}

function escapeHtml(s) {
  if (typeof s !== 'string') return ''
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function stripEnglishParens(text) {
  if (!text || typeof text !== 'string') return text
  return text
    .replace(/\s*\([A-Za-z][A-Za-z\s,.\-/]*\)/g, '')
    .replace(/\s*\[[A-Za-z][A-Za-z\s,.\-/]*\]/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function sanitize(obj) {
  if (typeof obj === 'string') return stripEnglishParens(obj)
  if (Array.isArray(obj)) return obj.map(sanitize)
  if (obj && typeof obj === 'object') {
    const result = {}
    for (const [key, value] of Object.entries(obj)) {
      result[key] = sanitize(value)
    }
    return result
  }
  return obj
}
