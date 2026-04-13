import { supabase } from './supabase'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const EDGE_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/generate-text`

async function loadCorrections() {
  const { data } = await supabase
    .from('charting_corrections')
    .select('original_term, corrected_term')
    .order('created_at', { ascending: false })
    .limit(30)
  return data || []
}

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

/**
 * Step 1: 초안 생성 — 차팅 → 새 섹션 구조 (톤 중립, 내용 중심)
 */
export async function generateDraft({ chartingText }) {
  const [corrections, settings] = await Promise.all([
    loadCorrections(),
    loadClinicSettings(),
  ])

  let terminologyBlock = ''
  if (settings.terminology.length > 0) {
    terminologyBlock = `\n\n**용어/표현 사전 (이 변환을 반드시 적용):**\n${settings.terminology.map((t) => `- "${t.from}" → "${t.to}"`).join('\n')}`
  }

  let strengthsBlock = ''
  if (settings.strengths.length > 0) {
    strengthsBlock = `\n\n**치과 특장점 (해당 내용이 차팅에 관련되면 자연스럽게 반영):**\n${settings.strengths.map((s) => {
      const content = typeof s === 'string' ? s : s.title || ''
      return `- ${content}`
    }).join('\n')}`
  }

  let correctionsBlock = ''
  if (corrections.length > 0) {
    correctionsBlock = `\n\n**과거 교정 사례 (표현 스타일 참고):**\n${corrections.map((c) => `- "${c.original_term}" → "${c.corrected_term}"`).join('\n')}`
  }

  const systemPrompt = `당신은 한국 치과에서 환자용 진단서 초안을 작성하는 AI입니다.
이 단계에서는 **내용 정확성과 구조화**에만 집중하세요. 환자 맞춤 톤 조절은 다음 단계에서 합니다.

**언어 규칙:**
- 모든 출력은 100% 한국어로만 작성합니다.
- 영어 병기 금지. 괄호 안 영어 설명, 영어 부제목, 영어 주석 모두 금지합니다.

**내용 규칙:**
- 차팅 원문에 있는 내용만 변환합니다. 차팅에 없는 내용을 절대 추가하지 마세요.
- 치과 특장점에 등록된 내용은 해당 치료가 차팅에 언급될 경우 자연스럽게 포함할 수 있습니다.
- 치료 기간, 비용, 예후 등 차팅에 언급되지 않은 정보는 생략합니다.
- 빈 필드는 빈 문자열("")로 둡니다.

**톤:**
- 전문적이고 중립적인 설명체 ("~입니다", "~됩니다").
- 환자에게 읽히는 문서이므로 알기 쉬운 표현을 사용합니다.
- 감정적 표현이나 설득 문구는 넣지 않습니다 (다음 단계에서 추가됩니다).

**출력 형식 (JSON):**
{
  "skeletalRelationship": "골격(뼈, 악골) 관련 분석 내용. 1~3문장. 해당 없으면 빈 문자열",
  "dentalRelationship": "치아 자체 문제(배열, 교합, 총생 등) 관련 분석 내용. 1~4문장. 해당 없으면 빈 문자열",
  "problemList": [
    { "text": "문제 설명 (1문장)", "severity": "high 또는 mid" }
  ],
  "treatmentGoals": [
    { "problemRef": 1, "goal": "치료 목표 (1문장)", "detail": "상세 설명 (선택)" }
  ],
  "treatmentOptions": [
    {
      "name": "옵션명 (예: 상악 소구치 발치 + 고정식 교정)",
      "description": "설명 (2~3문장)",
      "expectedEffect": "기대 효과 (1~2문장, 해당 없으면 빈 문자열)",
      "duration": "예상 기간 (해당 없으면 빈 문자열)",
      "appliance": "장치 종류 (해당 없으면 빈 문자열)"
    }
  ],
  "additionalNotes": "추가 사항 (없으면 빈 문자열)"
}

**규칙:**
- problemList: 주요 문제는 "high", 부수적 문제는 "mid". 최소 1개 이상.
- treatmentGoals: problemRef는 problemList 배열의 1-based 인덱스. 문제 번호와 1:1 매핑.
- treatmentOptions: 옵션이 여러 개면 각각의 기대 효과를 명시.
- skeletalRelationship, dentalRelationship: 차팅에 해당 내용이 없으면 빈 문자열로.${terminologyBlock}${strengthsBlock}${correctionsBlock}`

  const userMessage = `## 차팅 원문 (의사 기록)
${chartingText}

위 차팅을 환자가 이해할 수 있는 진단서 내용으로 변환해주세요. JSON 형식으로 출력합니다.`

  const response = await fetch(EDGE_FUNCTION_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: [{ parts: [{ text: userMessage }] }],
      generationConfig: {
        temperature: 0.5,
        maxOutputTokens: 8000,
        responseMimeType: 'application/json',
        thinkingConfig: { thinkingBudget: 0 },
      },
    }),
  })

  const data = await response.json()
  if (data.error) throw new Error(data.error.message || 'Gemini API 호출 실패')

  const content = data.candidates?.[0]?.content?.parts?.[0]?.text
  if (!content) throw new Error('AI 응답이 비어있습니다.')

  try {
    return migrateToNewFormat(sanitize(JSON.parse(content)))
  } catch {
    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (jsonMatch) return migrateToNewFormat(sanitize(JSON.parse(jsonMatch[0])))
    return getEmptyDraft()
  }
}

/**
 * Step 3: 톤 변환 — 편집된 내용 + 환자 성향 → 맞춤형 표현 + personalNote 생성
 */
export async function refineContent({ content, staffForm }) {
  const settings = await loadClinicSettings()

  let guidelinesBlock = ''
  if (settings.guidelines.length > 0) {
    guidelinesBlock = `\n\n**작성 지침 (반드시 준수):**\n${settings.guidelines.map((g) => `- ${g}`).join('\n')}`
  }

  let strengthsBlock = ''
  if (settings.strengths.length > 0) {
    strengthsBlock = `\n\n**치과 특장점 (personalNote나 appealPoints에 활용):**\n${settings.strengths.map((s) => {
      const c = typeof s === 'string' ? s : s.title || ''
      return `- ${c}`
    }).join('\n')}`
  }

  const staffLines = []
  for (const [key, val] of Object.entries(staffForm)) {
    if (key === 'memo') continue
    if (Array.isArray(val) && val.length > 0) {
      staffLines.push(`- ${key}: ${val.join(', ')}`)
    } else if (typeof val === 'number') {
      staffLines.push(`- ${key}: ${val}/5`)
    }
  }
  if (staffForm.memo) staffLines.push(`- 추가 메모: ${staffForm.memo}`)

  const systemPrompt = `당신은 치과 진단서의 톤과 표현을 환자 맞춤형으로 다듬는 AI입니다.

**핵심 원칙:**
- 입력된 내용의 **의미와 구조(섹션, 옵션 순서, 항목 수)를 절대 변경하지 마세요.**
- 용어, 문장 표현, 톤만 환자 성향에 맞게 조절합니다.
- 새로운 의학적 내용을 추가하거나, 기존 내용을 삭제하지 마세요.

**톤 규칙:**
- 환자에게 직접 말하는 2인칭 톤으로 변환
- 성향이 "감성적"이면 → 따뜻하고 공감하는 표현
- 성향이 "바쁜 분"이면 → 핵심만 짧고 명확하게
- 성향이 "꼼꼼한 편"이면 → 근거와 이유를 포함한 상세 설명
- 불안 요소가 있으면 → 해당 불안에 대한 안심 문구 포함
- 비용 부담이 있으면 → 가치 중심 표현
- 치료 의지 낮으면(1~2) → 부드럽게 권유
- 치료 의지 높으면(4~5) → 구체적 다음 단계 안내
- 이해도 낮으면(1~2) → 비유와 쉬운 표현
- 이해도 높으면(4~5) → 전문적이고 구체적 설명

**personalNote 생성:**
- 입력의 personalNote가 비어 있으면 새로 생성합니다.
- 환자 성향(상담 정보)을 반영하여 3~5문장의 맞춤 메시지를 작성합니다.
- 치료 옵션 중 추천 근거, 환자가 신경 쓸 부분에 대한 안심, 다음 단계 안내 등.
- 이미 내용이 있으면 톤만 조절합니다.

**appealPoints 생성:**
- 입력의 appealPoints가 비어 있으면, 치과 특장점 중 이 케이스와 관련된 것 2~3개를 선별하여 생성합니다.
- 각 항목: { "title": "제목", "description": "1~2문장 설명" }
- 이미 내용이 있으면 톤만 조절합니다.

**언어:** 100% 한국어. 영어 병기 금지.

**출력 형식:** 입력과 동일한 JSON 구조. personalNote와 appealPoints를 추가/보강.
{
  "skeletalRelationship": "...",
  "dentalRelationship": "...",
  "problemList": [...],
  "treatmentGoals": [...],
  "treatmentOptions": [...],
  "additionalNotes": "...",
  "personalNote": "환자 맞춤 메시지 (3~5문장)",
  "appealPoints": [
    { "title": "...", "description": "..." }
  ]
}${guidelinesBlock}${strengthsBlock}`

  const userMessage = `## 원본 내용 (사용자가 편집 완료한 내용)
${JSON.stringify(content, null, 2)}

## 상담 정보 (환자 성향) — 이 정보에 맞춰 톤과 표현을 변환하세요
${staffLines.length > 0 ? staffLines.join('\n') : '입력 없음'}

위 내용의 구조와 의미는 유지하면서, 상담 정보에 맞는 톤으로 다듬고, personalNote와 appealPoints를 생성해주세요.`

  const response = await fetch(EDGE_FUNCTION_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: [{ parts: [{ text: userMessage }] }],
      generationConfig: {
        temperature: 0.7,
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
    return sanitize(JSON.parse(text))
  } catch {
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (jsonMatch) return sanitize(JSON.parse(jsonMatch[0]))
    return content
  }
}

// 빈 초안 템플릿
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

// 이전 형식(diagnosis 배열/문자열) → 새 형식으로 변환
export function migrateToNewFormat(obj) {
  if (!obj) return getEmptyDraft()
  // 이미 새 형식이면 그대로
  if ('skeletalRelationship' in obj || 'problemList' in obj) {
    return {
      ...getEmptyDraft(),
      ...obj,
      problemList: obj.problemList || [],
      treatmentGoals: obj.treatmentGoals || [],
      treatmentOptions: obj.treatmentOptions || [],
      appealPoints: obj.appealPoints || [],
    }
  }
  // 이전 형식 변환
  const skeletal = Array.isArray(obj.diagnosis)
    ? (obj.diagnosis.find(d => d.category === '골격문제')?.content || '')
    : ''
  const dental = Array.isArray(obj.diagnosis)
    ? (obj.diagnosis.find(d => d.category === '치성문제')?.content || '')
    : (typeof obj.diagnosis === 'string' ? obj.diagnosis : '')

  return {
    ...getEmptyDraft(),
    skeletalRelationship: skeletal,
    dentalRelationship: dental,
    treatmentOptions: (obj.treatmentOptions || []).map(o => ({
      name: o.name || '',
      description: o.description || '',
      expectedEffect: '',
      duration: o.duration || '',
      appliance: '',
    })),
    additionalNotes: obj.additionalNotes || '',
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
