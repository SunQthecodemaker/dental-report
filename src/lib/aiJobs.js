import { supabase } from './supabase'

/**
 * AI 작업 큐 클라이언트
 *
 * 동작:
 *   브라우저 → ai_jobs INSERT (status='pending')
 *   PC2 워커 → Realtime 으로 받아 처리 → status='done'/'error' UPDATE
 *   브라우저 → Realtime 으로 결과 받음
 *
 * 폴백:
 *   timeoutMs 안에 PC2 워커가 응답 안 주면 fallbackFn() 호출 (Gemini 등)
 *   에러로 끝난 경우도 fallbackFn() 호출
 */

const DEFAULT_TIMEOUT_MS = 60_000

/**
 * 작업 큐에 INSERT 하고 결과 받기까지 대기.
 * fallbackFn 이 있으면 타임아웃·에러 시 그것을 실행.
 *
 * @param {string} type — 'compose' | 'analyze_patterns' | 'image_caption' | 'suggest_tags' | 'validate_guideline' | 'cleanup_guidelines'
 * @param {object} payload
 * @param {object} [opts]
 * @param {number} [opts.timeoutMs=60000]
 * @param {string} [opts.reportId]
 * @param {() => Promise<any>} [opts.fallback] — 폴백 실행기
 * @returns {Promise<any>} ai_jobs.result
 */
export async function runJobWithFallback(type, payload, opts = {}) {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, reportId, fallback } = opts

  let job
  try {
    const { data, error } = await supabase
      .from('ai_jobs')
      .insert({ type, payload, report_id: reportId || null })
      .select()
      .single()
    if (error) throw error
    job = data
  } catch (err) {
    console.warn(`[aiJobs] insert failed for type=${type}, falling back:`, err.message)
    if (fallback) return await fallback()
    throw err
  }

  try {
    const result = await waitForResult(job.id, timeoutMs)
    return result
  } catch (err) {
    console.warn(`[aiJobs] job ${job.id} (${type}) failed/timed out, falling back:`, err.message)
    if (fallback) {
      // 폴백 실행 중에도 워커가 늦게라도 처리하면 결과 누적됨 → 그대로 둠 (race 무해)
      return await fallback()
    }
    throw err
  }
}

/**
 * jobId 의 결과를 기다림. Realtime UPDATE 구독 + timeoutMs 까지.
 * 이미 done/error 인 경우 즉시 반환.
 */
export function waitForResult(jobId, timeoutMs = DEFAULT_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    let settled = false
    const finish = (fn) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      try { supabase.removeChannel(channel) } catch { /* noop */ }
      fn()
    }

    const channel = supabase
      .channel(`ai_job_${jobId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'ai_jobs', filter: `id=eq.${jobId}` },
        (payload) => {
          const next = payload.new
          if (!next) return
          if (next.status === 'done') finish(() => resolve(next.result))
          else if (next.status === 'error') finish(() => reject(new Error(next.error || 'worker error')))
        }
      )
      .subscribe(async (status) => {
        if (status !== 'SUBSCRIBED') return
        // 구독 직후 한 번 폴링 — 이미 끝나 있으면 (워커가 빠르면) 즉시 처리
        const { data } = await supabase
          .from('ai_jobs')
          .select('status, result, error')
          .eq('id', jobId)
          .maybeSingle()
        if (!data) return
        if (data.status === 'done') finish(() => resolve(data.result))
        else if (data.status === 'error') finish(() => reject(new Error(data.error || 'worker error')))
      })

    const timer = setTimeout(() => {
      finish(() => reject(new Error(`timeout after ${timeoutMs}ms`)))
    }, timeoutMs)
  })
}
