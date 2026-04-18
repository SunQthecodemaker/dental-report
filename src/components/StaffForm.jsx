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

const CONSULT_TABS = [
  { key: 'traits',     label: '환자 성향',   icon: '🎭' },
  { key: 'scales',     label: '의지 · 이해도', icon: '📊' },
  { key: 'situation',  label: '특이 상황',   icon: '📌' },
]

export default function StaffForm({ value, onChange }) {
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES)
  const [sliders, setSliders] = useState(DEFAULT_SLIDERS)
  const [tab, setTab] = useState('traits')

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
      <div style={tabBarStyle}>
        {CONSULT_TABS.map(({ key, label, icon }) => (
          <button key={key} onClick={() => setTab(key)} style={tabStyle(tab === key)}>
            <span style={{ marginRight: '6px' }}>{icon}</span>{label}
          </button>
        ))}
      </div>

      {tab === 'traits' && (
        <div>
          {Object.entries(categories).map(([key, { label, options }]) => (
            <div key={key} style={{ marginBottom: '16px' }}>
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
      )}

      {tab === 'scales' && (
        <div>
          {Object.entries(sliders).map(([key, { label, min, max }]) => (
            <div key={key} style={{ marginBottom: '20px' }}>
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
      )}

      {tab === 'situation' && (
        <div>
          <div style={sectionLabelStyle}>
            특이 상황 (자유 입력)
          </div>
          <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '8px' }}>
            예: "충남 거주, 주말만 내원 가능" / "가족 동반 상담 원함" / "비용 분할 문의" / "직장 스케줄로 저녁만 가능"
          </div>
          <textarea
            placeholder="진단/치료 외에 AI가 문체 결정 시 반영할 정보를 자유롭게 입력..."
            value={value.specialCircumstances || ''}
            onChange={(e) => onChange({ ...value, specialCircumstances: e.target.value })}
            style={{
              width: '100%', minHeight: '160px', padding: '12px 14px',
              border: '1px solid #d1d5db', borderRadius: '10px',
              fontSize: '14px', resize: 'vertical', fontFamily: 'inherit',
              boxSizing: 'border-box', lineHeight: 1.6,
            }}
          />
        </div>
      )}
    </div>
  )
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
  flex: 1, padding: '10px 16px', borderRadius: '10px', border: 'none',
  background: active ? '#fff' : 'transparent',
  color: active ? '#1f2937' : '#9ca3af',
  fontSize: '14px', fontWeight: active ? 600 : 400,
  cursor: 'pointer',
  boxShadow: active ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
  transition: 'all 0.15s',
})

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
