import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useNavigate } from 'react-router-dom'

export default function Settings() {
  const navigate = useNavigate()
  const [guidelines, setGuidelines] = useState([])
  const [terms, setTerms] = useState([])
  const [strengths, setStrengths] = useState([])
  const [saving, setSaving] = useState(false)
  const [loaded, setLoaded] = useState(false)

  // 신규 입력용
  const [newGuideline, setNewGuideline] = useState('')
  const [newTermFrom, setNewTermFrom] = useState('')
  const [newTermTo, setNewTermTo] = useState('')
  const [newStrength, setNewStrength] = useState({ title: '', description: '', expressions: '' })

  useEffect(() => { loadSettings() }, [])

  const loadSettings = async () => {
    const { data } = await supabase.from('clinic_settings').select('*')
    if (data) {
      for (const row of data) {
        if (row.id === 'writing_guidelines') setGuidelines(row.value.items || [])
        if (row.id === 'terminology') setTerms(row.value.items || [])
        if (row.id === 'clinic_strengths') setStrengths(row.value.items || [])
      }
    }
    setLoaded(true)
  }

  const save = async (id, items) => {
    setSaving(true)
    await supabase.from('clinic_settings')
      .update({ value: { items }, updated_at: new Date().toISOString() })
      .eq('id', id)
    setSaving(false)
  }

  // 작성 지침
  const addGuideline = () => {
    if (!newGuideline.trim()) return
    const updated = [...guidelines, newGuideline.trim()]
    setGuidelines(updated)
    setNewGuideline('')
    save('writing_guidelines', updated)
  }
  const removeGuideline = (i) => {
    const updated = guidelines.filter((_, idx) => idx !== i)
    setGuidelines(updated)
    save('writing_guidelines', updated)
  }

  // 용어 사전
  const addTerm = () => {
    if (!newTermFrom.trim() || !newTermTo.trim()) return
    const updated = [...terms, { from: newTermFrom.trim(), to: newTermTo.trim() }]
    setTerms(updated)
    setNewTermFrom('')
    setNewTermTo('')
    save('terminology', updated)
  }
  const removeTerm = (i) => {
    const updated = terms.filter((_, idx) => idx !== i)
    setTerms(updated)
    save('terminology', updated)
  }

  // 치과 특장점
  const addStrength = () => {
    if (!newStrength.title.trim()) return
    const updated = [...strengths, {
      title: newStrength.title.trim(),
      description: newStrength.description.trim(),
      expressions: newStrength.expressions.trim(),
    }]
    setStrengths(updated)
    setNewStrength({ title: '', description: '', expressions: '' })
    save('clinic_strengths', updated)
  }
  const removeStrength = (i) => {
    const updated = strengths.filter((_, idx) => idx !== i)
    setStrengths(updated)
    save('clinic_strengths', updated)
  }

  if (!loaded) return <div style={page}>불러오는 중...</div>

  return (
    <div style={page}>
      <div style={container}>
        <div style={header}>
          <h1 style={{ fontSize: '20px', fontWeight: '700', color: '#1e3a5f', margin: 0 }}>
            진단서 AI 설정
          </h1>
          <button onClick={() => navigate('/')} style={backBtn}>
            ← 편집으로 돌아가기
          </button>
        </div>

        {saving && <div style={savingBar}>저장 중...</div>}

        {/* 1. 작성 지침 */}
        <div style={section}>
          <h2 style={sectionTitle}>작성 지침</h2>
          <p style={sectionDesc}>
            AI가 진단서를 작성할 때 따라야 할 규칙입니다. 톤, 문체, 주의사항 등을 자유롭게 추가하세요.
          </p>

          {guidelines.map((g, i) => (
            <div key={i} style={itemRow}>
              <div style={itemText}>{g}</div>
              <button onClick={() => removeGuideline(i)} style={removeBtn}>삭제</button>
            </div>
          ))}

          <div style={addRow}>
            <input
              value={newGuideline}
              onChange={(e) => setNewGuideline(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addGuideline()}
              placeholder="예: 환자가 불안해하면 반드시 안심 문구를 넣어줘"
              style={inputFull}
            />
            <button onClick={addGuideline} style={addBtn}>추가</button>
          </div>
        </div>

        {/* 2. 용어/표현 사전 */}
        <div style={section}>
          <h2 style={sectionTitle}>용어/표현 사전</h2>
          <p style={sectionDesc}>
            특정 용어나 표현을 AI가 항상 원하는 방식으로 변환하도록 등록합니다.
          </p>

          {terms.map((t, i) => (
            <div key={i} style={itemRow}>
              <div style={itemText}>
                <span style={{ color: '#ef4444' }}>{t.from}</span>
                <span style={{ color: '#9ca3af', margin: '0 8px' }}>→</span>
                <span style={{ color: '#059669' }}>{t.to}</span>
              </div>
              <button onClick={() => removeTerm(i)} style={removeBtn}>삭제</button>
            </div>
          ))}

          <div style={{ ...addRow, gap: '8px' }}>
            <input
              value={newTermFrom}
              onChange={(e) => setNewTermFrom(e.target.value)}
              placeholder="변환 전 (예: Class II)"
              style={{ ...inputFull, flex: 1 }}
            />
            <span style={{ color: '#9ca3af', fontSize: '18px' }}>→</span>
            <input
              value={newTermTo}
              onChange={(e) => setNewTermTo(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addTerm()}
              placeholder="변환 후 (예: 윗니가 앞으로 나온 상태)"
              style={{ ...inputFull, flex: 1 }}
            />
            <button onClick={addTerm} style={addBtn}>추가</button>
          </div>
        </div>

        {/* 3. 치과 특장점 */}
        <div style={section}>
          <h2 style={sectionTitle}>치과 특장점</h2>
          <p style={sectionDesc}>
            우리 치과의 강점을 등록하면, 해당 치료가 언급될 때 AI가 자연스럽게 강조 표현을 넣습니다.
          </p>

          {strengths.map((s, i) => (
            <div key={i} style={strengthCard}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: '15px', fontWeight: '700', color: '#1e3a5f' }}>{s.title}</div>
                <button onClick={() => removeStrength(i)} style={removeBtn}>삭제</button>
              </div>
              {s.description && <div style={{ fontSize: '13px', color: '#4b5563', marginTop: '4px' }}>{s.description}</div>}
              {s.expressions && (
                <div style={{ fontSize: '12px', color: '#7c3aed', marginTop: '6px', fontStyle: 'italic' }}>
                  활용 표현: {s.expressions}
                </div>
              )}
            </div>
          ))}

          <div style={strengthForm}>
            <input
              value={newStrength.title}
              onChange={(e) => setNewStrength({ ...newStrength, title: e.target.value })}
              placeholder="특장점명 (예: 설측교정 전문)"
              style={inputFull}
            />
            <textarea
              value={newStrength.description}
              onChange={(e) => setNewStrength({ ...newStrength, description: e.target.value })}
              placeholder="설명 (예: 교정과 전문의가 직접 시행하는 설측교정, 겉으로 보이지 않는 교정)"
              style={{ ...inputFull, minHeight: '60px', resize: 'vertical' }}
            />
            <textarea
              value={newStrength.expressions}
              onChange={(e) => setNewStrength({ ...newStrength, expressions: e.target.value })}
              placeholder="AI가 사용할 표현 예시 (예: 교정 장치가 보이지 않아 직장생활이나 대인관계에 전혀 지장이 없습니다)"
              style={{ ...inputFull, minHeight: '60px', resize: 'vertical' }}
            />
            <button onClick={addStrength} style={{ ...addBtn, alignSelf: 'flex-end' }}>추가</button>
          </div>
        </div>
      </div>
    </div>
  )
}

const page = {
  minHeight: '100vh',
  background: '#f0f2f5',
  fontFamily: "'Pretendard', sans-serif",
  padding: '24px',
}
const container = {
  maxWidth: '800px',
  margin: '0 auto',
}
const header = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: '32px',
}
const backBtn = {
  padding: '8px 16px',
  background: '#6b7280',
  color: '#fff',
  border: 'none',
  borderRadius: '8px',
  fontSize: '13px',
  fontWeight: '600',
  cursor: 'pointer',
}
const savingBar = {
  background: '#dbeafe',
  color: '#1d4ed8',
  padding: '8px 16px',
  borderRadius: '8px',
  fontSize: '13px',
  marginBottom: '16px',
  textAlign: 'center',
}
const section = {
  background: '#fff',
  borderRadius: '12px',
  padding: '24px',
  marginBottom: '20px',
  boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
}
const sectionTitle = {
  fontSize: '17px',
  fontWeight: '700',
  color: '#1e3a5f',
  margin: '0 0 4px',
}
const sectionDesc = {
  fontSize: '13px',
  color: '#9ca3af',
  margin: '0 0 16px',
}
const itemRow = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '10px 14px',
  background: '#f9fafb',
  borderRadius: '8px',
  marginBottom: '8px',
  border: '1px solid #e5e7eb',
}
const itemText = {
  fontSize: '14px',
  color: '#374151',
  flex: 1,
}
const removeBtn = {
  padding: '4px 10px',
  background: 'none',
  color: '#ef4444',
  border: '1px solid #fecaca',
  borderRadius: '6px',
  fontSize: '12px',
  cursor: 'pointer',
  marginLeft: '8px',
  flexShrink: 0,
}
const addRow = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  marginTop: '8px',
}
const inputFull = {
  flex: 1,
  padding: '10px 12px',
  border: '1px solid #d1d5db',
  borderRadius: '8px',
  fontSize: '14px',
  fontFamily: 'inherit',
  boxSizing: 'border-box',
  width: '100%',
}
const addBtn = {
  padding: '10px 20px',
  background: '#7c3aed',
  color: '#fff',
  border: 'none',
  borderRadius: '8px',
  fontSize: '14px',
  fontWeight: '600',
  cursor: 'pointer',
  flexShrink: 0,
}
const strengthCard = {
  padding: '14px 16px',
  background: '#f0f7ff',
  borderRadius: '10px',
  marginBottom: '10px',
  border: '1px solid #bfdbfe',
}
const strengthForm = {
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
  marginTop: '12px',
  padding: '16px',
  background: '#fafafa',
  borderRadius: '10px',
  border: '1px dashed #d1d5db',
}
