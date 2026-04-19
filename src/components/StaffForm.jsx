import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const DEFAULT_CATEGORIES = {
  personality: { label: '환자 성향', options: ['꼼꼼한 편', '감성적', '결정 빠름', '망설임 많음', '바쁜 분', '고령'] },
  anxiety:     { label: '불안 요소', options: ['치료 통증', '마취', '치과 공포', '부작용 우려', '치료 기간', '재발'] },
  costReaction:{ label: '비용 반응', options: ['신경 안 씀', '부담 있지만 수용', '분명히 부담', '할부 문의', '결정 못함'] },
  interests:   { label: '관심사',    options: ['심미', '교정 후 인상', '빠른 치료', '최소 내원', '치아 유지', '자녀 상담'] },
}

const DEFAULT_SLIDERS = {
  willingness:   { label: '치료 의지', min: '매우 소극적', max: '매우 적극적' },
  understanding: { label: '이해도',    min: '설명 많이 필요', max: '잘 이해함' },
}

export default function StaffForm({ value, onChange }) {
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES)
  const [sliders, setSliders] = useState(DEFAULT_SLIDERS)

  useEffect(() => { loadConfig() }, [])

  const loadConfig = async () => {
    const { data } = await supabase
      .from('clinic_settings')
      .select('value')
      .eq('id', 'staff_form_config')
      .single()
    if (data?.value) {
      if (data.value.categories) setCategories(data.value.categories)
      if (data.value.sliders) setSliders(data.value.sliders)
    }
  }

  const toggleOption = (category, option) => {
    const current = value[category] || []
    const updated = current.includes(option)
      ? current.filter((o) => o !== option)
      : [...current, option]
    onChange({ ...value, [category]: updated })
  }

  return (
    <div>
      {/* 환자 성향 */}
      <div style={blockStyle}>
        <div style={blockTitleStyle}>🎭 환자 성향</div>
        {Object.entries(categories).map(([key, { label, options }]) => (
          <div key={key} style={{ marginBottom: '14px' }}>
            <div style={sectionLabelStyle}>{label}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {options.map((opt) => {
                const selected = (value[key] || []).includes(opt)
                return (
                  <button
                    key={opt}
                    onClick={() => toggleOption(key, opt)}
                    style={chipStyle(selected)}
                  >
                    {opt}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {/* 의지 · 이해도 */}
      <div style={blockStyle}>
        <div style={blockTitleStyle}>📊 의지 · 이해도</div>
        {Object.entries(sliders).map(([key, { label, min, max }]) => (
          <div key={key} style={{ marginBottom: '18px' }}>
            <div style={sectionLabelStyle}>
              {label}: <span style={{ color: '#7c3aed' }}>{value[key] || 3}</span>/5
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '11px', color: '#9ca3af', minWidth: '90px', textAlign: 'right' }}>{min}</span>
              <input
                type="range" min="1" max="5"
                value={value[key] || 3}
                onChange={(e) => onChange({ ...value, [key]: parseInt(e.target.value) })}
                style={{ flex: 1, accentColor: '#7c3aed' }}
              />
              <span style={{ fontSize: '11px', color: '#9ca3af', minWidth: '90px' }}>{max}</span>
            </div>
          </div>
        ))}
      </div>

      {/* 특이 상황 */}
      <div style={{ ...blockStyle, borderBottom: 'none', paddingBottom: 0 }}>
        <div style={blockTitleStyle}>📌 특이 상황</div>
        <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '8px' }}>
          예: "충남 거주, 주말만 내원 가능" / "가족 동반 상담 원함" / "비용 분할 문의" / "직장 스케줄로 저녁만 가능"
        </div>
        <textarea
          placeholder="진단/치료 외에 AI가 문체 결정 시 반영할 정보를 자유롭게 입력..."
          value={value.specialCircumstances || ''}
          onChange={(e) => onChange({ ...value, specialCircumstances: e.target.value })}
          style={{
            width: '100%', minHeight: '120px', padding: '12px 14px',
            border: '1px solid #d1d5db', borderRadius: '10px',
            fontSize: '14px', resize: 'vertical', fontFamily: 'inherit',
            boxSizing: 'border-box', lineHeight: 1.6,
          }}
        />
      </div>
    </div>
  )
}

const blockStyle = {
  paddingBottom: '20px',
  marginBottom: '20px',
  borderBottom: '1px solid #f0ece4',
}

const blockTitleStyle = {
  fontSize: '15px',
  fontWeight: 700,
  color: '#1a1a18',
  marginBottom: '14px',
  letterSpacing: '0.02em',
}

const sectionLabelStyle = {
  fontSize: '13px', fontWeight: 600, color: '#6b7280', marginBottom: '8px',
}

const chipStyle = (selected) => ({
  padding: '6px 14px', borderRadius: '20px',
  border: selected ? '2px solid #7c3aed' : '1px solid #d1d5db',
  background: selected ? '#ede9fe' : '#fff',
  color: selected ? '#7c3aed' : '#374151',
  fontSize: '13px', fontWeight: selected ? 600 : 400,
  cursor: 'pointer', transition: 'all 0.15s',
})
