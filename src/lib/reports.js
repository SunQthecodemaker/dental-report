import { supabase } from './supabase'
import { findAvailableChartNumber, isChartNumberTaken } from './chartNumber'
import { getSessionId, getPcLabel } from './session'

export const PROGRESS_STAGES = {
  registered:    { label: '환자 등록',   color: '#9ca3af' },
  diagnosis:     { label: '진단 작성중', color: '#eab308' },
  draft:         { label: '초안 편집중', color: '#f97316' },
  consultation:  { label: '상담 입력중', color: '#3b82f6' },
  finalizing:    { label: '최종 편집중', color: '#8b5cf6' },
  done:          { label: '완료',         color: '#10b981' },
}

export const STEP_TO_STAGE = {
  1: 'diagnosis',
  2: 'draft',
  3: 'consultation',
  4: 'finalizing',
}

export async function createPatient({ name, birth, suffix = '', cc = '', phone = '', chartNumber }) {
  const finalChart = chartNumber || (await findAvailableChartNumber(name, birth))
  if (!finalChart) throw new Error('차트번호를 생성할 수 없습니다.')

  if (await isChartNumberTaken(finalChart)) {
    throw new Error(`차트번호 ${finalChart}는 이미 등록되어 있습니다.`)
  }

  const { data, error } = await supabase
    .from('dental_reports')
    .insert({
      chart_number: finalChart,
      patient_name: name,
      patient_birth: birth,
      suffix: suffix || null,
      cc: cc || null,
      phone: phone || null,
      progress_stage: 'registered',
      consult_date: new Date().toISOString().split('T')[0],
      sections: {},
      photos: [],
      modules: [],
    })
    .select()
    .single()

  if (error) throw error
  return data
}

export async function getByChartNumber(chartNumber) {
  const { data, error } = await supabase
    .from('dental_reports')
    .select('*')
    .eq('chart_number', chartNumber)
    .maybeSingle()
  if (error) throw error
  return data
}

export async function listReports({ search = '', dateRange = 'all', hideCompleted = true } = {}) {
  let query = supabase
    .from('dental_reports')
    .select('*')
    .order('updated_at', { ascending: false })
    .limit(200)

  if (search) {
    query = query.or(`patient_name.ilike.%${search}%,chart_number.ilike.%${search}%`)
  }
  if (hideCompleted) {
    query = query.neq('progress_stage', 'done')
  }

  if (dateRange !== 'all') {
    const now = new Date()
    let from
    if (dateRange === 'today') {
      from = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    } else if (dateRange === 'week') {
      from = new Date(now); from.setDate(from.getDate() - 7)
    } else if (dateRange === 'month') {
      from = new Date(now); from.setMonth(from.getMonth() - 1)
    }
    if (from) query = query.gte('updated_at', from.toISOString())
  }

  const { data, error } = await query
  if (error) throw error
  return data || []
}

export async function updateReport(id, patch) {
  const { data, error } = await supabase
    .from('dental_reports')
    .update(patch)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function acquireLock(id, stepKey) {
  return updateReport(id, {
    locked_by: getSessionId(),
    locked_at: new Date().toISOString(),
    current_step: stepKey,
  })
}

export async function releaseLock(id) {
  return updateReport(id, {
    locked_by: null,
    locked_at: null,
    current_step: null,
  })
}

export function isLockStale(lockedAt) {
  if (!lockedAt) return true
  const age = Date.now() - new Date(lockedAt).getTime()
  return age > 5 * 60 * 1000
}

export function isOtherPcEditing(report, currentStep) {
  if (!report?.locked_by || !report?.locked_at) return false
  if (report.locked_by === getSessionId()) return false
  if (isLockStale(report.locked_at)) return false
  if (currentStep && report.current_step && report.current_step !== currentStep) return false
  return true
}

export function getEditorLabel() {
  return getPcLabel()
}
