/**
 * 모바일진단서 PC2 워커
 * ─────────────────────────────────────────────
 * 역할: Supabase ai_jobs 테이블의 pending 잡을 받아 Claude Agent SDK (Max 구독) 로 처리.
 *
 * 워커는 **도메인 로직 없음** — 순수 Claude 호출 프록시.
 *   payload = { systemPrompt, userMessage, expectJson?, model? }
 *   result   = { text }              (expectJson=false)
 *           또는 직접 파싱된 객체  (expectJson=true)
 *
 * 모든 시스템 프롬프트·도메인 룰은 dental-report 측 코드에 있음.
 * 워커가 죽거나 응답 안 주면 dental-report 가 60초 후 Gemini 폴백.
 *
 * 운영:
 *   pm2 start index.js --name dental-worker --time
 *   pm2 logs dental-worker
 */

import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import { callClaude, parseJsonReply } from './lib/claude.js'

const {
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  WORKER_ID = 'pc2-unknown',
  COMPOSE_MODEL = 'claude-sonnet-4-6',
  ANALYZE_MODEL = 'claude-sonnet-4-6',
} = process.env

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('[worker] FATAL: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 환경변수 필수')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
  realtime: { params: { eventsPerSecond: 10 } },
})

// ─────────────────────────────────────────────
// 잡 처리
// ─────────────────────────────────────────────

function pickModel(type) {
  if (type === 'analyze_patterns') return ANALYZE_MODEL
  return COMPOSE_MODEL
}

/**
 * 잡 하나를 처리. claim 실패 시 (다른 워커가 먼저 잡았으면) 무시.
 */
async function processJob(jobId) {
  // 1. claim: status pending → processing (atomic)
  const { data: claimed, error: claimErr } = await supabase
    .from('ai_jobs')
    .update({
      status: 'processing',
      worker_id: WORKER_ID,
      claimed_at: new Date().toISOString(),
      started_at: new Date().toISOString(),
    })
    .eq('id', jobId)
    .eq('status', 'pending')
    .select()
    .maybeSingle()

  if (claimErr) {
    console.warn(`[worker] claim error for ${jobId}:`, claimErr.message)
    return
  }
  if (!claimed) return // 다른 워커가 먼저 잡음 또는 이미 처리됨

  const startMs = Date.now()
  console.log(`[worker] ▶ ${claimed.type} ${jobId.slice(0, 8)}…`)

  try {
    const { systemPrompt, userMessage, expectJson = true, model: payloadModel } = claimed.payload || {}
    if (!systemPrompt || !userMessage) {
      throw new Error('payload 에 systemPrompt 와 userMessage 가 필요합니다')
    }

    const model = payloadModel || pickModel(claimed.type)
    const text = await callClaude({ systemPrompt, userMessage, model, expectJson })

    let result
    if (expectJson) {
      try { result = parseJsonReply(text) }
      catch (err) {
        throw new Error(`JSON 파싱 실패: ${err.message}\n원본: ${text.slice(0, 400)}`)
      }
    } else {
      result = { text }
    }

    const ms = Date.now() - startMs
    const { error: updErr } = await supabase
      .from('ai_jobs')
      .update({
        status: 'done',
        result,
        completed_at: new Date().toISOString(),
      })
      .eq('id', jobId)
    if (updErr) throw new Error(`결과 저장 실패: ${updErr.message}`)

    console.log(`[worker] ✓ ${claimed.type} ${jobId.slice(0, 8)} (${(ms / 1000).toFixed(1)}s)`)
  } catch (err) {
    const ms = Date.now() - startMs
    console.error(`[worker] ✗ ${claimed.type} ${jobId.slice(0, 8)} (${(ms / 1000).toFixed(1)}s):`, err.message)
    await supabase
      .from('ai_jobs')
      .update({
        status: 'error',
        error: String(err.message || err).slice(0, 2000),
        completed_at: new Date().toISOString(),
      })
      .eq('id', jobId)
  }
}

// ─────────────────────────────────────────────
// 큐 폴링 — 시작 시 적체된 pending 잡 청소
// ─────────────────────────────────────────────

async function drainPending() {
  const { data, error } = await supabase
    .from('ai_jobs')
    .select('id')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(20)
  if (error) {
    console.warn('[worker] drainPending error:', error.message)
    return
  }
  if (!data || data.length === 0) return
  console.log(`[worker] 시작 시 적체 ${data.length}건 처리 시작`)
  for (const row of data) {
    await processJob(row.id)
  }
}

// ─────────────────────────────────────────────
// stuck 잡 복구 — processing 인데 5분 이상 멈춰있으면 다시 pending 으로
// (다른 워커가 잡고 죽었거나, 이 워커가 재시작된 경우)
// ─────────────────────────────────────────────

async function recoverStuck() {
  const cutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString()
  const { data, error } = await supabase
    .from('ai_jobs')
    .update({ status: 'pending', worker_id: null, claimed_at: null, started_at: null })
    .eq('status', 'processing')
    .lt('claimed_at', cutoff)
    .select('id')
  if (error) {
    console.warn('[worker] recoverStuck error:', error.message)
    return
  }
  if (data && data.length > 0) {
    console.log(`[worker] stuck 잡 ${data.length}건 pending 복구`)
  }
}

// ─────────────────────────────────────────────
// Realtime 구독 — 새 잡 INSERT 즉시 받기
// ─────────────────────────────────────────────

function startRealtime() {
  const channel = supabase
    .channel('ai_jobs_inserts')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'ai_jobs' },
      (payload) => {
        const job = payload.new
        if (!job || job.status !== 'pending') return
        processJob(job.id).catch(err => console.error('[worker] processJob unhandled:', err))
      }
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') console.log('[worker] Realtime 구독 활성')
      else if (status === 'CHANNEL_ERROR') console.error('[worker] Realtime 채널 오류')
    })
  return channel
}

// ─────────────────────────────────────────────
// 부트
// ─────────────────────────────────────────────

console.log(`[worker] start id=${WORKER_ID} compose=${COMPOSE_MODEL} analyze=${ANALYZE_MODEL}`)

await recoverStuck()
await drainPending()
const ch = startRealtime()

// 주기적 안전망: stuck 복구 + 적체 청소 매 2분
setInterval(() => {
  recoverStuck().catch(() => {})
  drainPending().catch(() => {})
}, 2 * 60 * 1000)

// graceful shutdown
const shutdown = async (sig) => {
  console.log(`[worker] ${sig} — shutting down`)
  try { await supabase.removeChannel(ch) } catch { /* noop */ }
  process.exit(0)
}
process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
