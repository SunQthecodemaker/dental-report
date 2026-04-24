/**
 * 진단 · 치료계획 폼 항목 설정 (clinic_settings 테이블의 JSON으로 저장)
 *
 *  - diagnosis_form_config:  Page 1 (진단) 섹션/항목
 *  - treatment_plan_config:  Page 2 (치료계획) 1차 그룹 + 2차 옵션
 *
 * DB row 가 없으면 아래 DEFAULT_* 값을 그대로 사용 (읽기 전용 fallback).
 * 설정 페이지에서 수정하면 upsert 되어 이후 모든 PC에서 반영됨.
 */
import { supabase } from './supabase'

/* ─────────────────────── 진단 폼 기본값 ─────────────────────── */

export const DEFAULT_DIAGNOSIS_CONFIG = {
  sections: [
    {
      key: 'skeletal',
      label: '골격문제',
      color: '#7c3aed',
      items: [
        { key: 'skeletalClass',    label: '전후방 골격 관계', type: 'radio',    options: ['Class I', 'Class II', 'Class III'], severe: true },
        { key: 'maxillaPosition',  label: '상악 위치',        type: 'checkbox', options: ['전돌(과잉)', '후퇴(부족)'], severe: true },
        { key: 'mandiblePosition', label: '하악 위치',        type: 'checkbox', options: ['전돌(과잉)', '후퇴(부족)'], severe: true },
        { key: 'verticalPattern',  label: '수직적 관계 (안모)', type: 'checkbox', options: ['장안모', '단안모'], severe: true },
        { key: 'asymmetry',        label: '골격 비대칭',      type: 'checkbox', options: ['하악 좌측 편위', '하악 우측 편위'], severe: true },
        { key: 'transverse',       label: '상하악 너비 차이',  type: 'checkbox', options: ['있음'], severe: true },
      ],
    },
    {
      key: 'dental',
      label: '치성문제',
      color: '#2563eb',
      items: [
        { key: 'angleRight',        label: "Angle's Class 우측", type: 'radio',    options: ['I', 'II', 'III'], severe: false },
        { key: 'angleLeft',         label: "Angle's Class 좌측", type: 'radio',    options: ['I', 'II', 'III'], severe: false },
        { key: 'midlineDeviation',  label: '정중선 편위',       type: 'checkbox', options: ['있음'], severe: true },
        { key: 'spaceUpper',        label: '공간평가 — 상악',   type: 'radio',    options: ['총생', '공간'], severe: true },
        { key: 'spaceLower',        label: '공간평가 — 하악',   type: 'radio',    options: ['총생', '공간'], severe: true },
        { key: 'anteriorRelation',  label: '전치 관계',        type: 'checkbox', options: ['개방교합', '과개교합', '반대교합', '절단 교합', '돌출'], severe: true },
        { key: 'upperIncisorAngle', label: '상악 전치 각도',    type: 'checkbox', options: ['순측 경사', '설측 경사'], severe: true },
        { key: 'lowerIncisorAngle', label: '하악 전치 각도',    type: 'checkbox', options: ['순측 경사', '설측 경사'], severe: true },
        { key: 'posteriorRelation', label: '구치 관계',        type: 'checkbox', options: ['반대교합', '가위교합'], severe: true },
      ],
    },
    {
      key: 'etc',
      label: '기타',
      color: '#059669',
      items: [
        { key: 'lipProtrusion',    label: '입술 돌출감',  type: 'radio',         options: ['돌출', '후퇴'], severe: true },
        { key: 'gummySmile',       label: '전치 노출도',  type: 'radio',         options: ['과잉(잇몸노출)', '부족(하전치노출)'], severe: true },
        { key: 'wisdomTeeth',      label: '사랑니',       type: 'checkbox',      options: ['#18', '#28', '#38', '#48'], severe: false },
        { key: 'tmj',              label: '턱관절 (TMJ)', type: 'checkbox',      options: ['통증', '개구제한', '소리', '과두흡수'], severe: false },
        { key: 'periodontal',      label: '치주 상태',    type: 'checkbox',      options: ['치은염', '치주염'], severe: true },
        { key: 'oralHygiene',      label: '구강위생상태', type: 'radio',         options: ['양호', '보통', '불량'], severe: false },
        { key: 'caries',           label: '충치 (우식)',  type: 'checkbox_text', options: ['우식 활성도 높음'], textPlaceholder: '치아번호 (예: #16, #26)', severe: false },
        { key: 'shortRoot',        label: '짧은 치근',    type: 'text',          placeholder: '치아번호 기재 (예: #12, #22)', severe: true },
        { key: 'oralHabit',        label: '구강 악습관',  type: 'text',          placeholder: '내용 기재' },
        { key: 'systemicDisease',  label: '전신질환',     type: 'text',          placeholder: '내용 기재' },
      ],
    },
  ],
}

/* ─────────────────────── 치료 계획 폼 기본값 ─────────────────────── */

export const DEFAULT_TREATMENT_CONFIG = {
  phaseOptions: ['1차', '2차'],
  scopeOptions: ['전체', '부분'],
  phase1Groups: [
    { key: 'muscleGrowth',    label: '근기능 / 골격 성장치료', options: ['프리올소', '구내 고정식 장치', '가철식 장치', '구외 장치'] },
    { key: 'archExpansion',   label: '악궁확장',              options: ['악궁확장 — 고정식', '악궁확장 — 가철식'] },
    { key: 'arrangement',     label: '치아 배열 / 조절',       options: ['앞니 배열', '어금니 조절'] },
    { key: 'spaceManagement', label: '공간 관리',             options: ['연속 발치술', '공간 만들기', '공간 유지'] },
    { key: 'phase1Etc',       label: '기타',                 options: ['기타 장치 (Halterman, Nance 등)', '잇몸 수술', '성장 검사 및 재평가'] },
  ],
  phase2: {
    expansion:  ['Expansion', 'RPE', 'MARPE', 'SARPE'],
    txEtc:      ['매복치', '잇몸수술', '악교정 수술'],
    extraction: ['4번', '5번', '기타'],
  },
}

/* ─────────────────────── Load / Save ─────────────────────── */

const DIAG_KEY = 'diagnosis_form_config'
const TX_KEY   = 'treatment_plan_config'

export async function loadDiagnosisConfig() {
  const { data } = await supabase.from('clinic_settings').select('value').eq('id', DIAG_KEY).maybeSingle()
  const cfg = data?.value
  if (!cfg || !Array.isArray(cfg.sections) || cfg.sections.length === 0) return DEFAULT_DIAGNOSIS_CONFIG
  return cfg
}

export async function loadTreatmentConfig() {
  const { data } = await supabase.from('clinic_settings').select('value').eq('id', TX_KEY).maybeSingle()
  const cfg = data?.value
  if (!cfg || !Array.isArray(cfg.phase1Groups)) return DEFAULT_TREATMENT_CONFIG
  return cfg
}

export async function loadClinicalFormConfig() {
  const [diag, tx] = await Promise.all([loadDiagnosisConfig(), loadTreatmentConfig()])
  return { diagnosis: diag, treatment: tx }
}

async function upsertSetting(id, value) {
  const { error } = await supabase
    .from('clinic_settings')
    .upsert({ id, value, updated_at: new Date().toISOString() }, { onConflict: 'id' })
  if (error) throw error
}

export const saveDiagnosisConfig = (cfg) => upsertSetting(DIAG_KEY, cfg)
export const saveTreatmentConfig = (cfg) => upsertSetting(TX_KEY, cfg)
