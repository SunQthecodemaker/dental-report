import { supabase } from './supabase'
import { summaryWithKoreanTeeth } from './toothCode'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const EDGE_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/generate-text`

async function loadClinicSettings() {
  const { data } = await supabase.from('clinic_settings').select('*')
  const settings = { guidelines: [], terminology: [], strengths: [] }
  if (data) {
    for (const row of data) {
      if (row.id === 'writing_guidelines') settings.guidelines = row.value.items || []
      if (row.id === 'terminology') settings.terminology = row.value.items || []
      if (row.id === 'clinic_strengths') settings.strengths = row.value.items || []
    }
  }
  return settings
}

export async function saveCorrections(originalText, editedText) {
  if (!originalText || !editedText || originalText === editedText) return
  const origSentences = originalText.split(/[.。]\s*/).filter(Boolean)
  const editSentences = editedText.split(/[.。]\s*/).filter(Boolean)
  const corrections = []
  const len = Math.min(origSentences.length, editSentences.length)
  for (let i = 0; i < len; i++) {
    if (origSentences[i].trim() !== editSentences[i].trim()) {
      corrections.push({
        original_term: origSentences[i].trim(),
        corrected_term: editSentences[i].trim(),
        context: 'AI생성 텍스트 수동 교정',
      })
    }
  }
  if (corrections.length > 0) {
    await supabase.from('charting_corrections').insert(corrections)
  }
}

function summaryIsEmpty(summary) {
  if (!summary) return true
  const plans = (summary.treatmentPlans || []).filter(Boolean)
  return !summary.skeletal && !summary.dental && !summary.etc && plans.length === 0 && !summary.overall
}

function buildStaffLines(staffForm = {}) {
  const lines = []
  for (const key of ['personality', 'anxiety', 'costReaction', 'interests']) {
    const arr = staffForm[key]
    if (Array.isArray(arr) && arr.length > 0) {
      lines.push(`- ${key}: ${arr.join(', ')}`)
    }
  }
  for (const key of ['willingness', 'understanding']) {
    if (typeof staffForm[key] === 'number') {
      lines.push(`- ${key}: ${staffForm[key]}/5`)
    }
  }
  return lines.length > 0 ? lines.join('\n') : '(성향 정보 없음)'
}

/**
 * 진단서 본문 생성 — 정리된 소스(summary) + 환자 성향(staffForm) → 환자용 문장
 *
 * 환각 방지 원칙:
 * - summary 텍스트에 **명시적으로 있는 내용만** 재서술
 * - 소스 외 치아 문제/치료 옵션 절대 추가 금지
 * - 빈 섹션은 빈 문자열로 둠
 */
export async function composeReport({ summary, staffForm }) {
  if (summaryIsEmpty(summary)) {
    return getEmptyDraft()
  }

  // 치아번호(#16, #10: 4번 등)를 환자 친화적 한글 부위명으로 1차 치환
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
    strengthsBlock = `\n\n**치과 특장점 (appealPoints에만 활용. 이 중 소스와 직접 관련된 것만 선별):**\n${settings.strengths.map((s) => {
      const content = typeof s === 'string' ? s : s.title || ''
      return `- ${content}`
    }).join('\n')}`
  }

  const systemPrompt = `당신은 한국 치과 진단서를 환자 친화적 문장으로 **재서술**하는 AI입니다. 글을 창작하는 게 아니라 소스를 옮겨 쓰는 역할입니다.

**⛔ 절대 규칙 (위반 시 전체 출력 오답):**
1. 아래 [입력 소스]에 **글자 단위로 명시된 내용만** 사용하시오.
2. 입력에 없는 치아 문제(예: 과개교합, 개방교합, 반대교합, 정중선 편위, 총생, 공간, 매복치, 잇몸 문제 등)를 **단 한 번이라도** 언급하면 오답입니다.
3. 입력에 없는 치료(예: 임플란트, 보철, 크라운, 미백, 사랑니 발치 등)를 절대 추가 금지.
4. "아마도", "가능성이", "~할 수도 있습니다", "추정됩니다", "예상됩니다" 같은 추측 표현 금지.
5. 해당 섹션에 입력이 **비어 있으면 반드시 빈 문자열("")로 출력**. 무리해서 채우지 마시오.
6. 치료 기간/비용/예후/장치명은 입력에 명시된 경우에만 언급.
7. 입력의 구조를 유지: 치료 계획 #1 → treatmentOptions[0], 치료 계획 #2 → treatmentOptions[1] 등 1:1 매핑.

**✅ 톤 규칙 (환자 성향 반영 — 내용은 추가하지 않고 표현만 조절):**
- 감성적 → 따뜻하고 공감하는 표현
- 꼼꼼한 편 → 근거와 이유 포함
- 바쁜 분 → 핵심만 짧고 명확
- 불안 요소 있으면 → 해당 부분에 안심 문구 (새 내용 아님, 기존 내용 재표현)
- 비용 부담 있으면 → 가치 중심 표현
- 치료 의지 1~2 → 부드럽게 권유
- 치료 의지 4~5 → 구체적 다음 단계
- 이해도 1~2 → 비유와 쉬운 표현
- 이해도 4~5 → 전문적이고 구체적
- 특이 상황에 내원 여건(거리/시간 등) 있으면 → personalNote에 접근성 고려 문구

**언어:** 100% 한국어. 영어 병기 금지. 괄호 안 영어 설명 금지.

**🦷 치아번호 변환 규칙 (혹시 소스에 남아있는 #숫자가 있으면 반드시 적용):**
- #16 → 오른쪽 위 첫 번째 큰어금니
- #26 → 왼쪽 위 첫 번째 큰어금니
- #36 → 왼쪽 아래 첫 번째 큰어금니
- #46 → 오른쪽 아래 첫 번째 큰어금니
- #14 → 오른쪽 위 첫 번째 작은어금니, #24 → 왼쪽 위 ..., #34/#44 같은 방식
- 끝자리 1=중앙 앞니, 2=옆 앞니, 3=송곳니, 4=첫 번째 작은어금니, 5=두 번째 작은어금니, 6=첫 번째 큰어금니, 7=두 번째 큰어금니, 8=사랑니
- 사분면(#10, #20, #30, #40)만 있으면 "오른쪽 위/왼쪽 위/왼쪽 아래/오른쪽 아래" 영역으로
- 출력 텍스트에 "#숫자"가 그대로 남으면 안 됨

**출력 형식 (반드시 JSON, problemList/treatmentGoals는 포함하지 말 것):**
{
  "skeletalRelationship": "골격 문제 소스를 환자용 2인칭 문장으로 재서술 (1~3문장). 소스 비어있으면 \\"\\"",
  "dentalRelationship": "치성 문제 소스를 환자용 문장으로 재서술 (1~4문장). 소스 비어있으면 \\"\\"",
  "treatmentOptions": [
    {
      "name": "치료 계획 개요 한 줄",
      "description": "치료 계획 소스를 환자용 2~3문장으로 재서술",
      "expectedEffect": "소스에 있으면 기재, 없으면 \\"\\"",
      "duration": "소스에 있으면 기재, 없으면 \\"\\"",
      "appliance": "소스에 있으면 기재, 없으면 \\"\\""
    }
  ],
  "additionalNotes": "기타 + 전체 메모 합쳐 환자용으로 정리. 없으면 \\"\\"",
  "personalNote": "환자 성향/특이 상황 반영 3~5문장 맞춤 메시지 (치료 추천 근거, 안심, 다음 단계)",
  "appealPoints": [
    { "title": "제목", "description": "1~2문장 설명" }
  ]
}

**Do/Don't 예시:**
입력 [골격 문제]: "- 전후방 골격 관계: Class II (심함)\\n- 상악 위치: 전돌"
✅ Good: "전후방 골격 관계가 Class II 상태이며 심한 편으로, 상악이 앞쪽으로 많이 나와 있는 경향이 관찰됩니다."
❌ Bad: "Class II 골격에 과개교합이 동반됩니다." (과개교합은 소스에 없음 → 금지)
❌ Bad: "정중선 편위도 약간 보입니다." (소스에 없음 → 금지)

입력 [치성 문제]: "- Angle's Class 우측: II\\n- Angle's Class 좌측: II"
✅ Good: "상하악 구치부 교합이 좌우 모두 Class II 관계로 맞물려 있어 조정이 필요합니다."
❌ Bad: "총생과 돌출이 관찰됩니다." (소스에 없음 → 금지)

입력 [치료 계획 #1]: "- 교정 단계: 2차\\n- 교정 범위: 전체\\n- 발치: #10 4번, #20 4번\\n- 악궁확장: MARPE"
✅ Good: name="상악 소구치 발치 + MARPE + 2차 전체 교정", description="상악 좌우 소구치(#10, #20의 4번)를 발치하고, 상악궁을 MARPE로 확장한 뒤 2차 고정식 교정을 진행하는 전체 교정 계획입니다."
❌ Bad: description에 "고정식 장치 외에 투명 교정도 가능합니다" (소스에 없음 → 금지)

**appealPoints 규칙:**
- 치과 특장점 중 **위 소스와 직접 관련된** 것만 2~3개 선별.
- 관련 없는 특장점을 억지로 끼우지 마시오.
- 관련된 게 없으면 빈 배열([])로 두시오.

**최종 재확인:** 출력하기 전 스스로 검증하시오:
- 출력에 등장하는 모든 치과 용어/문제/치료 옵션이 입력 소스에 있는가?
- 없는 것이 하나라도 있으면 제거하시오.${guidelinesBlock}${terminologyBlock}${strengthsBlock}`

  const planLines = (koreanSummary.treatmentPlans || [])
    .map((p, i) => `계획 ${i + 1}:\n${p || '(빈 계획)'}`).join('\n\n') || '(치료 계획 없음)'

  const userMessage = `## 입력 소스 (아래 내용만 사용 — 외부 지식·추측·확장 모두 금지)
※ 치아번호는 이미 환자 친화적 한글 부위명으로 변환되어 있습니다. 그대로 사용하시면 됩니다.

### [골격 문제]
${koreanSummary.skeletal || '(비어있음 → skeletalRelationship은 빈 문자열로)'}

### [치성 문제]
${koreanSummary.dental || '(비어있음 → dentalRelationship은 빈 문자열로)'}

### [기타 진단 항목]
${koreanSummary.etc || '(비어있음)'}

### [치료 계획]
${planLines}

### [전체 추가 메모]
${koreanSummary.overall || '(비어있음)'}

---

## 환자 성향 (문체만 조절, 내용 추가 금지)
${buildStaffLines(staffForm)}

## 환자 특이 상황 (personalNote 맞춤화에만 사용)
${staffForm?.specialCircumstances || '(없음)'}

---

**최종 지시:**
위 입력 소스에 **명시적으로 적힌 내용만** 환자 친화적 문장으로 재서술하여 JSON으로 출력하시오.
입력에 없는 치아 문제/치료 옵션은 **단 하나도** 추가하지 마시오.
비어있는 섹션은 반드시 빈 문자열("")로 두시오.`

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

export function getEmptyDraft() {
  return {
    skeletalRelationship: '',
    dentalRelationship: '',
    problemList: [],
    treatmentGoals: [],
    treatmentOptions: [],
    additionalNotes: '',
    personalNote: '',
    appealPoints: [],
  }
}

export function migrateToNewFormat(obj) {
  if (!obj) return getEmptyDraft()
  return {
    ...getEmptyDraft(),
    ...obj,
    // problemList / treatmentGoals는 더 이상 사용하지 않음 — 항상 빈 배열로 강제
    problemList: [],
    treatmentGoals: [],
    treatmentOptions: obj.treatmentOptions || [],
    appealPoints: obj.appealPoints || [],
  }
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
