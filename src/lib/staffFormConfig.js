/**
 * 상담 폼 (StaffForm) 설정 정본.
 *
 * DB row: clinic_settings.id = 'staff_form_config'
 * value: { categories: { [key]: { label, options[] } }, sliders: { [key]: { label, min, max } } }
 *
 * 옛 코드(gemini.js)는 STAFF_KEY_LABEL 6개 키를 하드코딩해서 동적 카테고리 추가가
 * AI 프롬프트에 닿지 못했음. 본 헬퍼로 동적 라벨 매핑을 일원화.
 */
import { supabase } from './supabase'

export const DEFAULT_STAFF_FORM_CONFIG = {
  categories: {
    personality:  { label: '환자 성향', options: ['꼼꼼한 편', '감성적', '결정 빠름', '망설임 많음', '바쁜 분', '고령', '통증우려', '비발치 선호'] },
    anxiety:      { label: '불안 요소', options: ['치료 통증', '마취', '치과 공포', '부작용 우려', '치료 기간', '재발', '발치 거부감'] },
    costReaction: { label: '비용 반응', options: ['신경 안 씀', '부담 있지만 수용', '분명히 부담', '할부 문의', '결정 못함'] },
    interests:    { label: '관심사',    options: ['심미', '교정 후 인상', '빠른 치료', '최소 내원', '치아 유지', '자녀 상담', '급속교정'] },
  },
  sliders: {
    willingness:   { label: '치료 의지', min: '매우 소극적',  max: '매우 적극적' },
    understanding: { label: '이해도',    min: '설명 많이 필요', max: '잘 이해함' },
  },
}

export async function loadStaffFormConfig() {
  const { data } = await supabase
    .from('clinic_settings')
    .select('value')
    .eq('id', 'staff_form_config')
    .maybeSingle()
  const cfg = data?.value
  if (!cfg || typeof cfg !== 'object') return DEFAULT_STAFF_FORM_CONFIG
  return {
    categories: cfg.categories || DEFAULT_STAFF_FORM_CONFIG.categories,
    sliders:    cfg.sliders    || DEFAULT_STAFF_FORM_CONFIG.sliders,
  }
}

export function getCategoryLabel(config, key) {
  return config?.categories?.[key]?.label || key
}

export function getSliderLabel(config, key) {
  return config?.sliders?.[key]?.label || key
}

/**
 * 슬라이더 조건 평가. condition: ">=4" | "<=2" | "==3" | ">3" | "<5"
 * value: 환자 선택값 (1~5)
 */
export function evalSliderCondition(condition, value) {
  if (value == null || condition == null) return false
  const c = String(condition).trim()
  const v = Number(value)
  if (Number.isNaN(v)) return false
  const m = c.match(/^(>=|<=|==|=|>|<)\s*(\d+)$/)
  if (!m) return false
  const op = m[1]
  const n = Number(m[2])
  switch (op) {
    case '>=': return v >= n
    case '<=': return v <= n
    case '==':
    case '=':  return v === n
    case '>':  return v > n
    case '<':  return v < n
    default:   return false
  }
}

/**
 * 톤 규칙 1건이 환자 staffForm 선택값과 매칭되는지.
 * 신 형식: { categoryKey, optionValue?, sliderCondition? }
 * 구 형식(legacy): { trait } — staffForm 어디든 그 단어가 포함되면 매칭 (관대)
 */
export function ruleMatchesStaffForm(rule, staffForm = {}) {
  if (!rule || rule.enabled === false) return false

  if (rule.categoryKey) {
    const k = rule.categoryKey
    const v = staffForm[k]
    if (rule.optionValue) {
      return Array.isArray(v) && v.includes(rule.optionValue)
    }
    if (rule.sliderCondition) {
      return evalSliderCondition(rule.sliderCondition, v)
    }
    return false
  }

  if (rule.trait) {
    const traitLc = String(rule.trait).toLowerCase().trim()
    if (!traitLc) return false
    for (const v of Object.values(staffForm)) {
      if (Array.isArray(v) && v.some(x => String(x).toLowerCase().includes(traitLc))) return true
      if (typeof v === 'string' && v.toLowerCase().includes(traitLc)) return true
    }
    return false
  }

  return false
}
