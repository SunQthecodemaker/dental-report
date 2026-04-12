const API_KEY = import.meta.env.VITE_MINIMAX_API_KEY
const TOKEN_PLAN_KEY = import.meta.env.VITE_MINIMAX_TOKEN_PLAN_KEY
const API_URL = 'https://api.minimaxi.chat/v1/text/chatcompletion_v2'

export async function generatePatientText({ chartingText, staffForm }) {
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
     "diagnosis": "오늘의 진단 내용",
     "treatmentOptions": [
       { "name": "옵션명", "description": "설명", "duration": "기간", "note": "참고사항" }
     ],
     "additionalNotes": "함께 알아두실 사항"
   }
4. 환자에게 직접 말하는 2인칭("~님") 톤을 사용합니다.
5. 각 섹션은 2-4문장으로 간결하게 작성합니다.`

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

  // JSON 블록 추출
  const jsonMatch = content.match(/\{[\s\S]*\}/)
  if (jsonMatch) {
    return JSON.parse(jsonMatch[0])
  }

  return { diagnosis: content, treatmentOptions: [], additionalNotes: '' }
}
