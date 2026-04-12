const CATEGORIES = {
  personality: {
    label: '환자 성향',
    options: ['꼼꼼한 편', '감성적', '결정 빠름', '망설임 많음', '바쁜 분', '고령'],
  },
  anxiety: {
    label: '불안 요소',
    options: ['치료 통증', '마취', '치과 공포', '부작용 우려', '치료 기간', '재발'],
  },
  costReaction: {
    label: '비용 반응',
    options: ['신경 안 씀', '부담 있지만 수용', '분명히 부담', '할부 문의', '결정 못함'],
  },
  interests: {
    label: '관심사',
    options: ['심미', '교정 후 인상', '빠른 치료', '최소 내원', '치아 유지', '자녀 상담'],
  },
}

const SLIDERS = {
  willingness: { label: '치료 의지', min: '매우 소극적', max: '매우 적극적' },
  understanding: { label: '이해도', min: '설명 많이 필요', max: '잘 이해함' },
}

export default function StaffForm({ value, onChange }) {
  const toggleOption = (category, option) => {
    const current = value[category] || []
    const updated = current.includes(option)
      ? current.filter((o) => o !== option)
      : [...current, option]
    onChange({ ...value, [category]: updated })
  }

  return (
    <div>
      {Object.entries(CATEGORIES).map(([key, { label, options }]) => (
        <div key={key} style={{ marginBottom: '16px' }}>
          <div style={{
            fontSize: '13px',
            fontWeight: '600',
            color: '#6b7280',
            marginBottom: '8px',
          }}>
            {label}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {options.map((opt) => {
              const selected = (value[key] || []).includes(opt)
              return (
                <button
                  key={opt}
                  onClick={() => toggleOption(key, opt)}
                  style={{
                    padding: '6px 14px',
                    borderRadius: '20px',
                    border: selected ? '2px solid #7c3aed' : '1px solid #d1d5db',
                    background: selected ? '#ede9fe' : '#fff',
                    color: selected ? '#7c3aed' : '#374151',
                    fontSize: '13px',
                    fontWeight: selected ? '600' : '400',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                >
                  {opt}
                </button>
              )
            })}
          </div>
        </div>
      ))}

      {Object.entries(SLIDERS).map(([key, { label, min, max }]) => (
        <div key={key} style={{ marginBottom: '16px' }}>
          <div style={{
            fontSize: '13px',
            fontWeight: '600',
            color: '#6b7280',
            marginBottom: '8px',
          }}>
            {label}: <span style={{ color: '#7c3aed' }}>{value[key] || 3}</span>/5
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '11px', color: '#9ca3af' }}>{min}</span>
            <input
              type="range"
              min="1"
              max="5"
              value={value[key] || 3}
              onChange={(e) => onChange({ ...value, [key]: parseInt(e.target.value) })}
              style={{ flex: 1, accentColor: '#7c3aed' }}
            />
            <span style={{ fontSize: '11px', color: '#9ca3af' }}>{max}</span>
          </div>
        </div>
      ))}

      {/* 추가 메모 */}
      <div>
        <div style={{
          fontSize: '13px',
          fontWeight: '600',
          color: '#6b7280',
          marginBottom: '8px',
        }}>
          추가 메모 (선택)
        </div>
        <textarea
          placeholder="특이사항이 있으면 자유롭게 입력..."
          value={value.memo || ''}
          onChange={(e) => onChange({ ...value, memo: e.target.value })}
          style={{
            width: '100%',
            minHeight: '60px',
            padding: '10px',
            border: '1px solid #d1d5db',
            borderRadius: '8px',
            fontSize: '13px',
            resize: 'vertical',
            fontFamily: 'inherit',
          }}
        />
      </div>
    </div>
  )
}
