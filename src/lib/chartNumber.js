import { supabase } from './supabase'

export function normalizeBirth(raw) {
  const digits = String(raw || '').replace(/\D/g, '')
  if (digits.length === 6) return digits
  if (digits.length === 8) return digits.slice(2)
  return digits
}

export function makeBaseChartNumber(name, birth) {
  const cleanName = String(name || '').replace(/\s/g, '')
  const cleanBirth = normalizeBirth(birth)
  if (!cleanName || cleanBirth.length !== 6) return ''
  return `${cleanName}${cleanBirth}`
}

export async function findAvailableChartNumber(name, birth) {
  const base = makeBaseChartNumber(name, birth)
  if (!base) return ''

  const { data, error } = await supabase
    .from('dental_reports')
    .select('chart_number')
    .like('chart_number', `${base}%`)

  if (error) {
    console.error('chart number lookup failed', error)
    return base
  }

  const existing = new Set((data || []).map(r => r.chart_number))
  if (!existing.has(base)) return base

  for (let i = 0; i < 26; i++) {
    const candidate = `${base}${String.fromCharCode(65 + i)}`
    if (!existing.has(candidate)) return candidate
  }
  return base
}

export async function isChartNumberTaken(chartNumber, excludeId = null) {
  if (!chartNumber) return false
  let query = supabase
    .from('dental_reports')
    .select('id', { count: 'exact', head: true })
    .eq('chart_number', chartNumber)
  if (excludeId) query = query.neq('id', excludeId)
  const { count, error } = await query
  if (error) {
    console.error('chart number check failed', error)
    return false
  }
  return (count || 0) > 0
}

export function parseChartNumber(chartNumber) {
  const m = String(chartNumber || '').match(/^(.+?)(\d{6})([A-Z]?)$/)
  if (!m) return { name: '', birth: '', suffix: '' }
  return { name: m[1], birth: m[2], suffix: m[3] || '' }
}
