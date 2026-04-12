import { supabase } from './supabase'

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${API_KEY}`

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

export async function generatePatientText({ chartingText, staffForm }) {
  const [corrections, settings] = await Promise.all([
    loadCorrections(),
    loadClinicSettings(),
  ])

  // 동적 프롬프트 조립
  let guidelinesBlock = ''
  if (settings.guidelines.length > 0) {
    guidelinesBlock = `\n\n**작성 지침 (반드시 준수):**\n${settings.guidelines.map((g) => `- ${g}`).join('\n')}`
  }

  let terminologyBlock = ''
  if (settings.terminology.length > 0) {
    terminologyBlock = `\n\n**용어/표현 사전 (이 변환을 반드시 적용):**\n${settings.terminology.map((t) => `- "${t.from}" → "${t.to}"`).join('\n')}`
  }

  let strengthsBlock = ''
  if (settings.strengths.length > 0) {
    strengthsBlock = `\n\n**치과 특장점 (해당 치료가 차팅에 언급되면 자연스럽게 강조):**\n${settings.strengths.map((s) => {
      let text = `- ${s.title}`
      if (s.description) text += `: ${s.description}`
      if (s.expressions) text += `\n  활용 표현 예시: "${s.expressions}"`
      return text
    }).join('\n')}`
  }

  let correctionsBlock = ''
  if (corrections.length > 0) {
    correctionsBlock = `\n\n**과거 교정 사례 (표현 스타일 참고):**\n${corrections.map((c) => `- "${c.original_term}" → "${c.corrected_term}"`).join('\n')}`
  }

  const systemPrompt = `당신은 한국 치과에서 환자용 진단서를 작성하는 AI입니다.

**언어 규칙 (최우선):**
- 모든 출력은 100% 한국어로만 작성합니다.
- 영어 병기 금지. 예: "설측교정 (Lingual Orthodontics)" → "설측교정"만 적습니다.
- 영어 의학 용어는 반드시 한국어로 번역합니다.
- 괄호 안 영어 설명, 영어 부제목, 영어 주석 모두 금지합니다.

**내용 규칙:**
- 차팅 원문에 있는 내용만 변환합니다. 차팅에 없는 내용을 절대 추가하지 마세요.
- 단, 치과 특장점에 등록된 내용은 해당 치료가 차팅에 언급될 경우 자연스럽게 포함할 수 있습니다.
- 치료 기간, 비용, 예후 등 차팅에 언급되지 않은 정보는 생략합니다.
- duration, note 필드는 차팅에 해당 정보가 있을 때만 채우고, 없으면 빈 문자열("")로 둡니다.

**톤 규칙:**
- 환자에게 직접 말하는 2인칭("~님") 톤
- 환자 성향에 따라 조절: 불안 높으면 공감+안심, 적극적이면 상세하게, 바쁜 분이면 간결하게
- 단순 나열이 아니라, 환자가 읽고 신뢰감을 느끼는 전문적이면서 따뜻한 문장을 작성합니다.

**출력 형식 (JSON):**
{
  "diagnosis": "진단 내용 (2~4문장, 한국어만)",
  "treatmentOptions": [
    { "name": "옵션명 (한국어만)", "description": "설명 (2~3문장, 한국어만)", "duration": "", "note": "" }
  ],
  "additionalNotes": "추가 사항 (없으면 빈 문자열)"
}${guidelinesBlock}${terminologyBlock}${strengthsBlock}${correctionsBlock}`

  const userMessage = `## 차팅 원문 (의사 기록)
${chartingText}

## 상담 정보 (실장 입력)
- 환자 성향: ${staffForm.personality?.join(', ') || '미입력'}
- 불안 요소: ${staffForm.anxiety?.join(', ') || '없음'}
- 비용 반응: ${staffForm.costReaction?.join(', ') || '미입력'}
- 치료 의지: ${staffForm.willingness || 3}/5
- 이해도: ${staffForm.understanding || 3}/5
- 관심사: ${staffForm.interests?.join(', ') || '미입력'}
- 추가 메모: ${staffForm.memo || '없음'}

위 정보를 바탕으로 환자 친화적인 진단서 내용을 JSON 형식으로 작성해주세요.`

  const response = await fetch(API_URL, {
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

  if (data.error) {
    throw new Error(data.error.message || 'Gemini API 호출 실패')
  }

  const content = data.candidates?.[0]?.content?.parts?.[0]?.text
  if (!content) {
    throw new Error('AI 응답이 비어있습니다.')
  }

  try {
    return sanitize(JSON.parse(content))
  } catch {
    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (jsonMatch) return sanitize(JSON.parse(jsonMatch[0]))
    return { diagnosis: content, treatmentOptions: [], additionalNotes: '' }
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
