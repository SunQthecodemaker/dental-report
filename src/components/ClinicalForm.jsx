/**
 * ClinicalForm — Step 1: 의사 입력
 * page 1: 환자정보 (이름, 생년월일, CC)
 * page 2: 진단 (골격/치성/기타 문제목록)
 * page 3: 치료계획 (옵션 카드 + 메모)
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

function getEmptyTxOption() {
  return {
    name: '',
    scope: '',        // '전체' | '부분'
    phase: '',        // '1차' | '2차'
    // 1차
    primary: [],      // ['근기능치료', '악궁확장', '앞니배열']
    // 2차 비발치
    expansion: false,  // 악궁확장
    expansionType: '', // RPE, MSE, SARPE 등
    distalization: false,
    distalExtraction: '', // #7/#8 발치 여부
    stripping: false,
    // 발치 사분면 ('' = 비발치, '4' | '5' | '기타')
    ext_UR: '', ext_UL: '', ext_LR: '', ext_LL: '',
    // 기타
    txEtc: [],        // ['매복치', '잇몸수술', '악교정 수술']
    description: '',
    duration: '',
  }
}

export function getEmptyClinicalForm() {
  return {
    // page 1: 환자정보
    patientName: '',
    birthDate: '',
    chiefComplaint: '',
    // page 2: 진단
    skeletal: { memo: '' },
    dental: { memo: '' },
    etc: { memo: '' },
    // page 3: 치료계획
    treatmentOptions: [getEmptyTxOption()],
    treatmentGoal: '',
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

  // 치료 옵션 관리
  const updateOption = (idx, field, val) => {
    const opts = [...(value.treatmentOptions || [])]
    opts[idx] = { ...opts[idx], [field]: val }
    updateTopLevel('treatmentOptions', opts)
  }
  const toggleOptionArray = (idx, field, val) => {
    const opts = [...(value.treatmentOptions || [])]
    const current = opts[idx][field] || []
    opts[idx] = {
      ...opts[idx],
      [field]: current.includes(val) ? current.filter(v => v !== val) : [...current, val],
    }
    updateTopLevel('treatmentOptions', opts)
  }
  const addOption = () => {
    updateTopLevel('treatmentOptions', [...(value.treatmentOptions || []), getEmptyTxOption()])
  }
  const removeOption = (idx) => {
    updateTopLevel('treatmentOptions', (value.treatmentOptions || []).filter((_, i) => i !== idx))
  }

  return (
    <div>
      {/* 페이지 탭 */}
      <div style={tabBarStyle}>
        {[
          { p: 1, label: '환자 정보' },
          { p: 2, label: '진단' },
          { p: 3, label: '치료 계획' },
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

      {/* Page 1: 환자 정보 */}
      {page === 1 && (
        <div style={pageStyle}>
          <div style={sectionStyle}>
            <SectionHeader label="환자 정보" color="#374151" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <FieldRow label="환자 이름">
                <input
                  type="text"
                  value={value.patientName || ''}
                  onChange={e => updateTopLevel('patientName', e.target.value)}
                  placeholder="환자명 입력"
                  style={fieldInputStyle}
                />
              </FieldRow>
              <FieldRow label="생년월일">
                <input
                  type="date"
                  value={value.birthDate || ''}
                  onChange={e => updateTopLevel('birthDate', e.target.value)}
                  style={fieldInputStyle}
                />
              </FieldRow>
              <FieldRow label="C.C (주호소)">
                <textarea
                  value={value.chiefComplaint || ''}
                  onChange={e => updateTopLevel('chiefComplaint', e.target.value)}
                  placeholder="교정 치료를 원하는 이유 (환자 호소 내용을 붙여넣기)"
                  style={{ ...fieldInputStyle, minHeight: '80px', resize: 'vertical' }}
                  rows={3}
                />
              </FieldRow>
            </div>
          </div>
          <NavButtons page={page} onPageChange={onPageChange} />
        </div>
      )}

      {/* Page 2: 진단 */}
      {page === 2 && (
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

      {/* Page 3: 치료계획 */}
      {page === 3 && (
        <div style={pageStyle}>
          {(value.treatmentOptions || []).map((opt, idx) => (
            <div key={idx} style={sectionStyle}>
              {/* 옵션 헤더 */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', paddingBottom: '10px', borderBottom: '2px solid #b5976a20' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ width: '4px', height: '20px', borderRadius: '2px', background: '#b5976a' }} />
                  <span style={{ fontSize: '15px', fontWeight: '700', color: '#b5976a' }}>치료 옵션 #{idx + 1}</span>
                </div>
                {(value.treatmentOptions || []).length > 1 && (
                  <button onClick={() => removeOption(idx)} style={removeBtn}>삭제</button>
                )}
              </div>

              {/* 치료명 */}
              <FieldRow label="치료명">
                <input
                  type="text"
                  value={opt.name || ''}
                  onChange={e => updateOption(idx, 'name', e.target.value)}
                  placeholder="예: 전체 교정 — 설측 브라켓"
                  style={fieldInputStyle}
                />
              </FieldRow>

              {/* 교정 범위 */}
              <div style={itemRowStyle}>
                <div style={labelStyle}>교정 범위</div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  {['전체', '부분'].map(s => (
                    <button key={s} onClick={() => updateOption(idx, 'scope', opt.scope === s ? '' : s)} style={chipStyle(opt.scope === s, '#b5976a')}>{s} 교정</button>
                  ))}
                </div>
              </div>

              {/* 전체 교정 → 1차/2차 선택 */}
              {opt.scope === '전체' && (
                <>
                  <div style={itemRowStyle}>
                    <div style={labelStyle}>교정 단계</div>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      {['1차', '2차'].map(p => (
                        <button key={p} onClick={() => updateOption(idx, 'phase', opt.phase === p ? '' : p)} style={chipStyle(opt.phase === p, '#b5976a')}>{p} 교정</button>
                      ))}
                    </div>
                  </div>

                  {/* 1차 교정 하위 */}
                  {opt.phase === '1차' && (
                    <div style={subSectionStyle}>
                      <div style={subLabel}>1차 교정 항목</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                        {['근기능치료 (프리올소)', '악궁확장', '앞니배열'].map(item => (
                          <button key={item} onClick={() => toggleOptionArray(idx, 'primary', item)} style={chipStyle((opt.primary || []).includes(item), '#7c3aed')}>{item}</button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 2차 교정 하위 */}
                  {opt.phase === '2차' && (
                    <div style={subSectionStyle}>
                      <div style={subLabel}>공간 확보 방법</div>

                      {/* 악궁 확장 */}
                      <div style={itemRowStyle}>
                        <div style={{ ...labelStyle, width: '120px' }}>악궁 확장</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
                          <button onClick={() => updateOption(idx, 'expansion', !opt.expansion)} style={chipStyle(opt.expansion, '#2563eb')}>필요</button>
                          {opt.expansion && (
                            <input
                              type="text"
                              value={opt.expansionType || ''}
                              onChange={e => updateOption(idx, 'expansionType', e.target.value)}
                              placeholder="RPE, MSE, SARPE 등"
                              style={{ ...textInputStyle, minWidth: '140px', maxWidth: '200px' }}
                            />
                          )}
                        </div>
                      </div>

                      {/* 후방이동 */}
                      <div style={itemRowStyle}>
                        <div style={{ ...labelStyle, width: '120px' }}>후방이동</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
                          <button onClick={() => updateOption(idx, 'distalization', !opt.distalization)} style={chipStyle(opt.distalization, '#2563eb')}>필요</button>
                          {opt.distalization && (
                            <input
                              type="text"
                              value={opt.distalExtraction || ''}
                              onChange={e => updateOption(idx, 'distalExtraction', e.target.value)}
                              placeholder="#7/#8 발치 여부"
                              style={{ ...textInputStyle, minWidth: '140px', maxWidth: '200px' }}
                            />
                          )}
                        </div>
                      </div>

                      {/* 치간삭제 */}
                      <div style={itemRowStyle}>
                        <div style={{ ...labelStyle, width: '120px' }}>치간삭제</div>
                        <button onClick={() => updateOption(idx, 'stripping', !opt.stripping)} style={chipStyle(opt.stripping, '#2563eb')}>필요</button>
                      </div>

                      {/* 발치 사분면 */}
                      <div style={{ marginTop: '16px' }}>
                        <div style={subLabel}>발치 부위</div>
                        <div style={{ fontSize: '12px', color: '#9ca3af', marginBottom: '8px' }}>선택하지 않은 부위 = 비발치</div>
                        <ExtractionQuadrant opt={opt} idx={idx} updateOption={updateOption} />
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* 기타 */}
              <div style={{ ...itemRowStyle, marginTop: '12px' }}>
                <div style={labelStyle}>기타</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {['매복치', '잇몸수술', '악교정 수술'].map(item => (
                    <button key={item} onClick={() => toggleOptionArray(idx, 'txEtc', item)} style={chipStyle((opt.txEtc || []).includes(item), '#059669')}>{item}</button>
                  ))}
                </div>
              </div>

              {/* 개요 + 기간 */}
              <div style={{ marginTop: '12px' }}>
                <FieldRow label="치료 개요">
                  <textarea
                    value={opt.description || ''}
                    onChange={e => updateOption(idx, 'description', e.target.value)}
                    placeholder="치료 개요를 입력하세요"
                    style={{ ...fieldInputStyle, minHeight: '60px', resize: 'vertical' }}
                    rows={2}
                  />
                </FieldRow>
                <FieldRow label="예상 기간">
                  <input
                    type="text"
                    value={opt.duration || ''}
                    onChange={e => updateOption(idx, 'duration', e.target.value)}
                    placeholder="예: 약 2년 6개월 (선택)"
                    style={fieldInputStyle}
                  />
                </FieldRow>
              </div>
            </div>
          ))}

          <button onClick={addOption} style={addOptionBtn}>+ 옵션 추가</button>

          {/* 치료 목표 + 추가 정보 */}
          <div style={sectionStyle}>
            <SectionHeader label="치료 목표" color="#374151" />
            <textarea
              value={value.treatmentGoal || ''}
              onChange={e => updateTopLevel('treatmentGoal', e.target.value)}
              placeholder="교정 치료의 목표를 입력하세요"
              style={{ ...fieldInputStyle, minHeight: '70px', resize: 'vertical' }}
              rows={3}
            />
            <div style={{ marginTop: '16px' }}>
              <textarea
                value={value.treatmentMemo || ''}
                onChange={e => updateTopLevel('treatmentMemo', e.target.value)}
                placeholder="추가 정보 (주의사항, 동반 치료 등)"
                style={memoStyle}
                rows={2}
              />
            </div>
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

function ExtractionQuadrant({ opt, idx, updateOption }) {
  const quadrants = [
    { key: 'ext_UR', label: '#1 상우' },
    { key: 'ext_UL', label: '#2 상좌' },
    { key: 'ext_LR', label: '#4 하우' },
    { key: 'ext_LL', label: '#3 하좌' },
  ]
  const options = ['', '4번', '5번', '기타']

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '1fr auto 1fr',
      gridTemplateRows: 'auto auto',
      gap: '0',
      maxWidth: '340px',
      margin: '0 auto',
    }}>
      {/* 상우 #1 */}
      <div style={quadCellStyle('right', 'bottom')}>
        <div style={quadLabel}>#1 상우</div>
        <select value={opt.ext_UR || ''} onChange={e => updateOption(idx, 'ext_UR', e.target.value)} style={quadSelect(opt.ext_UR)}>
          <option value="">비발치</option>
          {['4번', '5번', '기타'].map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      </div>
      {/* 중앙선 상 */}
      <div style={{ borderBottom: '2px solid #9ca3af', width: '2px', background: '#9ca3af' }} />
      {/* 상좌 #2 */}
      <div style={quadCellStyle('left', 'bottom')}>
        <div style={quadLabel}>#2 상좌</div>
        <select value={opt.ext_UL || ''} onChange={e => updateOption(idx, 'ext_UL', e.target.value)} style={quadSelect(opt.ext_UL)}>
          <option value="">비발치</option>
          {['4번', '5번', '기타'].map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      </div>
      {/* 하우 #4 */}
      <div style={quadCellStyle('right', 'top')}>
        <div style={quadLabel}>#4 하우</div>
        <select value={opt.ext_LR || ''} onChange={e => updateOption(idx, 'ext_LR', e.target.value)} style={quadSelect(opt.ext_LR)}>
          <option value="">비발치</option>
          {['4번', '5번', '기타'].map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      </div>
      {/* 중앙선 하 */}
      <div style={{ borderTop: '2px solid #9ca3af', width: '2px', background: '#9ca3af' }} />
      {/* 하좌 #3 */}
      <div style={quadCellStyle('left', 'top')}>
        <div style={quadLabel}>#3 하좌</div>
        <select value={opt.ext_LL || ''} onChange={e => updateOption(idx, 'ext_LL', e.target.value)} style={quadSelect(opt.ext_LL)}>
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
