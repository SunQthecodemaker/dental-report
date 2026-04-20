/**
 * 라이브러리(유사 케이스 + 강조 장점) CRUD — clinic_settings JSON에 저장.
 * 데이터 모델:
 *   treatment_cases  → { id, title, description, pairs: [{ before_url, after_url }] }
 *   strength_cards   → { id, title, description, photo_url, detail_url }
 */
import { supabase } from './supabase'

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
