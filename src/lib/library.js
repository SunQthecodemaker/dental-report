/**
 * 라이브러리(유사 케이스 + 강조 장점) CRUD — clinic_settings JSON에 저장.
 * 데이터 모델:
 *   treatment_cases  → { id, title, description, tags: string[], pairs: [{ before_url, after_url }] }
 *   strength_cards   → { id, title, description, tags: string[], photo_url, detail_url }
 */
import { supabase } from './supabase'

/** 태그 정규화: 앞뒤 공백 제거, # 제거, 내부 연속 공백 1칸, 빈 문자열 제외 */
export function normalizeTag(raw) {
  if (typeof raw !== 'string') return ''
  return raw.trim().replace(/^#+/, '').replace(/\s+/g, ' ').trim()
}

/** 태그 배열 정규화 + 중복 제거 (대소문자 구분 없이) */
export function normalizeTags(arr) {
  if (!Array.isArray(arr)) return []
  const seen = new Set()
  const out = []
  for (const t of arr) {
    const n = normalizeTag(t)
    if (!n) continue
    const key = n.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(n)
  }
  return out
}

/** 라이브러리 전체에서 사용 빈도 순 unique 태그 풀 추출 */
export function extractTagPool(...itemArrays) {
  const counts = new Map() // key=lowercase, value={display, count}
  for (const arr of itemArrays) {
    if (!Array.isArray(arr)) continue
    for (const item of arr) {
      for (const t of (item?.tags || [])) {
        const n = normalizeTag(t)
        if (!n) continue
        const key = n.toLowerCase()
        const cur = counts.get(key)
        if (cur) cur.count++
        else counts.set(key, { display: n, count: 1 })
      }
    }
  }
  return [...counts.values()].sort((a, b) => b.count - a.count).map(x => x.display)
}

/** 케이스/어필포인트 1건과 선택 태그 배열을 받아 매치 개수 반환 (대소문자 무시) */
export function matchCount(item, selectedTags) {
  if (!item?.tags?.length || !selectedTags?.length) return 0
  const sel = new Set(selectedTags.map(t => t.toLowerCase()))
  let n = 0
  for (const t of item.tags) {
    if (sel.has(String(t).toLowerCase())) n++
  }
  return n
}

const TREATMENT_CASES_KEY = 'treatment_cases'
const STRENGTH_CARDS_KEY = 'strength_cards'

async function loadSetting(id) {
  const { data, error } = await supabase.from('clinic_settings').select('value').eq('id', id).maybeSingle()
  if (error) throw error
  return data?.value?.items || []
}

async function saveSetting(id, items) {
  const { error } = await supabase.from('clinic_settings')
    .update({ value: { items }, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

export const loadTreatmentCases = () => loadSetting(TREATMENT_CASES_KEY)
export const saveTreatmentCases = (items) => saveSetting(TREATMENT_CASES_KEY, items)

export const loadStrengthCards = () => loadSetting(STRENGTH_CARDS_KEY)
export const saveStrengthCards = (items) => saveSetting(STRENGTH_CARDS_KEY, items)

/** 라이브러리 사진 업로드 (Supabase Storage "dental-reports/library/{prefix}/") */
export async function uploadLibraryPhoto(file, prefix) {
  const ext = (file.type.split('/')[1] || 'jpg').toLowerCase().replace('jpeg', 'jpg')
  const name = `library/${prefix}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`
  const { error } = await supabase.storage.from('dental-reports').upload(name, file, {
    contentType: file.type, cacheControl: '3600', upsert: false,
  })
  if (error) throw error
  const { data } = supabase.storage.from('dental-reports').getPublicUrl(name)
  return data.publicUrl
}

export function newCaseId() {
  return crypto.randomUUID?.() || `c_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}
