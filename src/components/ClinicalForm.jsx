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

              {/* 교정 범위 */}
              <div style={itemRowStyle}>
                <div style={labelStyle}>교정 범위</div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  {['전체', '부분'].map(s => (
                    <button key={s} onClick={() => updatePlan(idx, 'scope', plan.scope === s ? '' : s)} style={chipStyle(plan.scope === s, '#b5976a')}>{s} 교정</button>
                  ))}
                </div>
              </div>

              {/* 전체 → 1차/2차 */}
              {plan.scope === '전체' && (
                <>
                  <div style={itemRowStyle}>
                    <div style={labelStyle}>교정 단계</div>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      {['1차', '2차'].map(p => (
                        <button key={p} onClick={() => updatePlan(idx, 'phase', plan.phase === p ? '' : p)} style={chipStyle(plan.phase === p, '#b5976a')}>{p} 교정</button>
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
          <NavButtons page={page} onPageChange={onPageChange} lastPage />
        </div>
      )}
    </div>
  )
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
      {/* #10 상우 */}
      <div style={quadCellStyle('right', 'bottom')}>
        <div style={quadLabel}>#10</div>
        <select value={plan.ext_10 || ''} onChange={e => updatePlan(idx, 'ext_10', e.target.value)} style={quadSelect(plan.ext_10)}>
          <option value="">비발치</option>
          {['4번', '5번', '기타'].map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      </div>
      <div style={{ borderBottom: '2px solid #9ca3af', width: '2px', background: '#9ca3af' }} />
      {/* #20 상좌 */}
      <div style={quadCellStyle('left', 'bottom')}>
        <div style={quadLabel}>#20</div>
        <select value={plan.ext_20 || ''} onChange={e => updatePlan(idx, 'ext_20', e.target.value)} style={quadSelect(plan.ext_20)}>
          <option value="">비발치</option>
          {['4번', '5번', '기타'].map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      </div>
      {/* #40 하우 */}
      <div style={quadCellStyle('right', 'top')}>
        <div style={quadLabel}>#40</div>
        <select value={plan.ext_40 || ''} onChange={e => updatePlan(idx, 'ext_40', e.target.value)} style={quadSelect(plan.ext_40)}>
          <option value="">비발치</option>
          {['4번', '5번', '기타'].map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      </div>
      <div style={{ borderTop: '2px solid #9ca3af', width: '2px', background: '#9ca3af' }} />
      {/* #30 하좌 */}
      <div style={quadCellStyle('left', 'top')}>
        <div style={quadLabel}>#30</div>
        <select value={plan.ext_30 || ''} onChange={e => updatePlan(idx, 'ext_30', e.target.value)} style={quadSelect(plan.ext_30)}>
          <option value="">비발치</option>
          {['4번', '5번', '기타'].map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      </div>
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
