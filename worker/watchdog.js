/**
 * 워커 감시 — systemd 타이머가 10분마다 실행 (dental-worker-watchdog.timer).
 *
 * 워커 프로세스가 죽거나 멈추면 워커 안의 알림도 같이 죽는다. 그래서 바깥에서
 * "최근 1시간 안에 들어왔는데 3분 넘게 아무도 안 집어 간 잡"이 있는지 보고 텔레그램으로 알린다.
 * 같은 알림은 STAMP 파일로 1시간에 한 번만.
 */

import 'dotenv/config'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID } = process.env
const STAMP = join(dirname(fileURLToPath(import.meta.url)), '.watchdog-last-alert')
const REALERT_MS = 60 * 60 * 1000

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const now = Date.now()
const { count, error } = await supabase
  .from('ai_jobs')
  .select('id', { count: 'exact', head: true })
  .eq('status', 'pending')
  .lt('created_at', new Date(now - 3 * 60 * 1000).toISOString())
  .gt('created_at', new Date(now - 60 * 60 * 1000).toISOString())

if (error) {
  console.error('[watchdog] 조회 실패:', error.message)
  process.exit(1)
}

const last = existsSync(STAMP) ? Number(readFileSync(STAMP, 'utf8')) || 0 : 0
if (count > 0 && now - last > REALERT_MS) {
  const text = `[모바일진단서 AI] 워커가 잡을 안 집어 갑니다 (3분 넘은 대기 ${count}건). VPS 에서 systemctl status dental-worker 확인 필요`
  console.warn('[watchdog]', text)
  if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID) {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text }),
    }).catch(err => console.error('[watchdog] telegram 실패:', err.message))
  }
  writeFileSync(STAMP, String(now))
} else {
  console.log(`[watchdog] ok (stuck=${count})`)
}
