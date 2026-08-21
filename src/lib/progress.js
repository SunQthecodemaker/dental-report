/**
 * 단계별 진행 상황 판정.
 *
 * 주치의 · 상담자 · 발송자가 서로 다른 PC 에서 같은 환자를 연다.
 * 그래서 "지금 내가 몇 번째 화면을 보고 있나"(Editor 의 step 상태)는
 * 진행도의 근거가 될 수 없다 — 진단서를 열면 누구나 1단계에서 시작하기 때문에
 * 이미 다 끝난 환자도 전부 미완료로 보인다.
 *
 * 여기서는 오직 **저장된 데이터**만 보고 판정한다.
 *   'done'    완료 — 진하게
 *   'partial' 작성 중 — 중간 톤
 *   'empty'   미시작 — 흐릿하게
 */

export const STEP_DEFS = [
  { num: 1, label: '진단 & 치료 계획', short: '진단' },
  { num: 2, label: '상담 관리',        short: '상담' },
  { num: 3, label: '초안',             short: '초안' },
  { num: 4, label: '케이스 · 어필포인트', short: '케이스' },
  { num: 5, label: '진단서 디자이너',   short: '디자인' },
]

export const STATUS_TONE = {
  done:    { color: '#6a9b7a', opacity: 1,    text: '완료' },
  partial: { color: '#d9a441', opacity: 0.85, text: '작성 중' },
  empty:   { color: '#d1d5db', opacity: 0.45, text: '미시작' },
}

const STAFF_DEFAULT_SLIDER = 3

function hasText(v) {
  return typeof v === 'string' && v.trim().length > 0
}

function hasAny(v) {
  if (Array.isArray(v)) return v.length > 0
  if (typeof v === 'string') return v.trim().length > 0
  if (typeof v === 'boolean') return v === true
  if (typeof v === 'number') return true
  return false
}

/** HTML 본문에서 실제 글자가 있는지 (빈 <p><br></p> 를 내용으로 세지 않으려고) */
function htmlHasText(html) {
  if (typeof html !== 'string') return false
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .trim().length > 0
}

/** 진단 탭 한 섹션(skeletal/dental/etc)에 입력이 있는지 */
function diagnosisSectionFilled(section) {
  if (!section || typeof section !== 'object') return false
  return Object.entries(section).some(([key, val]) => {
    // _severity / _severe 는 항목을 고른 뒤 붙는 메타라 단독으로는 입력이 아니다
    if (key.endsWith('_severity') || key.endsWith('_severe')) return false
    return hasAny(val)
  })
}

/** 치료계획 옵션 중 하나라도 실제로 채워졌는지 */
function treatmentPlansFilled(plans) {
  if (!Array.isArray(plans)) return false
  return plans.some(p => {
    if (!p || typeof p !== 'object') return false
    return hasAny(p.goal) || hasAny(p.scope) || hasAny(p.phase)
      || hasAny(p.primary) || hasAny(p.txEtc) || hasAny(p.memo) || hasAny(p.duration)
      || hasAny(p.expansion) || p.stripping === true
      || hasAny(p.distalQuads)
      || hasAny(p.ext_10) || hasAny(p.ext_20) || hasAny(p.ext_30) || hasAny(p.ext_40)
  })
}

function step1Status(report) {
  const cf = report?.clinical_form
  if (!cf) return 'empty'
  const dx = diagnosisSectionFilled(cf.skeletal) || diagnosisSectionFilled(cf.dental) || diagnosisSectionFilled(cf.etc)
  const tx = treatmentPlansFilled(cf.treatmentPlans) || hasText(cf.treatmentMemo)
  if (dx && tx) return 'done'
  if (dx || tx || hasText(cf.summary?.combined)) return 'partial'
  return 'empty'
}

function step2Status(report) {
  const sf = report?.staff_form
  if (!sf) return 'empty'
  // 성향/불안/비용반응/관심사 태그가 이 단계의 본체다.
  const tagged = hasAny(sf.personality) || hasAny(sf.anxiety) || hasAny(sf.costReaction) || hasAny(sf.interests)
  // 슬라이더를 옮겼거나 메모를 남긴 것만으로는 "본 흔적"일 뿐 완료로 보지 않는다.
  const touched = hasText(sf.specialCircumstances) || hasText(sf.memo)
    || (typeof sf.willingness === 'number' && sf.willingness !== STAFF_DEFAULT_SLIDER)
    || (typeof sf.understanding === 'number' && sf.understanding !== STAFF_DEFAULT_SLIDER)
  if (tagged) return 'done'
  if (touched) return 'partial'
  return 'empty'
}

function step3Status(report) {
  const sec = report?.sections
  if (!sec || !htmlHasText(sec.body)) return 'empty'
  // AI 가 써 준 원본 그대로면 아직 아무도 읽고 손보지 않았다는 뜻 — 발송 전 검토가 남았다.
  if (typeof sec.aiDraftBody === 'string' && sec.aiDraftBody === sec.body) return 'partial'
  return 'done'
}

function step4Status(report) {
  const cases = report?.selected_case_ids
  const strengths = report?.selected_strength_ids
  if (hasAny(cases) || hasAny(strengths)) return 'done'
  // AI 추천만 돌려두고 아무것도 고르지 않은 상태
  if (report?.tag_suggestions) return 'partial'
  return 'empty'
}

function step5Status(report) {
  if (report?.progress_stage === 'done') return 'done'
  // 저장(링크 생성) 전이라도 디자이너에서 사진을 붙였으면 손을 댄 것으로 본다
  if (Array.isArray(report?.photos) && report.photos.length > 0) return 'partial'
  return 'empty'
}

/** 5단계 상태 배열 — [{ num, label, short, status }] */
export function getStepStatuses(report) {
  const fns = [step1Status, step2Status, step3Status, step4Status, step5Status]
  return STEP_DEFS.map((def, i) => ({ ...def, status: fns[i](report) }))
}

/** 지금 이어서 해야 할 단계 (완료되지 않은 첫 단계). 전부 끝났으면 null */
export function getNextStep(statuses) {
  return statuses.find(s => s.status !== 'done') || null
}

/** 마우스 올렸을 때 보여줄 한 줄 요약 */
export function describeProgress(statuses) {
  return statuses.map(s => `${s.num}. ${s.label} — ${STATUS_TONE[s.status].text}`).join('\n')
}

// ── progress_stage(대시보드 배지) 계산 ────────────────────────────────
// 예전엔 자동저장이 "지금 보고 있는 화면 번호"로 이 값을 덮어썼다.
// 그래서 3단계까지 끝난 환자를 발송자가 열어 1단계를 잠깐 보기만 해도
// 배지가 뒤로 물러난 채 저장되고, Realtime 으로 다른 PC 까지 그 후퇴가 퍼졌다.
// 이제는 데이터에서 계산하고, 계산 결과가 낮아져도 기존 값 아래로는 내리지 않는다.

const STAGE_ORDER = ['registered', 'diagnosis', 'draft', 'consultation', 'finalizing', 'done']

/** 완료된 단계 수 → progress_stage */
export function deriveStage(statuses) {
  if (statuses[4].status === 'done') return 'done'
  let stage = 'registered'
  if (statuses[0].status !== 'empty') stage = 'diagnosis'
  if (statuses[1].status !== 'empty') stage = 'draft'
  if (statuses[2].status !== 'empty') stage = 'consultation'
  if (statuses[3].status !== 'empty' || statuses[4].status !== 'empty') stage = 'finalizing'
  return stage
}

/** 두 stage 중 더 진행된 쪽 (진행도는 되돌아가지 않는다) */
export function maxStage(a, b) {
  const ia = STAGE_ORDER.indexOf(a)
  const ib = STAGE_ORDER.indexOf(b)
  if (ia < 0) return b
  if (ib < 0) return a
  return ia >= ib ? a : b
}
