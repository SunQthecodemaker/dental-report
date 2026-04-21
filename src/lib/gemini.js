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

  const systemPrompt = `당신은 치과 상담 사진을 한 줄 한국어 캡션으로 요약하는 도우미입니다.

**사진 종류 (정확히 이 분류만 사용):**
- 파노라마 방사선 (치열 전체, 가로로 길며 흑백)
- 측모두부 방사선 (측면 두개골 실루엣, 흑백)
- 구내 사진 · 전면 (앞니 보이는 정면 교합)
- 구내 사진 · 우측 측방 (오른쪽 옆면 교합)
- 구내 사진 · 좌측 측방 (왼쪽 옆면 교합)
- 구내 사진 · 상악 교합면 (위쪽 치아 배열 위에서 본 모습)
- 구내 사진 · 하악 교합면 (아래쪽 치아 배열 위에서 본 모습)
- 전치부 근접 (앞니 확대)
- 얼굴 사진 · 정면
- 얼굴 사진 · 측면
- 기타 치과 사진

**규칙:**
- 한 줄 캡션만 출력 (마크다운·번호·따옴표 금지)
- 명확히 보이는 특이 소견이 있으면 " — [소견]"으로 덧붙임 (예: "— 16번 임플란트")
- 확신이 없으면 상위 카테고리만 ("구내 사진", "방사선 사진")
- 설명 말고 라벨만`

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
    return text.trim().replace(/^["'`]+|["'`]+$/g, '').split('\n')[0].trim()
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
 * 환각 방지 원칙:
 * - summary 텍스트에 **명시적으로 있는 내용만** 재서술
 * - 소스 외 치아 문제/치료 옵션 절대 추가 금지
 * - 비어있는 섹션은 출력에서 완전히 생략
 *
 * 출력: { body: HTML, personalNote, appealPoints }
 *   body 섹션 순서: 치성 관계 → 골격 관계 → 치료 계획 → 추가 사항
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

  const systemPrompt = `당신은 한국 치과 진단서를 환자 친화적 문장으로 **재서술**하는 AI입니다. 글을 창작하는 게 아니라 소스를 옮겨 쓰는 역할입니다.

**⛔ 절대 규칙 (위반 시 전체 출력 오답):**
1. 아래 [입력 소스]에 **글자 단위로 명시된 내용만** 사용하시오.
2. 입력에 없는 치아 문제(예: 과개교합, 개방교합, 반대교합, 정중선 편위, 총생, 공간, 매복치, 잇몸 문제 등)를 **단 한 번이라도** 언급하면 오답입니다.
3. 입력에 없는 치료(예: 임플란트, 보철, 크라운, 미백, 사랑니 발치 등)를 절대 추가 금지.
4. "아마도", "가능성이", "~할 수도 있습니다", "추정됩니다", "예상됩니다" 같은 추측 표현 금지.
5. 해당 섹션에 입력이 **비어 있으면 그 섹션 전체를 출력에서 생략**(h2 헤딩도 쓰지 말 것).
6. 치료 기간/비용/예후/장치명은 입력에 명시된 경우에만 언급.
7. 치료 계획이 여러 개면 순서대로 모두 서술(#1, #2…).

**✅ 톤 규칙 (환자 성향은 "서술 방식"만 바꿉니다 — 내용 추가·라벨 노출 모두 금지):**

⛔ 절대 금지: 성향 라벨(꼼꼼함, 감성적, 바쁨, 불안, 꼼꼼한 편, 의지 높음 등)을 본문이나 personalNote에 **단어 그대로 노출하지 마시오**. 성향은 문장의 **상세도·어조·비유 사용 여부·설명 순서**만 결정합니다. "환자분은 꼼꼼하시니…", "바쁘신 만큼…" 같은 서술은 오답입니다.${toneTableBlock}

특이 상황(내원 거리·시간 등)은 personalNote에 **접근성 고려 문구**로만 반영. 어느 쪽이든 성향 라벨 자체는 본문에 쓰지 않습니다.

**언어:** 100% 한국어. 영어 병기 금지. 괄호 안 영어 설명 금지.

**🦷 치아번호 변환 규칙 (혹시 소스에 남아있는 #숫자가 있으면 반드시 적용):**
- #16 → 오른쪽 위 첫 번째 큰어금니
- #26 → 왼쪽 위 첫 번째 큰어금니
- #36 → 왼쪽 아래 첫 번째 큰어금니
- #46 → 오른쪽 아래 첫 번째 큰어금니
- #14 → 오른쪽 위 첫 번째 작은어금니 등
- 끝자리 1=중앙 앞니, 2=옆 앞니, 3=송곳니, 4=첫 번째 작은어금니, 5=두 번째 작은어금니, 6=첫 번째 큰어금니, 7=두 번째 큰어금니, 8=사랑니
- 사분면(#10/#20/#30/#40)만 있으면 "오른쪽 위/왼쪽 위/왼쪽 아래/오른쪽 아래" 영역
- 출력에 "#숫자"가 그대로 남으면 안 됨

**출력 형식 (반드시 JSON):**
{
  "body": "<h2>치성 관계</h2><p>...</p><h2>골격 관계</h2><p>...</p><h2>치료 계획</h2><p>...</p><h2>추가 사항</h2><p>...</p>",
  "personalNote": "환자 성향/특이 상황 반영 3~5문장 맞춤 메시지 (치료 추천 근거, 안심, 다음 단계)",
  "appealPoints": [ { "title": "제목", "description": "1~2문장 설명" } ]
}

**body HTML 규칙:**
- 섹션 순서 고정: **치성 관계 → 골격 관계 → 치료 계획 → 추가 사항**
- 각 섹션은 \`<h2>섹션명</h2>\` + \`<p>문단</p>\` 여러 개로 구성
- 소스가 비어있는 섹션은 h2 자체를 생략 (예: 골격 소스 없음 → 골격 관계 블록 전체 생략)
- 치료 계획이 여러 개면 한 섹션 안에 \`<p><strong>계획 #1:</strong> ...</p><p><strong>계획 #2:</strong> ...</p>\`식 서술
- \`<img>\`, \`<script>\`, \`<style>\` 태그 절대 쓰지 말 것 (이미지는 사용자가 나중에 삽입)
- 다른 태그(ul, li, strong, em) 최소 사용
- 줄바꿈이나 공백 없는 한 줄 HTML 문자열

**appealPoints 규칙:**
- 치과 특장점 중 **위 소스와 직접 관련된** 것만 2~3개 선별
- 관련 없으면 빈 배열([])

**최종 재확인:** 출력 전에:
- body 안 모든 치과 용어/문제/치료가 입력 소스에 있는가?
- 비어있는 섹션의 h2를 지웠는가?
- "#숫자"가 남아있지 않은가?${guidelinesBlock}${terminologyBlock}${strengthsBlock}`

  const planLines = (koreanSummary.treatmentPlans || [])
    .map((p, i) => `계획 ${i + 1}:\n${p || '(빈 계획)'}`).join('\n\n') || '(치료 계획 없음)'

  const userMessage = `## 입력 소스 (아래 내용만 사용 — 외부 지식·추측·확장 모두 금지)
※ 치아번호는 이미 환자 친화적 한글 부위명으로 변환되어 있습니다. 그대로 사용하시면 됩니다.

### [치성 문제]
${koreanSummary.dental || '(비어있음 → 치성 관계 섹션 생략)'}

### [골격 문제]
${koreanSummary.skeletal || '(비어있음 → 골격 관계 섹션 생략)'}

### [치료 계획]
${planLines}

### [기타 진단 항목]
${koreanSummary.etc || '(비어있음)'}

### [전체 추가 메모]
${koreanSummary.overall || '(비어있음 → 추가 사항 섹션 생략)'}

---

## 환자 성향 (문체만 조절, 내용 추가 금지)
${buildStaffLines(staffForm)}

## 환자 특이 상황 (personalNote 맞춤화에만 사용)
${staffForm?.specialCircumstances || '(없음)'}

---

**최종 지시:**
위 입력 소스에 **명시적으로 적힌 내용만** 환자 친화적 문장으로 재서술하여 JSON으로 출력하시오.
body HTML은 **치성 → 골격 → 치료계획 → 추가사항** 순서, 비어있는 섹션은 h2째 생략.
입력에 없는 치아 문제/치료 옵션은 단 하나도 추가하지 마시오.`

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
 * - 새 body에 없는 섹션은 맨 뒤에 h2+이미지 블록으로 추가 (분실 방지)
 */
export function reinsertImagesBySection(newHtml, imagesBySection) {
  const map = imagesBySection || {}
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
