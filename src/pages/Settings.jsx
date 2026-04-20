import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useNavigate } from 'react-router-dom'
import { saveTreatmentCases, saveStrengthCards, uploadLibraryPhoto, newCaseId } from '../lib/library'
import { useId } from 'react'

const TABS = [
  { id: 'guidelines', label: '작성 지침' },
  { id: 'terminology', label: '용어 사전' },
  { id: 'strengths', label: 'AI 특장점' },
  { id: 'cases', label: '유사 케이스' },
  { id: 'strengthCards', label: '장점 카드' },
  { id: 'staffForm', label: '상담 폼 항목' },
]

export default function Settings() {
  const navigate = useNavigate()
  const [tab, setTab] = useState('guidelines')
  const [guidelines, setGuidelines] = useState([])
  const [terms, setTerms] = useState([])
  const [strengths, setStrengths] = useState([])
  const [cases, setCases] = useState([])
  const [strengthCards, setStrengthCards] = useState([])
  const [formConfig, setFormConfig] = useState(null)
  const [saving, setSaving] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => { loadSettings() }, [])

  const loadSettings = async () => {
    const { data } = await supabase.from('clinic_settings').select('*')
    if (data) {
      for (const row of data) {
        if (row.id === 'writing_guidelines') setGuidelines(row.value.items || [])
        if (row.id === 'terminology') setTerms(row.value.items || [])
        if (row.id === 'clinic_strengths') setStrengths(row.value.items || [])
        if (row.id === 'treatment_cases') setCases(row.value.items || [])
        if (row.id === 'strength_cards') setStrengthCards(row.value.items || [])
        if (row.id === 'staff_form_config') setFormConfig(row.value)
      }
    }
    setLoaded(true)
  }

  const saveAsync = async (saver, items) => {
    setSaving(true)
    try { await saver(items) } finally { setSaving(false) }
  }

  const save = async (id, value) => {
    setSaving(true)
    const saveValue = id === 'staff_form_config' ? value : { items: value }
    await supabase.from('clinic_settings')
      .update({ value: saveValue, updated_at: new Date().toISOString() })
      .eq('id', id)
    setSaving(false)
  }

  if (!loaded) return <div style={S.page}><div style={S.container}>불러오는 중...</div></div>

  return (
    <div style={S.page}>
      <div style={S.container}>
        {/* 헤더 */}
        <div style={S.header}>
          <h1 style={{ fontSize: '20px', fontWeight: '700', color: '#1e3a5f', margin: 0 }}>
            진단서 AI 설정
          </h1>
          <button onClick={() => navigate('/')} style={S.backBtn}>← 편집으로 돌아가기</button>
        </div>

        {saving && <div style={S.savingBar}>저장 중...</div>}

        {/* 탭 바 */}
        <div style={S.tabBar}>
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={tab === t.id ? S.tabActive : S.tabInactive}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* 탭 내용 */}
        <div style={S.tabContent}>
          {tab === 'guidelines' && (
            <GuidelinesTab
              items={guidelines}
              onChange={(v) => { setGuidelines(v); save('writing_guidelines', v) }}
            />
          )}
          {tab === 'terminology' && (
            <TerminologyTab
              items={terms}
              onChange={(v) => { setTerms(v); save('terminology', v) }}
            />
          )}
          {tab === 'strengths' && (
            <StrengthsTab
              items={strengths}
              onChange={(v) => { setStrengths(v); save('clinic_strengths', v) }}
            />
          )}
          {tab === 'cases' && (
            <CasesTab
              items={cases}
              onChange={(v) => { setCases(v); saveAsync(saveTreatmentCases, v) }}
            />
          )}
          {tab === 'strengthCards' && (
            <StrengthCardsTab
              items={strengthCards}
              onChange={(v) => { setStrengthCards(v); saveAsync(saveStrengthCards, v) }}
            />
          )}
          {tab === 'staffForm' && formConfig && (
            <StaffFormTab
              config={formConfig}
              onChange={(v) => { setFormConfig(v); save('staff_form_config', v) }}
            />
          )}
        </div>
      </div>
    </div>
  )
}

// ─── 작성 지침 탭 ───
function GuidelinesTab({ items, onChange }) {
  const [text, setText] = useState('')
  const add = () => {
    if (!text.trim()) return
    onChange([...items, text.trim()])
    setText('')
  }
  return (
    <>
      <p style={S.desc}>AI가 진단서를 작성할 때 따라야 할 규칙입니다.</p>
      {items.map((g, i) => (
        <div key={i} style={S.itemRow}>
          <div style={S.itemText}>{g}</div>
          <button onClick={() => onChange(items.filter((_, idx) => idx !== i))} style={S.delBtn}>삭제</button>
        </div>
      ))}
      <div style={S.addRow}>
        <input value={text} onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          placeholder="예: 환자가 불안해하면 반드시 안심 문구를 넣어줘" style={S.input} />
        <button onClick={add} style={S.addBtn}>추가</button>
      </div>
    </>
  )
}

// ─── 용어 사전 탭 ───
function TerminologyTab({ items, onChange }) {
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const add = () => {
    if (!from.trim() || !to.trim()) return
    onChange([...items, { from: from.trim(), to: to.trim() }])
    setFrom(''); setTo('')
  }
  return (
    <>
      <p style={S.desc}>특정 용어를 AI가 항상 원하는 방식으로 변환합니다.</p>
      {items.map((t, i) => (
        <div key={i} style={S.itemRow}>
          <div style={S.itemText}>
            <span style={{ color: '#ef4444' }}>{t.from}</span>
            <span style={{ color: '#9ca3af', margin: '0 8px' }}>→</span>
            <span style={{ color: '#059669' }}>{t.to}</span>
          </div>
          <button onClick={() => onChange(items.filter((_, idx) => idx !== i))} style={S.delBtn}>삭제</button>
        </div>
      ))}
      <div style={{ ...S.addRow, gap: '8px' }}>
        <input value={from} onChange={(e) => setFrom(e.target.value)}
          placeholder="변환 전 (예: Class II)" style={{ ...S.input, flex: 1 }} />
        <span style={{ color: '#9ca3af', fontSize: '18px' }}>→</span>
        <input value={to} onChange={(e) => setTo(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          placeholder="변환 후 (예: 윗니가 앞으로 나온 상태)" style={{ ...S.input, flex: 1 }} />
        <button onClick={add} style={S.addBtn}>추가</button>
      </div>
    </>
  )
}

// ─── 치과 특장점 탭 ───
function StrengthsTab({ items, onChange }) {
  const [text, setText] = useState('')
  const add = () => {
    if (!text.trim()) return
    onChange([...items, text.trim()])
    setText('')
  }
  return (
    <>
      <p style={S.desc}>
        우리 치과의 강점, AI가 활용할 표현, 강조할 포인트 등을 자유롭게 한 줄씩 추가하세요.<br />
        등록된 내용은 AI가 진단서 작성 시 참고합니다.
      </p>
      {items.map((s, i) => (
        <div key={i} style={S.itemRow}>
          <div style={S.itemText}>{typeof s === 'string' ? s : s.title || JSON.stringify(s)}</div>
          <button onClick={() => onChange(items.filter((_, idx) => idx !== i))} style={S.delBtn}>삭제</button>
        </div>
      ))}
      <div style={S.addRow}>
        <input value={text} onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          placeholder="예: 설측교정 전문 — 교정과 전문의가 직접 시행, 겉으로 보이지 않는 교정"
          style={S.input} />
        <button onClick={add} style={S.addBtn}>추가</button>
      </div>
    </>
  )
}

// ─── 유사 케이스 탭 (전후 사진 1~2 set + 설명) ───
function CasesTab({ items, onChange }) {
  const [expanded, setExpanded] = useState(null)

  const addCase = () => {
    const item = { id: newCaseId(), title: '', description: '', pairs: [{ before_url: '', after_url: '' }] }
    onChange([...items, item])
    setExpanded(item.id)
  }

  const updateCase = (id, patch) => {
    onChange(items.map(c => c.id === id ? { ...c, ...patch } : c))
  }

  const removeCase = (id) => {
    if (!confirm('이 케이스를 삭제할까요?')) return
    onChange(items.filter(c => c.id !== id))
  }

  const addPair = (id) => {
    const c = items.find(x => x.id === id)
    if (!c) return
    if ((c.pairs || []).length >= 2) return
    updateCase(id, { pairs: [...(c.pairs || []), { before_url: '', after_url: '' }] })
  }

  const removePair = (id, pairIdx) => {
    const c = items.find(x => x.id === id)
    if (!c) return
    updateCase(id, { pairs: (c.pairs || []).filter((_, i) => i !== pairIdx) })
  }

  const uploadPairPhoto = async (id, pairIdx, key, file) => {
    try {
      const url = await uploadLibraryPhoto(file, 'cases')
      const c = items.find(x => x.id === id)
      if (!c) return
      const pairs = (c.pairs || []).slice()
      pairs[pairIdx] = { ...pairs[pairIdx], [key]: url }
      updateCase(id, { pairs })
    } catch (err) { alert('업로드 실패: ' + err.message) }
  }

  return (
    <>
      <p style={S.desc}>
        Before/After 사진 1~2세트와 간단한 설명. 환자별 진단서에서 <strong>원하는 케이스를 선택</strong>해 삽입합니다.
      </p>
      {items.map(c => {
        const open = expanded === c.id
        return (
          <div key={c.id} style={S.catCard}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: open ? 12 : 0 }}>
              <button onClick={() => setExpanded(open ? null : c.id)} style={{ ...S.addBtn, padding: '4px 10px', background: '#6b7280' }}>
                {open ? '접기' : '펼치기'}
              </button>
              <input
                value={c.title} onChange={(e) => updateCase(c.id, { title: e.target.value })}
                placeholder="케이스 제목 (예: 성인 돌출입 비발치 교정)"
                style={{ ...S.input, flex: 1 }}
              />
              <button onClick={() => removeCase(c.id)} style={S.delBtn}>삭제</button>
            </div>
            {open && (
              <>
                <textarea
                  value={c.description} onChange={(e) => updateCase(c.id, { description: e.target.value })}
                  placeholder="간단한 설명 (치료 기간/특징/결과 등 1~3줄)"
                  style={{ ...S.input, minHeight: 60, resize: 'vertical', marginTop: 8 }}
                />
                {(c.pairs || []).map((p, i) => (
                  <div key={i} style={S.pairBox}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#6b7280' }}>세트 {i + 1}</div>
                      {(c.pairs || []).length > 1 && (
                        <button onClick={() => removePair(c.id, i)} style={S.delBtn}>세트 삭제</button>
                      )}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <PhotoSlot label="Before" url={p.before_url} onFile={(f) => uploadPairPhoto(c.id, i, 'before_url', f)} onClear={() => {
                        const pairs = c.pairs.slice(); pairs[i] = { ...pairs[i], before_url: '' }; updateCase(c.id, { pairs })
                      }} />
                      <PhotoSlot label="After" url={p.after_url} onFile={(f) => uploadPairPhoto(c.id, i, 'after_url', f)} onClear={() => {
                        const pairs = c.pairs.slice(); pairs[i] = { ...pairs[i], after_url: '' }; updateCase(c.id, { pairs })
                      }} />
                    </div>
                  </div>
                ))}
                {(c.pairs || []).length < 2 && (
                  <button onClick={() => addPair(c.id)} style={{ ...S.addBtn, background: '#6b7280', marginTop: 8 }}>
                    + 세트 추가 (최대 2)
                  </button>
                )}
              </>
            )}
          </div>
        )
      })}
      <button onClick={addCase} style={{ ...S.addBtn, width: '100%', padding: '12px' }}>+ 케이스 추가</button>
    </>
  )
}

// ─── 장점 카드 탭 (사진 1 + 설명 + 상세 링크) ───
function StrengthCardsTab({ items, onChange }) {
  const addCard = () => {
    onChange([...items, { id: newCaseId(), title: '', description: '', photo_url: '', detail_url: '' }])
  }
  const updateCard = (id, patch) => onChange(items.map(c => c.id === id ? { ...c, ...patch } : c))
  const removeCard = (id) => {
    if (!confirm('이 장점 카드를 삭제할까요?')) return
    onChange(items.filter(c => c.id !== id))
  }
  const uploadPhoto = async (id, file) => {
    try {
      const url = await uploadLibraryPhoto(file, 'strengths')
      updateCard(id, { photo_url: url })
    } catch (err) { alert('업로드 실패: ' + err.message) }
  }

  return (
    <>
      <p style={S.desc}>
        우리 치과의 장점을 카드로 관리합니다. 환자별 진단서에서 <strong>원하는 장점만 선택</strong>해 삽입합니다.
      </p>
      {items.map(c => (
        <div key={c.id} style={S.catCard}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
            <input
              value={c.title} onChange={(e) => updateCard(c.id, { title: e.target.value })}
              placeholder="장점 제목 (예: 교정과 전문의가 직접)"
              style={{ ...S.input, flex: 1 }}
            />
            <button onClick={() => removeCard(c.id)} style={S.delBtn}>삭제</button>
          </div>
          <textarea
            value={c.description} onChange={(e) => updateCard(c.id, { description: e.target.value })}
            placeholder="간단한 설명 (1~3줄)"
            style={{ ...S.input, minHeight: 60, resize: 'vertical', marginBottom: 8 }}
          />
          <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 10, alignItems: 'start' }}>
            <PhotoSlot label="대표 사진" url={c.photo_url} onFile={(f) => uploadPhoto(c.id, f)} onClear={() => updateCard(c.id, { photo_url: '' })} />
            <div>
              <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4, fontWeight: 600 }}>홈페이지 상세 링크</div>
              <input
                value={c.detail_url} onChange={(e) => updateCard(c.id, { detail_url: e.target.value })}
                placeholder="https://..."
                style={S.input}
              />
            </div>
          </div>
        </div>
      ))}
      <button onClick={addCard} style={{ ...S.addBtn, width: '100%', padding: '12px' }}>+ 장점 카드 추가</button>
    </>
  )
}

function PhotoSlot({ label, url, onFile, onClear }) {
  const inputId = useId()
  return (
    <div style={{ border: '1px dashed #d1d5db', borderRadius: 8, padding: 8, background: '#fff' }}>
      <div style={{ fontSize: 11, color: '#6b7280', fontWeight: 700, marginBottom: 6 }}>{label}</div>
      {url ? (
        <div style={{ position: 'relative' }}>
          <img src={url} alt="" style={{ width: '100%', maxHeight: 140, objectFit: 'cover', borderRadius: 6, display: 'block' }} />
          <button onClick={onClear} style={{ position: 'absolute', top: 4, right: 4, padding: '2px 8px', background: 'rgba(0,0,0,0.6)', color: '#fff', border: 'none', borderRadius: 4, fontSize: 11, cursor: 'pointer' }}>제거</button>
        </div>
      ) : (
        <label htmlFor={inputId} style={{ display: 'block', padding: '24px 8px', textAlign: 'center', background: '#f9fafb', borderRadius: 6, fontSize: 12, color: '#6b7280', cursor: 'pointer' }}>
          + 사진 업로드
        </label>
      )}
      <input
        id={inputId} type="file" accept="image/*"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = '' }}
        style={{ display: 'none' }}
      />
    </div>
  )
}

// ─── 상담 폼 항목 관리 탭 ───
function StaffFormTab({ config, onChange }) {
  const [newOptions, setNewOptions] = useState({}) // { categoryKey: '새 항목' }
  const [newCatKey, setNewCatKey] = useState('')
  const [newCatLabel, setNewCatLabel] = useState('')
  const [newSliderKey, setNewSliderKey] = useState('')
  const [newSliderLabel, setNewSliderLabel] = useState('')
  const [newSliderMin, setNewSliderMin] = useState('')
  const [newSliderMax, setNewSliderMax] = useState('')

  const categories = config.categories || {}
  const sliders = config.sliders || {}

  // 카테고리에 옵션 추가
  const addOption = (catKey) => {
    const val = (newOptions[catKey] || '').trim()
    if (!val) return
    const updated = { ...config }
    updated.categories[catKey].options = [...updated.categories[catKey].options, val]
    onChange(updated)
    setNewOptions({ ...newOptions, [catKey]: '' })
  }

  // 카테고리에서 옵션 삭제
  const removeOption = (catKey, optIdx) => {
    const updated = { ...config }
    updated.categories[catKey].options = updated.categories[catKey].options.filter((_, i) => i !== optIdx)
    onChange(updated)
  }

  // 카테고리 자체 삭제
  const removeCategory = (catKey) => {
    const updated = { ...config }
    delete updated.categories[catKey]
    onChange(updated)
  }

  // 새 카테고리 추가
  const addCategory = () => {
    if (!newCatKey.trim() || !newCatLabel.trim()) return
    const key = newCatKey.trim().replace(/\s+/g, '_')
    const updated = { ...config }
    updated.categories[key] = { label: newCatLabel.trim(), options: [] }
    onChange(updated)
    setNewCatKey('')
    setNewCatLabel('')
  }

  // 슬라이더 삭제
  const removeSlider = (key) => {
    const updated = { ...config }
    delete updated.sliders[key]
    onChange(updated)
  }

  // 새 슬라이더 추가
  const addSlider = () => {
    if (!newSliderKey.trim() || !newSliderLabel.trim()) return
    const key = newSliderKey.trim().replace(/\s+/g, '_')
    const updated = { ...config }
    updated.sliders[key] = { label: newSliderLabel.trim(), min: newSliderMin.trim() || '1', max: newSliderMax.trim() || '5' }
    onChange(updated)
    setNewSliderKey('')
    setNewSliderLabel('')
    setNewSliderMin('')
    setNewSliderMax('')
  }

  return (
    <>
      <p style={S.desc}>상담 정보 입력 폼의 카테고리와 선택 항목을 관리합니다.</p>

      {/* 버튼 선택형 카테고리들 */}
      <h3 style={S.subTitle}>버튼 선택 항목</h3>
      {Object.entries(categories).map(([key, cat]) => (
        <div key={key} style={S.catCard}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <div style={{ fontSize: '15px', fontWeight: '700', color: '#1e3a5f' }}>{cat.label}</div>
            <button onClick={() => removeCategory(key)} style={S.delBtn}>카테고리 삭제</button>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '10px' }}>
            {cat.options.map((opt, i) => (
              <div key={i} style={S.optionChip}>
                <span>{opt}</span>
                <button onClick={() => removeOption(key, i)} style={S.chipDel}>×</button>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              value={newOptions[key] || ''}
              onChange={(e) => setNewOptions({ ...newOptions, [key]: e.target.value })}
              onKeyDown={(e) => e.key === 'Enter' && addOption(key)}
              placeholder="새 항목 입력"
              style={{ ...S.input, flex: 1 }}
            />
            <button onClick={() => addOption(key)} style={S.addBtn}>추가</button>
          </div>
        </div>
      ))}

      {/* 새 카테고리 추가 */}
      <div style={S.formBox}>
        <div style={{ fontSize: '13px', fontWeight: '600', color: '#6b7280', marginBottom: '8px' }}>새 카테고리 추가</div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <input value={newCatKey} onChange={(e) => setNewCatKey(e.target.value)}
            placeholder="키 (영문, 예: painLevel)" style={{ ...S.input, flex: 1 }} />
          <input value={newCatLabel} onChange={(e) => setNewCatLabel(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addCategory()}
            placeholder="표시명 (예: 통증 수준)" style={{ ...S.input, flex: 1 }} />
          <button onClick={addCategory} style={S.addBtn}>추가</button>
        </div>
      </div>

      {/* 슬라이더 */}
      <h3 style={{ ...S.subTitle, marginTop: '28px' }}>슬라이더 항목</h3>
      {Object.entries(sliders).map(([key, slider]) => (
        <div key={key} style={S.itemRow}>
          <div style={S.itemText}>
            <strong>{slider.label}</strong>
            <span style={{ color: '#9ca3af', fontSize: '12px', marginLeft: '8px' }}>
              ({slider.min} ~ {slider.max})
            </span>
          </div>
          <button onClick={() => removeSlider(key)} style={S.delBtn}>삭제</button>
        </div>
      ))}

      <div style={S.formBox}>
        <div style={{ fontSize: '13px', fontWeight: '600', color: '#6b7280', marginBottom: '8px' }}>새 슬라이더 추가</div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <input value={newSliderKey} onChange={(e) => setNewSliderKey(e.target.value)}
            placeholder="키 (영문)" style={{ ...S.input, flex: 1, minWidth: '120px' }} />
          <input value={newSliderLabel} onChange={(e) => setNewSliderLabel(e.target.value)}
            placeholder="표시명" style={{ ...S.input, flex: 1, minWidth: '120px' }} />
          <input value={newSliderMin} onChange={(e) => setNewSliderMin(e.target.value)}
            placeholder="최소 라벨" style={{ ...S.input, flex: 1, minWidth: '100px' }} />
          <input value={newSliderMax} onChange={(e) => setNewSliderMax(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addSlider()}
            placeholder="최대 라벨" style={{ ...S.input, flex: 1, minWidth: '100px' }} />
          <button onClick={addSlider} style={S.addBtn}>추가</button>
        </div>
      </div>
    </>
  )
}

// ─── 스타일 ───
const S = {
  page: { minHeight: '100vh', background: '#f0f2f5', fontFamily: "'Pretendard', sans-serif", padding: '24px' },
  container: { maxWidth: '800px', margin: '0 auto' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' },
  backBtn: { padding: '8px 16px', background: '#6b7280', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' },
  savingBar: { background: '#dbeafe', color: '#1d4ed8', padding: '8px 16px', borderRadius: '8px', fontSize: '13px', marginBottom: '16px', textAlign: 'center' },
  tabBar: { display: 'flex', gap: '4px', marginBottom: '0', background: '#fff', borderRadius: '12px 12px 0 0', padding: '8px 8px 0', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' },
  tabActive: { flex: 1, padding: '12px 16px', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: '8px 8px 0 0', fontSize: '14px', fontWeight: '700', cursor: 'pointer' },
  tabInactive: { flex: 1, padding: '12px 16px', background: 'transparent', color: '#6b7280', border: 'none', borderRadius: '8px 8px 0 0', fontSize: '14px', fontWeight: '500', cursor: 'pointer' },
  tabContent: { background: '#fff', borderRadius: '0 0 12px 12px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', minHeight: '400px' },
  desc: { fontSize: '13px', color: '#9ca3af', margin: '0 0 16px' },
  subTitle: { fontSize: '15px', fontWeight: '700', color: '#374151', margin: '0 0 12px' },
  itemRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: '#f9fafb', borderRadius: '8px', marginBottom: '8px', border: '1px solid #e5e7eb' },
  itemText: { fontSize: '14px', color: '#374151', flex: 1 },
  delBtn: { padding: '4px 10px', background: 'none', color: '#ef4444', border: '1px solid #fecaca', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', marginLeft: '8px', flexShrink: 0 },
  addRow: { display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px' },
  input: { flex: 1, padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', fontFamily: 'inherit', boxSizing: 'border-box', width: '100%' },
  addBtn: { padding: '10px 20px', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: 'pointer', flexShrink: 0 },
  strengthCard: { padding: '14px 16px', background: '#f0f7ff', borderRadius: '10px', marginBottom: '10px', border: '1px solid #bfdbfe' },
  formBox: { marginTop: '12px', padding: '16px', background: '#fafafa', borderRadius: '10px', border: '1px dashed #d1d5db' },
  catCard: { padding: '16px', background: '#f9fafb', borderRadius: '10px', marginBottom: '12px', border: '1px solid #e5e7eb' },
  pairBox: { padding: '10px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, marginTop: 10 },
  optionChip: { display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '5px 12px', background: '#ede9fe', borderRadius: '16px', fontSize: '13px', color: '#7c3aed', fontWeight: '500' },
  chipDel: { background: 'none', border: 'none', color: '#a78bfa', fontSize: '14px', cursor: 'pointer', padding: '0 2px', fontWeight: '700' },
}
