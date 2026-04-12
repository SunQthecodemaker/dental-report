import { supabase } from './supabase'

const API_KEY = import.meta.env.VITE_MINIMAX_API_KEY
const TOKEN_PLAN_KEY = import.meta.env.VITE_MINIMAX_TOKEN_PLAN_KEY
const API_URL = 'https://api.minimaxi.chat/v1/text/chatcompletion_v2'

// 저장된 교정 사례를 불러와서 프롬프트에 포함
async function loadCorrections() {
  const { data } = await supabase
    .from('charting_corrections')
    .select('original_term, corrected_term')
    .order('created_at', { ascending: false })
    .limit(30)
  return data || []
}

// 사용자가 수정한 내용을 교정 사례로 저장
export async function saveCorrections(originalText, editedText) {
  if (!originalText || !editedText || originalText === editedText) return

  // 문장 단위로 비교해서 달라진 부분만 저장
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
  const corrections = await loadCorrections()

  let correctionsBlock = ''
  if (corrections.length > 0) {
    correctionsBlock = `\n\n## 과거 교정 사례 (이 표현을 참고하세요)
${corrections.map((c) => `- "${c.original_term}" → "${c.corrected_term}"`).join('\n')}`
  }

  const systemPrompt = `당신은 치과 진단서를 작성하는 전문 의료 커뮤니케이션 AI입니다.

규칙:
1. 의학 약어와 전문 용어를 환자가 이해할 수 있는 쉬운 한국어로 변환합니다.
2. 환자 성향에 따라 톤을 조절합니다:
   - 불안 높음 + 이해도 낮음 → 공감 중심, 매우 쉬운 용어, 안심 표현
   - 적극적 + 이해도 높음 → 상세하고 구체적인 설명
   - 감성적 → 따뜻하고 배려하는 톤
   - 바쁜 분 → 핵심만 간결하게
3. 출력 형식은 JSON으로:
   {
     "diagnosis": "오늘의 진단 내용 (2~4문장)",
     "treatmentOptions": [
       { "name": "옵션명", "description": "설명 (2~3문장)", "duration": "예상 기간", "note": "참고사항" }
     ],
     "additionalNotes": "함께 알아두실 사항 (2~3문장)"
   }
4. 환자에게 직접 말하는 2인칭("~님") 톤을 사용합니다.
5. 각 섹션은 2-4문장으로 간결하게 작성합니다.
6. 과거 교정 사례가 있으면 그 표현 스타일을 참고해서 더 정확하게 변환합니다.
7. **절대 한자(漢字)나 중국어를 사용하지 마세요.** 모든 텍스트는 100% 순수 한글과 영어만 사용합니다. 예: "齒" → "치아", "矯正" → "교정".`

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
${correctionsBlock}

위 정보를 바탕으로 환자 친화적인 진단서 내용을 JSON 형식으로 작성해주세요.`

  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'MiniMax-M1',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      token_plan_key: TOKEN_PLAN_KEY,
      temperature: 0.7,
      max_tokens: 2000,
    }),
  })

  const data = await response.json()

  if (data.base_resp?.status_code !== 0) {
    throw new Error(data.base_resp?.status_msg || 'API 호출 실패')
  }

  const content = data.choices[0].message.content

  const jsonMatch = content.match(/\{[\s\S]*\}/)
  if (jsonMatch) {
    return JSON.parse(jsonMatch[0])
  }

  return { diagnosis: content, treatmentOptions: [], additionalNotes: '' }
}
