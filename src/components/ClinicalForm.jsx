/**
 * ClinicalForm — Step 1: 의사 입력
 * page 1: 진단 (골격/치성/기타 문제목록)
 * page 2: 치료계획 (옵션 카드 + 메모)
 * (환자정보는 대시보드에서 입력 — ClinicalForm에서 중복 제거)
 */
import { useState } from 'react'

/* ═══ 항목 정의 ═══ */

const SKELETAL_ITEMS = [
  { key: 'skeletalClass', label: '전후방 골격 관계', type: 'radio', options: ['Class I', 'Class II', 'Class III'], severe: true },
  { key: 'maxillaPosition', label: '상악 위치', type: 'checkbox', options: ['전돌(과잉)', '후퇴(부족)'], severe: true },
  { key: 'mandiblePosition', label: '하악 위치', type: 'checkbox', options: ['전돌(과잉)', '후퇴(부족)'], severe: true },
  { key: 'verticalPattern', label: '수직적 관계 (안모)', type: 'checkbox', options: ['장안모', '단안모'], severe: true },
  { key: 'asymmetry', label: '골격 비대칭', type: 'checkbox', options: ['하악 좌측 편위', '하악 우측 편위'], severe: true },
  { key: 'transverse', label: '상하악 너비 차이', type: 'checkbox', options: ['있음'], severe: true },
]

const DENTAL_ITEMS = [
  { key: 'angleRight', label: "Angle's Class 우측", type: 'radio', options: ['I', 'II', 'III'], severe: false },
  { key: 'angleLeft', label: "Angle's Class 좌측", type: 'radio', options: ['I', 'II', 'III'], severe: false },
  { key: 'midlineDeviation', label: '정중선 편위', type: 'checkbox', options: ['있음'], severe: true },
  { key: 'spaceUpper', label: '공간평가 — 상악', type: 'radio', options: ['총생', '공간'], severe: true },
  { key: 'spaceLower', label: '공간평가 — 하악', type: 'radio', options: ['총생', '공간'], severe: true },
  { key: 'anteriorRelation', label: '전치 관계', type: 'checkbox', options: ['개방교합', '과개교합', '반대교합', '돌출'], severe: true },
  { key: 'upperIncisorAngle', label: '상악 전치 각도', type: 'checkbox', options: ['순측 경사', '설측 경사'], severe: true },
  { key: 'lowerIncisorAngle', label: '하악 전치 각도', type: 'checkbox', options: ['순측 경사', '설측 경사'], severe: true },
  { key: 'posteriorRelation', label: '구치 관계', type: 'checkbox', options: ['반대교합', '가위교합'], severe: true },
]

const ETC_ITEMS = [
  { key: 'lipProtrusion', label: '입술 돌출감', type: 'radio', options: ['심함', '경미함'], severe: false },
  { key: 'gummySmile', label: 'Gummy smile', type: 'radio', options: ['심함', '경미함'], severe: false },
  { key: 'wisdomTeeth', label: '사랑니', type: 'checkbox', options: ['#18', '#28', '#38', '#48'], severe: false },
  { key: 'tmj', label: '턱관절 (TMJ)', type: 'checkbox', options: ['통증', '개구제한', '소리', '과두흡수'], severe: false },
  { key: 'periodontal', label: '치주 상태', type: 'checkbox', options: ['치은염', '치주염'], severe: true },
  { key: 'oralHygiene', label: '구강위생상태', type: 'radio', options: ['양호', '보통', '불량'], severe: false },
  { key: 'caries', label: '충치 (우식)', type: 'checkbox_text', options: ['우식 활성도 높음'], textPlaceholder: '치아번호 (예: #16, #26)', severe: false },
  { key: 'shortRoot', label: '짧은 치근', type: 'text', placeholder: '치아번호 기재 (예: #12, #22)', severe: true },
  { key: 'oralHabit', label: '구강 악습관', type: 'text', placeholder: '내용 기재' },
  { key: 'systemicDisease', label: '전신질환', type: 'text', placeholder: '내용 기재' },
]

const DIAGNOSIS_SECTIONS = [
  { key: 'skeletal', label: '골격문제', items: SKELETAL_ITEMS, color: '#7c3aed' },
  { key: 'dental', label: '치성문제', items: DENTAL_ITEMS, color: '#2563eb' },
  { key: 'etc', label: '기타', items: ETC_ITEMS, color: '#059669' },
]

const DEFAULT_TX_ETC_ITEMS = ['매복치', '잇몸수술', '악교정 수술']

function getEmptyTxOption() {
  return {
    goal: '',          // 치료 목표
    scope: '',         // '전체' | '부분'
    phase: '',         // '1차' | '2차'
    // 1차
    primary: [],       // ['근기능치료 (프리올소)', '악궁확장', '앞니배열']
    // 2차
    ext_10: '', ext_20: '', ext_30: '', ext_40: '',  // 발치 사분면
    expansion: '',     // '' | 'Expansion' | 'RPE' | 'MARPE' | 'SARPE'
    distalization: false,
    distalExtraction: '',
    stripping: false,
    // 기타
    txEtc: [],
    memo: '',          // 기타 메모
    duration: '',
  }
}

export function getEmptyClinicalForm() {
  return {
    // page 1: 진단
    skeletal: { memo: '' },
    dental: { memo: '' },
    etc: { memo: '' },
    // page 2: 치료계획 (목표 → 계획이 한 세트)
    treatmentPlans: [getEmptyTxOption()],
    treatmentMemo: '',
    // page 3: 정리 (사용자 편집 반영, 없으면 자동 생성)
    summary: { skeletal: '', dental: '', etc: '', treatmentPlans: [], overall: '' },
  }
}

const ALL_SECTIONS = [
  { key: 'skeletal', label: '골격 문제', items: SKELETAL_ITEMS },
  { key: 'dental',   label: '치성 문제', items: DENTAL_ITEMS },
  { key: 'etc',      label: '기타',      items: ETC_ITEMS },
]

function itemValueToText(section, item, value) {
  const v = value[section]?.[item.key]
  const severe = value[section]?.[`${item.key}_severe`]
  const severeTag = severe ? ' (심함)' : ''
  if (item.type === 'text') return v ? `${item.label}: ${v}${severeTag}` : null
  if (item.type === 'radio') return v ? `${item.label}: ${v}${severeTag}` : null
  if (item.type === 'checkbox') {
    if (Array.isArray(v) && v.length > 0) return `${item.label}: ${v.join(', ')}${severeTag}`
    return null
  }
  if (item.type === 'checkbox_text') {
    const arr = Array.isArray(v) ? v : []
    const text = value[section]?.[`${item.key}_text`]
    if (arr.length === 0 && !text) return null
    const parts = [...arr]
    if (text) parts.push(text)
    return `${item.label}: ${parts.join(', ')}${severeTag}`
  }
  return null
}

function sectionToText(sectionKey, clinicalForm) {
  const def = ALL_SECTIONS.find(s => s.key === sectionKey)
  if (!def) return ''
  const lines = []
  for (const item of def.items) {
    const line = itemValueToText(sectionKey, item, clinicalForm)
    if (line) lines.push(`- ${line}`)
  }
  const memo = clinicalForm[sectionKey]?.memo
  if (memo) lines.push(`- 특이사항: ${memo}`)
  return lines.join('\n')
}

function planToText(plan, idx) {
  const lines = []
  if (plan.goal) lines.push(`목표: ${plan.goal}`)
  if (plan.scope) lines.push(`교정 범위: ${plan.scope}`)
  if (plan.phase) lines.push(`교정 단계: ${plan.phase}`)
  if ((plan.primary || []).length > 0) lines.push(`1차 처치: ${plan.primary.join(', ')}`)
  const ext = ['ext_10', 'ext_20', 'ext_30', 'ext_40'].map(k => {
    const v = plan[k]
    if (!v) return null
    const extraText = plan[`${k}_text`]
    const suffix = extraText ? ` (${extraText})` : ''
    return `${k.replace('ext_', '#')}: ${v}${suffix}`
  }).filter(Boolean)
  if (ext.length > 0) lines.push(`발치: ${ext.join(' / ')}`)
  if (plan.expansion) lines.push(`악궁확장: ${plan.expansion}`)
  if (plan.distalization) lines.push(`후방이동: 필요${plan.distalExtraction ? ` (${plan.distalExtraction})` : ''}`)
  if (plan.stripping) lines.push(`치간삭제: 필요`)
  if ((plan.txEtc || []).length > 0) lines.push(`기타: ${plan.txEtc.join(', ')}`)
  if (plan.duration) lines.push(`예상 기간: ${plan.duration}`)
  if (plan.memo) lines.push(`추가: ${plan.memo}`)
  return lines.length > 0 ? lines.map(l => `- ${l}`).join('\n') : ''
}

export function buildAutoSummary(clinicalForm) {
  return {
    skeletal: sectionToText('skeletal', clinicalForm),
    dental: sectionToText('dental', clinicalForm),
    etc: sectionToText('etc', clinicalForm),
    treatmentPlans: (clinicalForm.treatmentPlans || []).map(planToText),
    overall: clinicalForm.treatmentMemo || '',
  }
}

export default function ClinicalForm({ value, onChange, page, onPageChange }) {
  const updateField = (section, key, val) => {
    onChange({
      ...value,
      [section]: { ...value[section], [key]: val },
    })
  }

  const updateSevere = (section, key, severe) => {
    onChange({
      ...value,
      [section]: { ...value[section], [`${key}_severe`]: severe },
    })
  }

  const toggleCheckbox = (section, key, option) => {
    const current = value[section]?.[key] || []
    const updated = current.includes(option)
      ? current.filter(o => o !== option)
      : [...current, option]
    updateField(section, key, updated)
  }

  const setRadio = (section, key, option) => {
    const current = value[section]?.[key]
    updateField(section, key, current === option ? '' : option)
  }

  const hasValue = (section, key, item) => {
    const val = value[section]?.[key]
    if (item.type === 'text') return val && val.length > 0
    if (item.type === 'radio') return val && val.length > 0
    if (item.type === 'checkbox' || item.type === 'checkbox_text') return Array.isArray(val) && val.length > 0
    return false
  }

  const updateTopLevel = (key, val) => {
    onChange({ ...value, [key]: val })
  }

  // 치료계획 관리
  const plans = value.treatmentPlans || []
  const updatePlan = (idx, field, val) => {
    const p = [...plans]
    p[idx] = { ...p[idx], [field]: val }
    updateTopLevel('treatmentPlans', p)
  }
  const togglePlanArray = (idx, field, val) => {
    const p = [...plans]
    const current = p[idx][field] || []
    p[idx] = {
      ...p[idx],
      [field]: current.includes(val) ? current.filter(v => v !== val) : [...current, val],
    }
    updateTopLevel('treatmentPlans', p)
  }
  const addPlan = () => {
    updateTopLevel('treatmentPlans', [...plans, getEmptyTxOption()])
  }
  const removePlan = (idx) => {
    updateTopLevel('treatmentPlans', plans.filter((_, i) => i !== idx))
  }

  return (
    <div>
      {/* 페이지 탭 */}
      <div style={tabBarStyle}>
        {[
          { p: 1, label: '진단' },
          { p: 2, label: '치료 계획' },
          { p: 3, label: '정리' },
        ].map(({ p, label }) => (
          <button
            key={p}
            onClick={() => onPageChange(p)}
            style={tabStyle(p === page)}
          >
            <span style={tabNumStyle(p === page)}>{p}</span>
            {label}
          </button>
        ))}
      </div>

      {/* Page 1: 진단 */}
      {page === 1 && (
        <div style={pageStyle}>
          {DIAGNOSIS_SECTIONS.map(section => (
            <div key={section.key} style={sectionStyle}>
              <SectionHeader label={section.label} color={section.color} />

              {section.items.map(item => (
                <div key={item.key} style={itemRowStyle}>
                  <div style={labelStyle}>{item.label}</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px', flex: 1 }}>
                    {item.type === 'text' ? (
                      <input
                        type="text"
                        value={value[section.key]?.[item.key] || ''}
                        onChange={e => updateField(section.key, item.key, e.target.value)}
                        placeholder={item.placeholder}
                        style={textInputStyle}
                      />
                    ) : item.type === 'checkbox_text' ? (
                      <>
                        {item.options.map(opt => {
                          const selected = (value[section.key]?.[item.key] || []).includes(opt)
                          return (
                            <button
                              key={opt}
                              onClick={() => toggleCheckbox(section.key, item.key, opt)}
                              style={chipStyle(selected, section.color)}
                            >
                              {opt}
                            </button>
                          )
                        })}
                        <input
                          type="text"
                          value={value[section.key]?.[`${item.key}_text`] || ''}
                          onChange={e => updateField(section.key, `${item.key}_text`, e.target.value)}
                          placeholder={item.textPlaceholder}
                          style={{ ...textInputStyle, minWidth: '160px', maxWidth: '240px' }}
                        />
                      </>
                    ) : item.type === 'radio' ? (
                      item.options.map(opt => {
                        const selected = value[section.key]?.[item.key] === opt
                        return (
                          <button
                            key={opt}
                            onClick={() => setRadio(section.key, item.key, opt)}
                            style={chipStyle(selected, section.color)}
                          >
                            {opt}
                          </button>
                        )
                      })
                    ) : (
                      item.options.map(opt => {
                        const selected = (value[section.key]?.[item.key] || []).includes(opt)
                        return (
                          <button
                            key={opt}
                            onClick={() => toggleCheckbox(section.key, item.key, opt)}
                            style={chipStyle(selected, section.color)}
                          >
                            {opt}
                          </button>
                        )
                      })
                    )}

                    {item.severe && hasValue(section.key, item.key, item) && (
                      <button
                        onClick={() => updateSevere(section.key, item.key, !value[section.key]?.[`${item.key}_severe`])}
                        style={severeStyle(value[section.key]?.[`${item.key}_severe`])}
                      >
                        심함
                      </button>
                    )}
                  </div>
                </div>
              ))}

              <div style={{ marginTop: '12px' }}>
                <textarea
                  value={value[section.key]?.memo || ''}
                  onChange={e => updateField(section.key, 'memo', e.target.value)}
                  placeholder="특이사항 입력..."
                  style={memoStyle}
                  rows={2}
                />
              </div>
            </div>
          ))}
          <NavButtons page={page} onPageChange={onPageChange} />
        </div>
      )}

      {/* Page 2: 치료계획 */}
      {page === 2 && (
        <div style={pageStyle}>
          {plans.map((plan, idx) => (
            <div key={idx} style={sectionStyle}>
              {/* 헤더 */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', paddingBottom: '10px', borderBottom: '2px solid #b5976a20' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ width: '4px', height: '20px', borderRadius: '2px', background: '#b5976a' }} />
                  <span style={{ fontSize: '15px', fontWeight: '700', color: '#b5976a' }}>치료 계획 #{idx + 1}</span>
                </div>
                {plans.length > 1 && (
                  <button onClick={() => removePlan(idx)} style={removeBtn}>삭제</button>
                )}
              </div>

              {/* 치료 목표 */}
              <FieldRow label="치료 목표">
                <textarea
                  value={plan.goal || ''}
                  onChange={e => updatePlan(idx, 'goal', e.target.value)}
                  placeholder="이 치료계획의 목표를 입력하세요"
                  style={{ ...fieldInputStyle, minHeight: '50px', resize: 'vertical' }}
                  rows={2}
                />
              </FieldRow>

              {/* 교정 단계 (먼저) */}
              <div style={itemRowStyle}>
                <div style={labelStyle}>교정 단계</div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  {['1차', '2차'].map(p => (
                    <button key={p} onClick={() => updatePlan(idx, 'phase', plan.phase === p ? '' : p)} style={chipStyle(plan.phase === p, '#b5976a')}>{p} 교정</button>
                  ))}
                </div>
              </div>

              {/* 단계 선택 시 → 교정 범위 + 세부 */}
              {plan.phase && (
                <>
                  <div style={itemRowStyle}>
                    <div style={labelStyle}>교정 범위</div>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      {['전체', '부분'].map(s => (
                        <button key={s} onClick={() => updatePlan(idx, 'scope', plan.scope === s ? '' : s)} style={chipStyle(plan.scope === s, '#b5976a')}>{s} 교정</button>
                      ))}
                    </div>
                  </div>

                  {/* 1차 */}
                  {plan.phase === '1차' && (
                    <div style={subSectionStyle}>
                      {/* 근기능 / 골격 성장치료 */}
                      <div style={itemRowStyle}>
                        <div style={{ ...labelStyle, width: '160px' }}>근기능 / 골격 성장치료</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', flex: 1 }}>
                          {['프리올소', '구내 고정식 장치', '착탈식 장치', '구외 장치'].map(item => (
                            <button key={item} onClick={() => togglePlanArray(idx, 'primary', item)} style={chipStyle((plan.primary || []).includes(item), '#7c3aed')}>{item}</button>
                          ))}
                        </div>
                      </div>

                      {/* 악궁확장 */}
                      <div style={itemRowStyle}>
                        <div style={{ ...labelStyle, width: '160px' }}>악궁확장</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', flex: 1 }}>
                          {['고정식', '착탈식'].map(item => (
                            <button key={item} onClick={() => togglePlanArray(idx, 'primary', `악궁확장 — ${item}`)} style={chipStyle((plan.primary || []).includes(`악궁확장 — ${item}`), '#7c3aed')}>{item}</button>
                          ))}
                        </div>
                      </div>

                      {/* 치아 배열/조절 */}
                      <div style={itemRowStyle}>
                        <div style={{ ...labelStyle, width: '160px' }}>치아 배열 / 조절</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', flex: 1 }}>
                          {['앞니 배열', '어금니 조절'].map(item => (
                            <button key={item} onClick={() => togglePlanArray(idx, 'primary', item)} style={chipStyle((plan.primary || []).includes(item), '#7c3aed')}>{item}</button>
                          ))}
                        </div>
                      </div>

                      {/* 공간 관리 */}
                      <div style={itemRowStyle}>
                        <div style={{ ...labelStyle, width: '160px' }}>공간 관리</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', flex: 1 }}>
                          {['연속 발치술', '공간 만들기', '공간 유지'].map(item => (
                            <button key={item} onClick={() => togglePlanArray(idx, 'primary', item)} style={chipStyle((plan.primary || []).includes(item), '#7c3aed')}>{item}</button>
                          ))}
                        </div>
                      </div>

                      {/* 1차 기타 */}
                      <div style={itemRowStyle}>
                        <div style={{ ...labelStyle, width: '160px' }}>기타</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', flex: 1 }}>
                          {['기타 장치 (Halterman, Nance 등)', '잇몸 수술', '성장 검사 및 재평가'].map(item => (
                            <button key={item} onClick={() => togglePlanArray(idx, 'primary', item)} style={chipStyle((plan.primary || []).includes(item), '#7c3aed')}>{item}</button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 2차 */}
                  {plan.phase === '2차' && (
                    <div style={subSectionStyle}>
                      <div style={subLabel}>공간 확보 방법</div>

                      {/* 발치 사분면 — 제일 먼저 */}
                      <div style={{ marginBottom: '16px' }}>
                        <div style={{ fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '6px' }}>발치 부위</div>
                        <div style={{ fontSize: '12px', color: '#9ca3af', marginBottom: '8px' }}>선택하지 않은 부위 = 비발치</div>
                        <ExtractionQuadrant plan={plan} idx={idx} updatePlan={updatePlan} />
                      </div>

                      {/* 악궁 확장 */}
                      <div style={itemRowStyle}>
                        <div style={{ ...labelStyle, width: '120px' }}>악궁 확장</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                          {['Expansion', 'RPE', 'MARPE', 'SARPE'].map(t => (
                            <button key={t} onClick={() => updatePlan(idx, 'expansion', plan.expansion === t ? '' : t)} style={chipStyle(plan.expansion === t, '#2563eb')}>{t}</button>
                          ))}
                        </div>
                      </div>

                      {/* 후방이동 */}
                      <div style={itemRowStyle}>
                        <div style={{ ...labelStyle, width: '120px' }}>후방이동</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
                          <button onClick={() => updatePlan(idx, 'distalization', !plan.distalization)} style={chipStyle(plan.distalization, '#2563eb')}>필요</button>
                          {plan.distalization && (
                            <input
                              type="text"
                              value={plan.distalExtraction || ''}
                              onChange={e => updatePlan(idx, 'distalExtraction', e.target.value)}
                              placeholder="#7/#8 발치 여부"
                              style={{ ...textInputStyle, minWidth: '140px', maxWidth: '200px' }}
                            />
                          )}
                        </div>
                      </div>

                      {/* 치간삭제 */}
                      <div style={itemRowStyle}>
                        <div style={{ ...labelStyle, width: '120px' }}>치간삭제</div>
                        <button onClick={() => updatePlan(idx, 'stripping', !plan.stripping)} style={chipStyle(plan.stripping, '#2563eb')}>필요</button>
                      </div>

                      {/* 2차 기타 */}
                      <div style={itemRowStyle}>
                        <div style={{ ...labelStyle, width: '120px' }}>기타</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                          {(value.txEtcItems || DEFAULT_TX_ETC_ITEMS).map(item => (
                            <button key={item} onClick={() => togglePlanArray(idx, 'txEtc', item)} style={chipStyle((plan.txEtc || []).includes(item), '#059669')}>{item}</button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* 추가사항 + 기간 */}
              <div style={{ marginTop: '12px' }}>
                <FieldRow label="추가사항">
                  <textarea
                    value={plan.memo || ''}
                    onChange={e => updatePlan(idx, 'memo', e.target.value)}
                    placeholder="추가 사항 입력"
                    style={{ ...fieldInputStyle, minHeight: '50px', resize: 'vertical' }}
                    rows={2}
                  />
                </FieldRow>
                <FieldRow label="예상 기간">
                  <input
                    type="text"
                    value={plan.duration || ''}
                    onChange={e => updatePlan(idx, 'duration', e.target.value)}
                    placeholder="예: 약 2년 6개월 (선택)"
                    style={fieldInputStyle}
                  />
                </FieldRow>
              </div>
            </div>
          ))}

          <button onClick={addPlan} style={addOptionBtn}>+ 치료 계획 추가</button>

          {/* 전체 추가사항 */}
          <div style={sectionStyle}>
            <SectionHeader label="추가사항" color="#374151" />
            <textarea
              value={value.treatmentMemo || ''}
              onChange={e => updateTopLevel('treatmentMemo', e.target.value)}
              placeholder="전체 치료에 대한 추가사항 (주의사항, 동반 치료 등)"
              style={memoStyle}
              rows={3}
            />
          </div>
          <NavButtons page={page} onPageChange={onPageChange} />
        </div>
      )}

      {/* Page 3: 정리 — 자동 생성 + 편집 가능 */}
      {page === 3 && (
        <SummaryPage value={value} onChange={onChange} onPageChange={onPageChange} />
      )}
    </div>
  )
}

function SummaryPage({ value, onChange, onPageChange }) {
  const auto = buildAutoSummary(value)
  const summary = value.summary || { skeletal: '', dental: '', etc: '', treatmentPlans: [], overall: '' }

  const getValue = (key, fallback) => {
    const v = summary[key]
    return (v === undefined || v === null) ? fallback : v
  }
  const setValue = (key, val) => {
    onChange({ ...value, summary: { ...summary, [key]: val } })
  }
  const setPlanValue = (idx, val) => {
    const plans = [...(summary.treatmentPlans || [])]
    plans[idx] = val
    onChange({ ...value, summary: { ...summary, treatmentPlans: plans } })
  }
  const regenerate = () => {
    onChange({ ...value, summary: { ...auto } })
  }

  const hasAny = auto.skeletal || auto.dental || auto.etc ||
    auto.treatmentPlans.some(t => t) || auto.overall

  return (
    <div style={pageStyle}>
      <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '10px', padding: '12px 16px', color: '#0369a1', fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
        <span>💡 진단/치료 계획에서 <strong>선택한 항목만</strong> 자동 정리되어 아래 표시됩니다. 그대로 수정하거나 보완하세요. 이 내용이 다음 단계(상담 관리 → AI 작성)의 소스가 됩니다.</span>
        <button onClick={regenerate} style={{ padding: '6px 12px', background: '#fff', border: '1px solid #bae6fd', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
          🔄 자동 다시 생성
        </button>
      </div>

      {!hasAny && (
        <div style={{ padding: '40px 20px', textAlign: 'center', color: '#9ca3af', background: '#f9fafb', borderRadius: '10px' }}>
          아직 선택된 항목이 없습니다. 이전 탭에서 진단/치료 계획을 먼저 입력하세요.
        </div>
      )}

      {[
        { key: 'skeletal', label: '🩻 골격 문제' },
        { key: 'dental',   label: '🦷 치성 문제' },
        { key: 'etc',      label: '📝 기타' },
      ].map(({ key, label }) => (
        <div key={key} style={sectionStyle}>
          <SectionHeader label={label} color="#b5976a" />
          {auto[key] && (
            <div style={{ fontSize: '12px', color: '#9ca3af', marginBottom: '6px' }}>자동 정리:</div>
          )}
          {auto[key] && (
            <pre style={autoPreStyle}>{auto[key]}</pre>
          )}
          <textarea
            value={getValue(key, auto[key])}
            onChange={e => setValue(key, e.target.value)}
            placeholder="자동 정리된 내용을 그대로 쓰거나 수정하세요."
            style={{ ...memoStyle, minHeight: '80px', background: '#fff' }}
            rows={4}
          />
        </div>
      ))}

      {(value.treatmentPlans || []).map((_, idx) => (
        <div key={idx} style={sectionStyle}>
          <SectionHeader label={`📋 치료 계획 #${idx + 1}`} color="#b5976a" />
          {auto.treatmentPlans[idx] && (
            <div style={{ fontSize: '12px', color: '#9ca3af', marginBottom: '6px' }}>자동 정리:</div>
          )}
          {auto.treatmentPlans[idx] && (
            <pre style={autoPreStyle}>{auto.treatmentPlans[idx]}</pre>
          )}
          <textarea
            value={getValue('treatmentPlans', []).concat()[idx] !== undefined ? summary.treatmentPlans[idx] : auto.treatmentPlans[idx]}
            onChange={e => setPlanValue(idx, e.target.value)}
            placeholder="치료 계획 정리"
            style={{ ...memoStyle, minHeight: '80px', background: '#fff' }}
            rows={4}
          />
        </div>
      ))}

      <div style={sectionStyle}>
        <SectionHeader label="📝 전체 추가 메모" color="#6b7280" />
        <textarea
          value={getValue('overall', auto.overall)}
          onChange={e => setValue('overall', e.target.value)}
          placeholder="전체 치료에 대한 추가사항 (선택)"
          style={{ ...memoStyle, minHeight: '60px', background: '#fff' }}
          rows={2}
        />
      </div>

      <NavButtons page={3} onPageChange={onPageChange} lastPage />
    </div>
  )
}

const autoPreStyle = {
  background: '#faf8f5',
  border: '1px dashed #e5d4b8',
  borderRadius: '6px',
  padding: '8px 12px',
  fontSize: '12px',
  color: '#5a5a55',
  margin: '0 0 8px 0',
  whiteSpace: 'pre-wrap',
  fontFamily: 'inherit',
}

/* ═══ 서브 컴포넌트 ═══ */

function SectionHeader({ label, color }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '8px',
      marginBottom: '16px', paddingBottom: '10px',
      borderBottom: `2px solid ${color}20`,
    }}>
      <div style={{ width: '4px', height: '20px', borderRadius: '2px', background: color }} />
      <span style={{ fontSize: '15px', fontWeight: '700', color }}>{label}</span>
    </div>
  )
}

function FieldRow({ label, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', marginBottom: '12px' }}>
      <div style={{ ...labelStyle, paddingTop: '9px' }}>{label}</div>
      <div style={{ flex: 1 }}>{children}</div>
    </div>
  )
}

function ExtQuadCell({ plan, idx, field, label, alignH, borderSide, updatePlan }) {
  const value = plan[field] || ''
  const textField = `${field}_text`
  const showInput = value === '기타'
  return (
    <div style={quadCellStyle(alignH, borderSide)}>
      <div style={quadLabel}>{label}</div>
      <select value={value} onChange={e => updatePlan(idx, field, e.target.value)} style={quadSelect(value)}>
        <option value="">비발치</option>
        {['4번', '5번', '기타'].map(o => <option key={o} value={o}>{o}</option>)}
      </select>
      {showInput && (
        <input
          type="text"
          value={plan[textField] || ''}
          onChange={e => updatePlan(idx, textField, e.target.value)}
          placeholder="치아번호"
          style={{ marginTop: '4px', padding: '3px 6px', fontSize: '12px', border: '1px solid #dc2626', borderRadius: '4px', width: '80px', textAlign: alignH === 'right' ? 'right' : 'left' }}
        />
      )}
    </div>
  )
}

function ExtractionQuadrant({ plan, idx, updatePlan }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '1fr auto 1fr',
      gridTemplateRows: 'auto auto',
      gap: '0',
      maxWidth: '340px',
      margin: '0 auto',
    }}>
      <ExtQuadCell plan={plan} idx={idx} field="ext_10" label="#10" alignH="right" borderSide="bottom" updatePlan={updatePlan} />
      <div style={{ borderBottom: '2px solid #9ca3af', width: '2px', background: '#9ca3af' }} />
      <ExtQuadCell plan={plan} idx={idx} field="ext_20" label="#20" alignH="left" borderSide="bottom" updatePlan={updatePlan} />
      <ExtQuadCell plan={plan} idx={idx} field="ext_40" label="#40" alignH="right" borderSide="top" updatePlan={updatePlan} />
      <div style={{ borderTop: '2px solid #9ca3af', width: '2px', background: '#9ca3af' }} />
      <ExtQuadCell plan={plan} idx={idx} field="ext_30" label="#30" alignH="left" borderSide="top" updatePlan={updatePlan} />
    </div>
  )
}

function NavButtons({ page, onPageChange, lastPage }) {
  return (
    <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
      {page > 1 && (
        <button onClick={() => onPageChange(page - 1)} style={navBtn('#6b7280')}>
          ← 이전
        </button>
      )}
      {!lastPage && (
        <button onClick={() => onPageChange(page + 1)} style={{ ...navBtn('#b5976a'), flex: 1 }}>
          다음 →
        </button>
      )}
    </div>
  )
}

/* ═══ 스타일 ═══ */

const pageStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: '24px',
}

const tabBarStyle = {
  display: 'flex',
  gap: '4px',
  marginBottom: '20px',
  background: '#f3f4f6',
  borderRadius: '12px',
  padding: '4px',
}

const tabStyle = (active) => ({
  flex: 1,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '8px',
  padding: '10px 16px',
  borderRadius: '10px',
  border: 'none',
  background: active ? '#fff' : 'transparent',
  color: active ? '#1f2937' : '#9ca3af',
  fontSize: '14px',
  fontWeight: active ? '600' : '400',
  cursor: 'pointer',
  boxShadow: active ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
  transition: 'all 0.15s',
})

const tabNumStyle = (active) => ({
  width: '22px',
  height: '22px',
  borderRadius: '50%',
  background: active ? '#b5976a' : '#d1d5db',
  color: '#fff',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '12px',
  fontWeight: '700',
})

const sectionStyle = {
  background: '#fff',
  border: '1px solid #e5e7eb',
  borderRadius: '12px',
  padding: '20px',
}

const itemRowStyle = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: '12px',
  marginBottom: '12px',
  minHeight: '36px',
}

const labelStyle = {
  width: '140px',
  flexShrink: 0,
  fontSize: '13px',
  fontWeight: '600',
  color: '#374151',
  paddingTop: '7px',
  lineHeight: '1.3',
}

const chipStyle = (selected, color) => ({
  padding: '5px 14px',
  borderRadius: '20px',
  border: selected ? `2px solid ${color}` : '1px solid #d1d5db',
  background: selected ? `${color}12` : '#fff',
  color: selected ? color : '#374151',
  fontSize: '13px',
  fontWeight: selected ? '600' : '400',
  cursor: 'pointer',
  transition: 'all 0.15s',
  whiteSpace: 'nowrap',
})

const severeStyle = (active) => ({
  padding: '3px 10px',
  borderRadius: '12px',
  border: active ? '2px solid #dc2626' : '1px dashed #d1d5db',
  background: active ? '#fef2f2' : 'transparent',
  color: active ? '#dc2626' : '#9ca3af',
  fontSize: '11px',
  fontWeight: '600',
  cursor: 'pointer',
  transition: 'all 0.15s',
  marginLeft: '4px',
})

const textInputStyle = {
  flex: 1,
  padding: '6px 12px',
  border: '1px solid #d1d5db',
  borderRadius: '8px',
  fontSize: '13px',
  outline: 'none',
  minWidth: '200px',
}

const fieldInputStyle = {
  width: '100%',
  padding: '10px 14px',
  border: '1px solid #d1d5db',
  borderRadius: '8px',
  fontSize: '14px',
  outline: 'none',
  fontFamily: 'inherit',
  boxSizing: 'border-box',
}

const memoStyle = {
  width: '100%',
  padding: '10px 12px',
  border: '1px solid #e5e7eb',
  borderRadius: '8px',
  fontSize: '13px',
  resize: 'vertical',
  fontFamily: 'inherit',
  color: '#374151',
  background: '#f9fafb',
  outline: 'none',
  boxSizing: 'border-box',
}

const subSectionStyle = {
  marginLeft: '20px',
  paddingLeft: '16px',
  borderLeft: '3px solid #e5e7eb',
  marginBottom: '12px',
}

const subLabel = {
  fontSize: '13px',
  fontWeight: '600',
  color: '#6b7280',
  marginBottom: '10px',
}

const quadCellStyle = (alignH, borderSide) => ({
  padding: '10px 14px',
  display: 'flex',
  flexDirection: 'column',
  alignItems: alignH === 'right' ? 'flex-end' : 'flex-start',
  gap: '4px',
  [`border${borderSide === 'bottom' ? 'Bottom' : 'Top'}`]: '2px solid #9ca3af',
  [`border${alignH === 'right' ? 'Right' : 'Left'}`]: '2px solid #9ca3af',
})

const quadLabel = {
  fontSize: '11px',
  color: '#6b7280',
  fontWeight: '600',
}

const quadSelect = (val) => ({
  padding: '4px 8px',
  borderRadius: '6px',
  border: val ? '2px solid #dc2626' : '1px solid #d1d5db',
  background: val ? '#fef2f2' : '#fff',
  color: val ? '#dc2626' : '#374151',
  fontSize: '13px',
  fontWeight: val ? '600' : '400',
  cursor: 'pointer',
  outline: 'none',
})

const optionCardStyle = {
  background: '#faf8f5',
  border: '1px solid #e8dfd4',
  borderRadius: '10px',
  padding: '16px',
  marginBottom: '12px',
}

const addOptionBtn = {
  width: '100%',
  padding: '10px',
  background: '#f9fafb',
  border: '1px dashed #d1d5db',
  borderRadius: '8px',
  fontSize: '13px',
  fontWeight: '600',
  color: '#6b7280',
  cursor: 'pointer',
}

const removeBtn = {
  padding: '3px 10px',
  background: '#fef2f2',
  border: '1px solid #fecaca',
  borderRadius: '6px',
  fontSize: '11px',
  color: '#ef4444',
  fontWeight: '600',
  cursor: 'pointer',
}

const navBtn = (color) => ({
  padding: '12px 24px',
  background: color,
  color: '#fff',
  border: 'none',
  borderRadius: '8px',
  fontSize: '14px',
  fontWeight: '600',
  cursor: 'pointer',
})
