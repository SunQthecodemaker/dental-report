/**
 * ClinicalForm — Step 1: 의사 입력 (버튼형 문제목록 + 특이사항)
 * 선택 안 하면 = 해당 없음
 */

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
  { key: 'lipProtrusion', label: '입술 돌출감', type: 'checkbox', options: ['있음', '약간 있음'], severe: false },
  { key: 'gummySmile', label: 'Gummy smile', type: 'checkbox', options: ['있음', '약간 있음'], severe: false },
  { key: 'wisdomTeeth', label: '사랑니', type: 'checkbox', options: ['#18', '#28', '#38', '#48'], severe: false },
  { key: 'tmj', label: '턱관절 (TMJ)', type: 'checkbox', options: ['TMJ 증상', '과두 흡수 소견'], severe: true },
  { key: 'periodontal', label: '치주 상태', type: 'checkbox', options: ['치은염', '치주염'], severe: true },
  { key: 'oralHygiene', label: '구강위생상태', type: 'radio', options: ['양호', '보통', '불량'], severe: false },
  { key: 'caries', label: '충치 (우식)', type: 'checkbox', options: ['우식 활성도 높음'], severe: true },
  { key: 'shortRoot', label: '짧은 치근', type: 'text', placeholder: '치아번호 기재 (예: #12, #22)', severe: true },
  { key: 'oralHabit', label: '구강 악습관', type: 'text', placeholder: '내용 기재' },
  { key: 'systemicDisease', label: '전신질환', type: 'text', placeholder: '내용 기재' },
]

const SECTIONS = [
  { key: 'skeletal', label: '골격문제', items: SKELETAL_ITEMS, color: '#7c3aed' },
  { key: 'dental', label: '치성문제', items: DENTAL_ITEMS, color: '#2563eb' },
  { key: 'etc', label: '기타', items: ETC_ITEMS, color: '#059669' },
]

export function getEmptyClinicalForm() {
  return {
    skeletal: { memo: '' },
    dental: { memo: '' },
    etc: { memo: '' },
  }
}

export default function ClinicalForm({ value, onChange }) {
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
    if (item.type === 'checkbox') return Array.isArray(val) && val.length > 0
    return false
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {SECTIONS.map(section => (
        <div key={section.key} style={sectionStyle}>
          {/* 섹션 헤더 */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            marginBottom: '16px', paddingBottom: '10px',
            borderBottom: `2px solid ${section.color}20`,
          }}>
            <div style={{
              width: '4px', height: '20px', borderRadius: '2px',
              background: section.color,
            }} />
            <span style={{
              fontSize: '15px', fontWeight: '700',
              color: section.color,
            }}>
              {section.label}
            </span>
          </div>

          {/* 항목들 */}
          {section.items.map(item => (
            <div key={item.key} style={itemRowStyle}>
              {/* 라벨 */}
              <div style={labelStyle}>{item.label}</div>

              {/* 선택지 영역 */}
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px', flex: 1 }}>
                {item.type === 'text' ? (
                  <input
                    type="text"
                    value={value[section.key]?.[item.key] || ''}
                    onChange={e => updateField(section.key, item.key, e.target.value)}
                    placeholder={item.placeholder}
                    style={textInputStyle}
                  />
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

                {/* 심함 토글 */}
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

          {/* 특이사항 */}
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
    </div>
  )
}

/* ─── 스타일 ─── */

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
