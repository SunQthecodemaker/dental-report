/**
 * Claude Agent SDK 호출 래퍼.
 *
 * Max 구독 OAuth 인증:
 *   - PC2 에서 한 번 `claude setup-token` 으로 토큰 발급
 *   - Agent SDK 가 ~/.claude/.credentials.json 또는 CLAUDE_CODE_OAUTH_TOKEN 환경변수에서 자동 로드
 *
 * 도구 사용 안 함 — 순수 텍스트 생성만.
 */

import { query } from '@anthropic-ai/claude-agent-sdk'

/**
 * @param {object} params
 * @param {string} params.systemPrompt
 * @param {string} params.userMessage
 * @param {string} [params.model='claude-sonnet-4-6']
 * @param {boolean} [params.expectJson=false]
 * @returns {Promise<string>} assistant 의 텍스트 전체
 */
export async function callClaude({ systemPrompt, userMessage, model = 'claude-sonnet-4-6', expectJson = false }) {
  const fullPrompt = expectJson
    ? `${userMessage}\n\n반드시 JSON 한 덩어리만 출력하시오. 코드블록(\`\`\`json … \`\`\`)이나 부연 설명·인사 모두 금지.`
    : userMessage

  const collected = []
  const it = query({
    prompt: fullPrompt,
    options: {
      model,
      systemPrompt,
      allowedTools: [],
      maxTurns: 1,
      permissionMode: 'bypassPermissions',
    },
  })

  for await (const msg of it) {
    if (msg.type === 'assistant' && msg.message?.content) {
      for (const block of msg.message.content) {
        if (block.type === 'text' && typeof block.text === 'string') {
          collected.push(block.text)
        }
      }
    }
  }

  const text = collected.join('').trim()
  if (!text) throw new Error('Claude 응답 비어있음')
  return text
}

/**
 * Claude 응답이 JSON 형식이라고 가정하고 파싱.
 * 코드블록·앞뒤 설명 등 박힌 경우도 best-effort 로 추출.
 */
export function parseJsonReply(text) {
  if (!text) throw new Error('빈 응답')
  const trimmed = text.trim()

  // 1) 그대로 JSON?
  try { return JSON.parse(trimmed) } catch { /* fallthrough */ }

  // 2) ```json … ``` 코드블록 추출
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
  if (fence) {
    try { return JSON.parse(fence[1]) } catch { /* fallthrough */ }
  }

  // 3) 첫 { … 마지막 } 추출
  const first = trimmed.indexOf('{')
  const last = trimmed.lastIndexOf('}')
  if (first >= 0 && last > first) {
    const candidate = trimmed.slice(first, last + 1)
    try { return JSON.parse(candidate) } catch { /* fallthrough */ }
  }

  throw new Error('JSON 파싱 실패: ' + trimmed.slice(0, 200))
}
