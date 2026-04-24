/**
 * ClinicalForm — Step 1: 의사 입력
 * page 1: 진단 (골격/치성/기타 문제목록)
 * page 2: 치료계획 (옵션 카드 + 메모)
 * page 3: 정리 (자동 요약 + 수정)
 *
 * 항목/옵션 정의는 src/lib/formConfig.js 의 DEFAULT_* 에서 온다.
 * Editor 가 Supabase 에서 로드한 config 를 props 로 내려주면 그걸 사용.
 */
import { useState } from 'react'
import {
  DEFAULT_DIAGNOSIS_CONFIG,
  DEFAULT_TREATMENT_CONFIG,
} from '../lib/formConfig'

/* ═══ 초기 데이터 / 요약 헬퍼 ═══ */

function getEmptyTxOption() {
  return {
    goal: '',          // 치료 목표
    scope: '',         // '전체' | '부분'
    phase: '',         // '1차' | '2차'
    // 1차 (flat array of option strings toggled across all phase1 groups)
    primary: [],
    // 2차
    ext_10: '', ext_20: '', ext_30: '', ext_40: '',
    expansion: '',
    distalization: false,
    distalExtraction: '',
    stripping: false,
    // 기타
    txEtc: [],
    memo: '',
    duration: '',
  }
}

export function getEmptyClinicalForm() {
  return {
    // page 1: 진단
    skeletal: { memo: '' },
    dental: { memo: '' },
    etc: { memo: '' },
    // page 2: 치료계획
    treatmentPlans: [getEmptyTxOption()],
    treatmentMemo: '',
    // page 3: 정리 (combined — 사용자 편집 통합본. 비어있으면 자동 생성 사용)
    // skeletal/dental/etc/treatmentPlans/overall 은 하위호환용(구 리포트 로드).
    summary: { combined: '', skeletal: '', dental: '', etc: '', treatmentPlans: [], overall: '' },
  }
}

// 진단 항목 정도(degree): 'severe' | 'mild' | ''  (하위호환: 기존 _severe:true → 'severe')
function getSeverity(sectionData, key) {
  const sev = sectionData?.[`${key}_severity`]
  if (sev === 'severe' || sev === 'mild') return sev
  if (sectionData?.[`${key}_severe`] === true) return 'severe'
  return ''
}

function severityTag(severity) {
  if (severity === 'severe') return ' (심함)'
  if (severity === 'mild') return ' (경미)'
  return ''
}

function itemValueToText(sectionKey, item, value) {
  const v = value[sectionKey]?.[item.key]
  const tag = severityTag(getSeverity(value[sectionKey], item.key))
  if (item.type === 'text') return v ? `${item.label}: ${v}${tag}` : null
  if (item.type === 'radio') return v ? `${item.label}: ${v}${tag}` : null
  if (item.type === 'checkbox') {
    if (Array.isArray(v) && v.length > 0) return `${item.label}: ${v.join(', ')}${tag}`
    return null
  }
  if (item.type === 'checkbox_text') {
    const arr = Array.isArray(v) ? v : []
    const text = value[sectionKey]?.[`${item.key}_text`]
    if (arr.length === 0 && !text) return null
    const parts = [...arr]
    if (text) parts.push(text)
    return `${item.label}: ${parts.join(', ')}${tag}`
  }
  return null
}

function sectionToText(section, clinicalForm) {
  const lines = []
  for (const item of section.items || []) {
    const line = itemValueToText(section.key, item, clinicalForm)
    if (line) lines.push(`- ${line}`)
  }
  const memo = clinicalForm[section.key]?.memo
  if (memo) lines.push(`- 특이사항: ${memo}`)
  return lines.join('\n')
}

function planToText(plan) {
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

export function buildAutoSummary(clinicalForm, diagnosisConfig = DEFAULT_DIAGNOSIS_CONFIG) {
  const sections = diagnosisConfig?.sections || DEFAULT_DIAGNOSIS_CONFIG.sections
  const find = (key) => sections.find(s => s.key === key) || { key, items: [] }
  return {
    skeletal: sectionToText(find('skeletal'), clinicalForm),
    dental:   sectionToText(find('dental'),   clinicalForm),
    etc:      sectionToText(find('etc'),      clinicalForm),
    treatmentPlans: (clinicalForm.treatmentPlans || []).map(planToText),
    overall: clinicalForm.treatmentMemo || '',
  }
}

// 섹션별 자동 정리 + 사용자 per-section 편집값(있으면 우선) → 하나의 통합 텍스트
// 하류에 단일 블록으로 넘길 때와 정리 탭 우측 textarea 초기값 둘 다 여기서 생성.
export function buildCombinedSummary(clinicalForm, diagnosisConfig = DEFAULT_DIAGNOSIS_CONFIG) {
  const sections = diagnosisConfig?.sections || DEFAULT_DIAGNOSIS_CONFIG.sections
  const labelOf = (key, fallback) => sections.find(s => s.key === key)?.label || fallback
  const auto = buildAutoSummary(clinicalForm, diagnosisConfig)
  const saved = clinicalForm.summary || {}
  const pick = (key) => {
    const v = saved[key]
    if (v !== undefined && v !== null && String(v).trim() !== '') return String(v)
    return auto[key] || ''
  }
  const parts = []
  const skel = pick('skeletal')
  const dent = pick('dental')
  const etc = pick('etc')
  if (skel) parts.push(`## ${labelOf('skeletal', '골격 문제')}\n${skel}`)
  if (dent) parts.push(`## ${labelOf('dental', '치성 문제')}\n${dent}`)
  if (etc) parts.push(`## ${labelOf('etc', '기타')}\n${etc}`)
  ;(clinicalForm.treatmentPlans || []).forEach((_, i) => {
    const savedPlan = (saved.treatmentPlans || [])[i]
    const planText = (savedPlan && String(savedPlan).trim())
      ? String(savedPlan)
      : (auto.treatmentPlans[i] || '')
    if (planText) parts.push(`## 치료 계획 #${i + 1}\n${planText}`)
  })
  const overall = pick('overall')
  if (overall) parts.push(`## 전체 추가 메모\n${overall}`)
  return parts.join('\n\n')
}

/* ═══ 메인 컴포넌트 ═══ */

export default function ClinicalForm({
  value,
  onChange,
  page,
  onPageChange,
  diagnosisConfig = DEFAULT_DIAGNOSIS_CONFIG,
  treatmentConfig = DEFAULT_TREATMENT_CONFIG,
}) {
  const sections = diagnosisConfig?.sections || DEFAULT_DIAGNOSIS_CONFIG.sections
  const tx = treatmentConfig || DEFAULT_TREATMENT_CONFIG

  const updateField = (section, key, val) => {
    onChange({
      ...value,
      [section]: { ...value[section], [key]: val },
    })
  }

  // severity: 'severe' | 'mild' | '' — 같은 버튼 재클릭 시 해제
  const updateSeverity = (section, key, next) => {
    const currentSev = value[section]?.[`${key}_severity`]
    const legacySevere = value[section]?.[`${key}_severe`] === true
    const current = currentSev || (legacySevere ? 'severe' : '')
    const nextVal = current === next ? '' : next
    onChange({
      ...value,
      [section]: {
        ...value[section],
        [`${key}_severity`]: nextVal,
        [`${key}_severe`]: nextVal === 'severe' ? true : false,
      },
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

  const phaseOpts = tx.phaseOptions || DEFAULT_TREATMENT_CONFIG.phaseOptions
  const scopeOpts = tx.scopeOptions || DEFAULT_TREATMENT_CONFIG.scopeOptions
  const phase1Groups = tx.phase1Groups || DEFAULT_TREATMENT_CONFIG.phase1Groups
  const phase2 = tx.phase2 || DEFAULT_TREATMENT_CONFIG.phase2

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
          {sections.map(section => (
            <div key={section.key} style={sectionStyle}>
              <SectionHeader label={section.label} color={section.color || '#374151'} />

              {(section.items || []).map(item => (
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
                        {(item.options || []).map(opt => {
                          const selected = (value[section.key]?.[item.key] || []).includes(opt)
                          return (
                            <button
                              key={opt}
                              onClick={() => toggleCheckbox(section.key, item.key, opt)}
                              style={chipStyle(selected, section.color || '#374151')}
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
                      (item.options || []).map(opt => {
                        const selected = value[section.key]?.[item.key] === opt
                        return (
                          <button
                            key={opt}
                            onClick={() => setRadio(section.key, item.key, opt)}
                            style={chipStyle(selected, section.color || '#374151')}
                          >
                            {opt}
                          </button>
                        )
                      })
                    ) : (
                      (item.options || []).map(opt => {
                        const selected = (value[section.key]?.[item.key] || []).includes(opt)
                        return (
                          <button
                            key={opt}
                            onClick={() => toggleCheckbox(section.key, item.key, opt)}
                            style={chipStyle(selected, section.color || '#374151')}
                          >
                            {opt}
                          </button>
                        )
                      })
                    )}

                    {item.severe && hasValue(section.key, item.key, item) && (() => {
                      const sev = getSeverity(value[section.key], item.key)
                      return (
                        <>
                          <button
                            onClick={() => updateSeverity(section.key, item.key, 'mild')}
                            style={severityStyle(sev === 'mild', 'mild')}
                          >
                            경미
                          </button>
                          <button
                            onClick={() => updateSeverity(section.key, item.key, 'severe')}
                            style={severityStyle(sev === 'severe', 'severe')}
                          >
                            심함
                          </button>
                        </>
                      )
                    })()}
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

              {/* 교정 단계 */}
              <div style={itemRowStyle}>
                <div style={labelStyle}>교정 단계</div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  {phaseOpts.map(p => (
                    <button key={p} onClick={() => updatePlan(idx, 'phase', plan.phase === p ? '' : p)} style={chipStyle(plan.phase === p, '#b5976a')}>{p} 교정</button>
                  ))}
                </div>
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

              {plan.phase && (
                <>
                  <div style={itemRowStyle}>
                    <div style={labelStyle}>교정 범위</div>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      {scopeOpts.map(s => (
                        <button key={s} onClick={() => updatePlan(idx, 'scope', plan.scope === s ? '' : s)} style={chipStyle(plan.scope === s, '#b5976a')}>{s} 교정</button>
                      ))}
                    </div>
                  </div>

                  {/* 1차: config 의 phase1Groups 를 반복 */}
                  {plan.phase === '1차' && (
                    <div style={subSectionStyle}>
                      {phase1Groups.map(group => (
                        <div key={group.key} style={itemRowStyle}>
                          <div style={{ ...labelStyle, width: '160px' }}>{group.label}</div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', flex: 1 }}>
                            {(group.options || []).map(opt => (
                              <button
                                key={opt}
                                onClick={() => togglePlanArray(idx, 'primary', opt)}
                                style={chipStyle((plan.primary || []).includes(opt), '#7c3aed')}
                              >{opt}</button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* 2차 */}
                  {plan.phase === '2차' && (
                    <div style={subSectionStyle}>
                      <div style={subLabel}>공간 확보 방법</div>

                      {/* 발치 사분면 */}
                      <div style={{ marginBottom: '16px' }}>
                        <div style={{ fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '6px' }}>발치 부위</div>
                        <div style={{ fontSize: '12px', color: '#9ca3af', marginBottom: '8px' }}>선택하지 않은 부위 = 비발치</div>
                        <ExtractionQuadrant plan={plan} idx={idx} updatePlan={updatePlan} extractionOptions={phase2.extraction || []} />
                      </div>

                      {/* 악궁 확장 */}
                      <div style={itemRowStyle}>
                        <div style={{ ...labelStyle, width: '120px' }}>악궁 확장</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                          {(phase2.expansion || []).map(t => (
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
                          {(phase2.txEtc || []).map(item => (
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

      {/* Page 3: 정리 */}
      {page === 3 && (
        <SummaryPage value={value} onChange={onChange} onPageChange={onPageChange} diagnosisConfig={diagnosisConfig} />
      )}
    </div>
  )
}

function SummaryPage({ value, onChange, onPageChange, diagnosisConfig }) {
  const auto = buildAutoSummary(value, diagnosisConfig)
  const summary = value.summary || { combined: '', skeletal: '', dental: '', etc: '', treatmentPlans: [], overall: '' }
  const combinedInitial = buildCombinedSummary(value, diagnosisConfig)
  const combined = (summary.combined && summary.combined.length > 0) ? summary.combined : combinedInitial

  const setCombined = (val) => {
    onChange({ ...value, summary: { ...summary, combined: val } })
  }
  const regenerate = () => {
    onChange({ ...value, summary: { ...summary, combined: combinedInitial } })
  }

  const hasAny = auto.skeletal || auto.dental || auto.etc ||
    auto.treatmentPlans.some(t => t) || auto.overall

  const sectionLabels = (diagnosisConfig?.sections || DEFAULT_DIAGNOSIS_CONFIG.sections).reduce((acc, s) => {
    acc[s.key] = s.label
    return acc
  }, {})
  const autoSections = [
    { key: 'skeletal', label: `🩻 ${sectionLabels.skeletal || '골격문제'}`, text: auto.skeletal },
    { key: 'dental',   label: `🦷 ${sectionLabels.dental   || '치성문제'}`, text: auto.dental },
    { key: 'etc',      label: `📝 ${sectionLabels.etc      || '기타'}`,      text: auto.etc },
    ...auto.treatmentPlans.map((t, i) => ({ key: `plan_${i}`, label: `📋 치료 계획 #${i + 1}`, text: t })),
  ]
  if (auto.overall) autoSections.push({ key: 'overall', label: '📝 전체 추가 메모', text: auto.overall })

  const [copied, setCopied] = useState(false)
  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(combined)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      // fallback
      const ta = document.createElement('textarea')
      ta.value = combined
      document.body.appendChild(ta)
      ta.select()
      try { document.execCommand('copy') } catch { /* ignore */ }
      document.body.removeChild(ta)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    }
  }

  return (
    <div style={pageStyle}>
      <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '10px', padding: '12px 16px', color: '#0369a1', fontSize: '13px' }}>
        💡 왼쪽은 진단/치료계획에서 <strong>선택한 항목</strong>의 자동 정리(참고용)입니다. 오른쪽 통합 박스에서 자유롭게 수정하세요. 이 통합 내용이 다음 단계(상담 관리 → AI 작성)의 소스가 되며, <strong>복사하기</strong> 버튼으로 전자차트에 바로 붙여넣을 수 있습니다.
      </div>

      {!hasAny && (
        <div style={{ padding: '40px 20px', textAlign: 'center', color: '#9ca3af', background: '#f9fafb', borderRadius: '10px' }}>
          아직 선택된 항목이 없습니다. 이전 탭에서 진단/치료 계획을 먼저 입력하세요.
        </div>
      )}

      {hasAny && (
        <div style={summaryGridStyle}>
          {/* 좌: 자동 정리 스택 (읽기 전용 참고) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={pairColLabelStyle}>📝 자동 정리 (참고용)</div>
            {autoSections.map(({ key, label, text }) => (
              <div key={key} style={autoCardStyle}>
                <div style={autoCardLabel}>{label}</div>
                {text ? (
                  <pre style={autoPreStyle}>{text}</pre>
                ) : (
                  <pre style={{ ...autoPreStyle, color: '#c7b9a2', fontStyle: 'italic' }}>(없음)</pre>
                )}
              </div>
            ))}
          </div>

          {/* 우: 통합 편집 + 복사 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
              <div style={pairColLabelStyle}>✏️ 통합 편집 (이 내용이 저장·전달됩니다)</div>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button onClick={regenerate} style={summaryActionBtn}>🔄 자동에서 다시 생성</button>
                <button onClick={copyToClipboard} style={{ ...summaryActionBtn, background: copied ? '#dcfce7' : '#fff', borderColor: copied ? '#86efac' : '#d1d5db', color: copied ? '#166534' : '#374151' }}>
                  {copied ? '✅ 복사됨' : '📋 복사하기'}
                </button>
              </div>
            </div>
            <textarea
              value={combined}
              onChange={e => setCombined(e.target.value)}
              placeholder="섹션 헤더(## 골격 문제 등)를 유지하면서 자유롭게 수정하세요."
              style={combinedTextareaStyle}
            />
          </div>
        </div>
      )}

      <NavButtons page={3} onPageChange={onPageChange} lastPage />
    </div>
  )
}

const autoPreStyle = {
  background: '#faf8f5',
  border: '1px dashed #e5d4b8',
  borderRadius: '6px',
  padding: '10px 12px',
  fontSize: '13px',
  color: '#5a5a55',
  margin: 0,
  minHeight: '120px',
  whiteSpace: 'pre-wrap',
  fontFamily: 'inherit',
  lineHeight: 1.6,
  overflowY: 'auto',
}

const summaryGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
  gap: '16px',
  alignItems: 'stretch',
}

const autoCardStyle = {
  background: '#fff',
  border: '1px solid #e5e7eb',
  borderRadius: '10px',
  padding: '12px 14px',
}

const autoCardLabel = {
  fontSize: '12px',
  fontWeight: 700,
  color: '#b5976a',
  marginBottom: '6px',
}

const combinedTextareaStyle = {
  width: '100%',
  minHeight: '480px',
  padding: '14px 16px',
  border: '1px solid #d1d5db',
  borderRadius: '10px',
  fontSize: '14px',
  lineHeight: 1.7,
  fontFamily: 'inherit',
  color: '#1f2937',
  background: '#fff',
  outline: 'none',
  boxSizing: 'border-box',
  resize: 'vertical',
  flex: 1,
}

const summaryActionBtn = {
  padding: '6px 12px',
  background: '#fff',
  border: '1px solid #d1d5db',
  borderRadius: '8px',
  fontSize: '12px',
  fontWeight: 600,
  color: '#374151',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
}

const pairColLabelStyle = {
  fontSize: '12px',
  fontWeight: 600,
  color: '#9ca3af',
  marginBottom: '6px',
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
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

function ExtQuadCell({ plan, idx, field, label, alignH, borderSide, updatePlan, extractionOptions }) {
  const value = plan[field] || ''
  const textField = `${field}_text`
  const showInput = value === '기타'
  return (
    <div style={quadCellStyle(alignH, borderSide)}>
      <div style={quadLabel}>{label}</div>
      <select value={value} onChange={e => updatePlan(idx, field, e.target.value)} style={quadSelect(value)}>
        <option value="">비발치</option>
        {(extractionOptions || []).map(o => <option key={o} value={o}>{o}</option>)}
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

function ExtractionQuadrant({ plan, idx, updatePlan, extractionOptions }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '1fr auto 1fr',
      gridTemplateRows: 'auto auto',
      gap: '0',
      maxWidth: '340px',
      margin: '0 auto',
    }}>
      <ExtQuadCell plan={plan} idx={idx} field="ext_10" label="#10" alignH="right" borderSide="bottom" updatePlan={updatePlan} extractionOptions={extractionOptions} />
      <div style={{ borderBottom: '2px solid #9ca3af', width: '2px', background: '#9ca3af' }} />
      <ExtQuadCell plan={plan} idx={idx} field="ext_20" label="#20" alignH="left" borderSide="bottom" updatePlan={updatePlan} extractionOptions={extractionOptions} />
      <ExtQuadCell plan={plan} idx={idx} field="ext_40" label="#40" alignH="right" borderSide="top" updatePlan={updatePlan} extractionOptions={extractionOptions} />
      <div style={{ borderTop: '2px solid #9ca3af', width: '2px', background: '#9ca3af' }} />
      <ExtQuadCell plan={plan} idx={idx} field="ext_30" label="#30" alignH="left" borderSide="top" updatePlan={updatePlan} extractionOptions={extractionOptions} />
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

const severityStyle = (active, kind) => {
  const palette = kind === 'severe'
    ? { fg: '#dc2626', bg: '#fef2f2', border: '#dc2626' }
    : { fg: '#d97706', bg: '#fffbeb', border: '#d97706' }
  return {
    padding: '3px 10px',
    borderRadius: '12px',
    border: active ? `2px solid ${palette.border}` : '1px dashed #d1d5db',
    background: active ? palette.bg : 'transparent',
    color: active ? palette.fg : '#9ca3af',
    fontSize: '11px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.15s',
    marginLeft: '4px',
  }
}

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

/* 설정 페이지에서도 재사용할 수 있도록 스타일 export */
export const CF_STYLES = {
  pageStyle,
  sectionStyle,
  itemRowStyle,
  labelStyle,
  chipStyle,
  severityStyle,
  textInputStyle,
  memoStyle,
  subSectionStyle,
  subLabel,
  addOptionBtn,
  removeBtn,
  quadCellStyle,
  quadLabel,
  quadSelect,
}
