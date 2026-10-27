/**
 * 디스코드 알림 — 장애를 조용히 넘기지 않기 위한 장치.
 * (2026-10: 워커가 3주 멈췄는데 Gemini 폴백이 가려서 아무도 몰랐던 사고 재발 방지)
 *
 * 게시는 같은 VPS 의 헤르메스 브릿지 래퍼(`pc-call-lord --post`)를 쓴다 — 봇 토큰을 워커가 따로 들 필요 없음.
 * 채널 = DISCORD_ALERT_CHANNEL (기본 #자동화작업).
 * 같은 key 의 알림은 THROTTLE_MS 안에 한 번만 보낸다.
 */

import { execFile } from 'node:child_process'

const POST_BIN = process.env.DISCORD_POST_BIN || '/srv/shared/agents/bin/pc-call-lord'
const CHANNEL = process.env.DISCORD_ALERT_CHANNEL || '1522490071217995847'
const THROTTLE_MS = 30 * 60 * 1000
const lastSent = new Map()

export function postDiscord(title, body) {
  return new Promise(resolve => {
    execFile(POST_BIN, ['--post', `[모바일진단서 AI] ${title}`, body, CHANNEL], { timeout: 20_000 }, err => {
      if (err) console.warn('[notify] 디스코드 게시 실패:', err.message)
      resolve()
    })
  })
}

export async function notify(key, title, body = '') {
  const now = Date.now()
  if (now - (lastSent.get(key) || 0) < THROTTLE_MS) return
  lastSent.set(key, now)

  console.warn(`[notify] ${key}: ${title} ${body}`)
  await postDiscord(title, body)
}
