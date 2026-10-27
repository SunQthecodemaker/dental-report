/**
 * 텔레그램 알림 — 장애를 조용히 넘기지 않기 위한 장치.
 * (2026-10: 워커가 3주 멈췄는데 Gemini 폴백이 가려서 아무도 몰랐던 사고 재발 방지)
 *
 * 같은 key 의 알림은 THROTTLE_MS 안에 한 번만 보낸다. 토큰이 없으면 콘솔에만 남긴다.
 */

const { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID } = process.env
const THROTTLE_MS = 30 * 60 * 1000
const lastSent = new Map()

export async function notify(key, text) {
  const now = Date.now()
  if (now - (lastSent.get(key) || 0) < THROTTLE_MS) return
  lastSent.set(key, now)

  console.warn(`[notify] ${key}: ${text}`)
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return
  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: `[모바일진단서 AI] ${text}` }),
    })
  } catch (err) {
    console.warn('[notify] telegram 전송 실패:', err.message)
  }
}
