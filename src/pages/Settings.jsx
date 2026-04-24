import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useNavigate } from 'react-router-dom'
import { saveTreatmentCases, saveStrengthCards, uploadLibraryPhoto, newCaseId } from '../lib/library'
import { useId } from 'react'
import { validateNewGuideline, cleanupGuidelines } from '../lib/gemini'
import { loadClinicalFormConfig, saveDiagnosisConfig, saveTreatmentConfig, DEFAULT_DIAGNOSIS_CONFIG, DEFAULT_TREATMENT_CONFIG } from '../lib/formConfig'
import { DiagnosisFormEditor, TreatmentFormEditor } from '../components/FormConfigEditors'

const TABS = [
  { id: 'diagnosisForm', label: '진단 폼' },
  { id: 'treatmentForm', label: '치료 계획 폼' },
  { id: 'staffForm', label: '상담 폼' },
  { id: 'absoluteRules', label: '절대 규칙' },
  { id: 'toneRules', label: '톤 규칙' },
  { id: 'learning', label: '학습' },
  { id: 'strengths', label: 'AI 특장점' },
  { id: 'cases', label: '유사 케이스' },
  { id: 'strengthCards', label: '어필포인트' },
]

// 읽기 전용 절대 규칙 (gemini.js L190-234 하드코딩과 일치)
const ABSOLUTE_RULES = [
  {
    title: '환각 방지 7규칙',
    body: [
      '1. [입력 소스]에 글자 단위로 명시된 내용만 사용',
      '2. 입력에 없는 치아 문제(과개교합·개방교합·반대교합·정중선 편위·총생·공간·매복치·잇몸 문제 등) 언급 금지',
      '3. 입력에 없는 치료(임플란트·보철·크라운·미백·사랑니 발치 등) 추가 금지',
      '4. 추측 표현 금지 (아마도, 가능성이, ~할 수도 있습니다, 추정됩니다, 예상됩니다)',
      '5. 해당 섹션 입력이 비어있으면 h2 헤딩째 출력에서 생략',
      '6. 치료 기간/비용/예후/장치명은 입력에 명시된 경우에만 언급',
      '7. 치료 계획이 여러 개면 순서대로 모두 서술 (#1, #2…)',
    ],
  },
  {
    title: '언어 규칙',
    body: [
      '100% 한국어만 사용',
      '영어 병기 금지, 괄호 안 영어 설명 금지',
    ],
  },
  {
    title: '치아번호 → 한글 부위명 변환',
    body: [
      '#16 → 오른쪽 위 첫 번째 큰어금니',
      '#26 → 왼쪽 위 첫 번째 큰어금니',
      '#36 → 왼쪽 아래 첫 번째 큰어금니',
      '#46 → 오른쪽 아래 첫 번째 큰어금니',
      '끝자리: 1=중앙 앞니 · 2=옆 앞니 · 3=송곳니 · 4=첫 번째 작은어금니 · 5=두 번째 작은어금니 · 6=첫 번째 큰어금니 · 7=두 번째 큰어금니 · 8=사랑니',
      '사분면(#10/#20/#30/#40)만 있으면 "오른쪽 위 / 왼쪽 위 / 왼쪽 아래 / 오른쪽 아래" 영역으로',
      '출력에 "#숫자"가 그대로 남으면 안 됨',
    ],
  },
  {
    title: '출력 형식 (body HTML)',
    body: [
      '섹션 순서 고정: 치성 관계 → 골격 관계 → 치료 계획 → 추가 사항',
      '각 섹션은 <h2>섹션명</h2> + <p>문단</p> 구조',
      '비어있는 섹션은 h2 자체를 생략',
      '치료 계획 여러 개면 <p><strong>계획 #1:</strong> …</p><p><strong>계획 #2:</strong> …</p>',
      '<img>, <script>, <style> 태그 절대 금지 (이미지는 사용자가 나중 삽입)',
      '줄바꿈/공백 없는 한 줄 HTML 문자열',
    ],
  },
  {
    title: 'JSON 응답 스키마',
    body: [
      '{ "body": "HTML 문자열", "personalNote": "환자 맞춤 3~5문장", "appealPoints": [{ "title": "...", "description": "..." }] }',
      'body HTML 안 모든 치과 용어/문제/치료가 입력 소스에 있는지 최종 재확인',
      '비어있는 섹션 h2가 지워졌는지, "#숫자"가 남아있지 않은지 최종 재확인',
    ],
  },
]

export default function Settings() {
  const navigate = useNavigate()
  const [tab, setTab] = useState('diagnosisForm')
  const [guidelines, setGuidelines] = useState([])
  const [terms, setTerms] = useState([])
  const [strengths, setStrengths] = useState([])
  const [cases, setCases] = useState([])
  const [strengthCards, setStrengthCards] = useState([])
  const [formConfig, setFormConfig] = useState(null)
  const [toneRules, setToneRules] = useState([])
  const [corrections, setCorrections] = useState([])
  const [diagnosisConfig, setDiagnosisConfig] = useState(null)
  const [treatmentConfig, setTreatmentConfig] = useState(null)
  const [saving, setSaving] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => { loadSettings() }, [])

  const loadSettings = async () => {
    const [settingsRes, corrRes, clinicalCfg] = await Promise.all([
      supabase.from('clinic_settings').select('*'),
      supabase.from('charting_corrections').select('*').order('created_at', { ascending: false }),
      loadClinicalFormConfig(),
    ])
    if (settingsRes.data) {
      for (const row of settingsRes.data) {
        if (row.id === 'writing_guidelines') setGuidelines(row.value.items || [])
        if (row.id === 'terminology') setTerms(row.value.items || [])
        if (row.id === 'clinic_strengths') setStrengths(row.value.items || [])
        if (row.id === 'treatment_cases') setCases(row.value.items || [])
        if (row.id === 'strength_cards') setStrengthCards(row.value.items || [])
        if (row.id === 'staff_form_config') setFormConfig(row.value)
        if (row.id === 'tone_rules_table') setToneRules(row.value.items || [])
      }
    }
    setCorrections(corrRes.data || [])
    setDiagnosisConfig(clinicalCfg?.diagnosis || DEFAULT_DIAGNOSIS_CONFIG)
    setTreatmentConfig(clinicalCfg?.treatment || DEFAULT_TREATMENT_CONFIG)
    setLoaded(true)
  }

  const saveDiag = async (cfg) => {
    setDiagnosisConfig(cfg)
    setSaving(true)
    try { await saveDiagnosisConfig(cfg) } finally { setSaving(false) }
  }

  const saveTx = async (cfg) => {
    setTreatmentConfig(cfg)
    setSaving(true)
    try { await saveTreatmentConfig(cfg) } finally { setSaving(false) }
  }

  const reloadCorrections = async () => {
    const { data } = await supabase
      .from('charting_corrections')
      .select('*')
      .order('created_at', { ascending: false })
    setCorrections(data || [])
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
          {tab === 'diagnosisForm' && diagnosisConfig && (
            <DiagnosisFormEditor value={diagnosisConfig} onChange={saveDiag} />
          )}
          {tab === 'treatmentForm' && treatmentConfig && (
            <TreatmentFormEditor value={treatmentConfig} onChange={saveTx} />
          )}
          {tab === 'absoluteRules' && <AbsoluteRulesTab />}
          {tab === 'toneRules' && (
            <ToneRulesTab
              toneRules={toneRules}
              onToneRulesChange={(v) => { setToneRules(v); save('tone_rules_table', v) }}
              guidelines={guidelines}
              onGuidelinesChange={(v) => { setGuidelines(v); save('writing_guidelines', v) }}
            />
          )}
          {tab === 'learning' && (
            <LearningTab
              terms={terms}
              onTermsChange={(v) => { setTerms(v); save('terminology', v) }}
              corrections={corrections}
              onReloadCorrections={reloadCorrections}
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

// ─── 절대 규칙 탭 (읽기 전용) ───
function AbsoluteRulesTab() {
  const [open, setOpen] = useState(() => new Set([0]))
  const toggle = (i) => {
    const next = new Set(open)
    if (next.has(i)) next.delete(i); else next.add(i)
    setOpen(next)
  }
  return (
    <>
      <div style={S.warnBox}>
        <strong>⛔ 편집 불가</strong> — 이 규칙들은 AI 환각 방지의 핵심 장치입니다. 잘못 바꾸면 진단서가 사고로 직결되므로
        코드에 하드코딩되어 있으며, 변경은 개발자 검토 후 반영됩니다.
      </div>
      {ABSOLUTE_RULES.map((sec, i) => {
        const isOpen = open.has(i)
        return (
          <div key={i} style={S.catCard}>
            <button onClick={() => toggle(i)} style={S.sectionHeader}>
              <span>{isOpen ? '▼' : '▶'} {sec.title}</span>
              <span style={{ color: '#9ca3af', fontSize: 12 }}>{sec.body.length}항목</span>
            </button>
            {isOpen && (
              <ul style={{ margin: '10px 0 0', paddingLeft: 20, color: '#374151', fontSize: 14, lineHeight: 1.6 }}>
                {sec.body.map((line, j) => (<li key={j} style={{ marginBottom: 4 }}>{line}</li>))}
              </ul>
            )}
          </div>
        )
      })}
      <div style={{ ...S.desc, marginTop: 16, fontSize: 12 }}>
        위치: <code>src/lib/gemini.js</code> · composeReport() systemPrompt
      </div>
    </>
  )
}

// ─── 톤 규칙 탭 ───
function ToneRulesTab({ toneRules, onToneRulesChange, guidelines, onGuidelinesChange }) {
  return (
    <>
      <p style={S.desc}>AI가 환자 성향에 맞춰 <strong>문체·상세도·어조</strong>를 조절하는 규칙. 내용 추가는 하지 않고 서술 방식만 바꿉니다.</p>

      <h3 style={S.subTitle}>① 성향별 서술 방식</h3>
      <ToneTableEditor items={toneRules} onChange={onToneRulesChange} />

      <h3 style={{ ...S.subTitle, marginTop: 28 }}>② 작성 지침 <span style={{ fontSize: 12, fontWeight: 500, color: '#9ca3af' }}>— AI가 중복·충돌 자동 점검</span></h3>
      <GuidelineListEditor items={guidelines} onChange={onGuidelinesChange} />
    </>
  )
}

function ToneTableEditor({ items, onChange }) {
  const [trait, setTrait] = useState('')
  const [rule, setRule] = useState('')
  const add = () => {
    if (!trait.trim() || !rule.trim()) return
    onChange([...items, { id: crypto.randomUUID(), trait: trait.trim(), rule: rule.trim(), enabled: true }])
    setTrait(''); setRule('')
  }
  const toggle = (id) => onChange(items.map(it => it.id === id ? { ...it, enabled: it.enabled === false ? true : false } : it))
  const remove = (id) => onChange(items.filter(it => it.id !== id))
  const updateField = (id, field, v) => onChange(items.map(it => it.id === id ? { ...it, [field]: v } : it))

  return (
    <>
      {items.map((it) => (
        <div key={it.id} style={{ ...S.catCard, padding: 12, opacity: it.enabled === false ? 0.5 : 1 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr auto auto', gap: 8, alignItems: 'start' }}>
            <input value={it.trait} onChange={(e) => updateField(it.id, 'trait', e.target.value)}
              placeholder="성향 (예: 꼼꼼함)"
              style={{ ...S.input, fontWeight: 600 }}
              onBlur={() => onChange(items)} />
            <textarea value={it.rule} onChange={(e) => updateField(it.id, 'rule', e.target.value)}
              placeholder="반영 방법 (문체 조절)"
              style={{ ...S.input, minHeight: 44, resize: 'vertical' }}
              onBlur={() => onChange(items)} />
            <button onClick={() => toggle(it.id)} style={{ ...S.delBtn, color: it.enabled === false ? '#059669' : '#6b7280', borderColor: it.enabled === false ? '#a7f3d0' : '#d1d5db' }}>
              {it.enabled === false ? '활성' : '끄기'}
            </button>
            <button onClick={() => remove(it.id)} style={S.delBtn}>삭제</button>
          </div>
        </div>
      ))}
      <div style={{ ...S.formBox, display: 'grid', gridTemplateColumns: '180px 1fr auto', gap: 8 }}>
        <input value={trait} onChange={(e) => setTrait(e.target.value)} placeholder="성향 이름" style={S.input} />
        <input value={rule} onChange={(e) => setRule(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          placeholder="반영 방법 (예: 핵심만 짧게, 결론 앞에)" style={S.input} />
        <button onClick={add} style={S.addBtn}>추가</button>
      </div>
    </>
  )
}

function GuidelineListEditor({ items, onChange }) {
  const [text, setText] = useState('')
  const [checking, setChecking] = useState(false)
  const [toast, setToast] = useState(null) // { kind, text }
  const [conflict, setConflict] = useState(null) // { newText, existingText, idx, reason, mergedText, kind }
  const [cleaning, setCleaning] = useState(false)
  const [cleanupPreview, setCleanupPreview] = useState(null) // { before, after, summary }

  const showToast = (kind, msg) => {
    setToast({ kind, text: msg })
    setTimeout(() => setToast(null), 3000)
  }

  const appendItem = (t) => {
    onChange([...items, t])
  }

  const replaceItem = (idx, t) => {
    const copy = [...items]
    copy[idx] = t
    onChange(copy)
  }

  const tryAdd = async () => {
    const t = text.trim()
    if (!t) return
    setChecking(true)
    try {
      const result = await validateNewGuideline(items, t)
      if (result.status === 'ok') {
        appendItem(t)
        setText('')
        showToast('ok', '지침 추가됨')
      } else if (result.status === 'duplicate') {
        const idx = typeof result.conflictIndex === 'number' ? result.conflictIndex : -1
        showToast('warn', `이미 유사한 지침이 있습니다${idx >= 0 ? ` — "${items[idx]}"` : ''}`)
      } else if (result.status === 'conflict' || result.status === 'similar') {
        const idx = typeof result.conflictIndex === 'number' ? result.conflictIndex : -1
        setConflict({
          kind: result.status,
          newText: t,
          existingText: idx >= 0 ? items[idx] : '',
          idx,
          reason: result.reason || '',
          mergedText: result.mergedText || '',
        })
      } else {
        appendItem(t)
        setText('')
      }
    } catch (err) {
      console.warn(err)
      appendItem(t)
      setText('')
      showToast('warn', 'AI 검수 실패 — 그대로 추가했습니다.')
    } finally {
      setChecking(false)
    }
  }

  const forceAdd = () => {
    appendItem(conflict.newText)
    setText('')
    setConflict(null)
    showToast('ok', '추가됨 (둘 다 유지)')
  }
  const replaceExisting = () => {
    replaceItem(conflict.idx, conflict.newText)
    setText('')
    setConflict(null)
    showToast('ok', '기존 지침을 새 지침으로 교체')
  }
  const keepExisting = () => {
    setConflict(null)
    showToast('warn', '기존 지침 유지 — 새 지침 버림')
  }
  const mergeBoth = () => {
    const merged = conflict.mergedText || `${conflict.existingText} / ${conflict.newText}`
    replaceItem(conflict.idx, merged)
    setText('')
    setConflict(null)
    showToast('ok', '병합 완료')
  }

  const runCleanup = async () => {
    if (items.length < 2) {
      showToast('warn', '정리할 지침이 2개 이상 있어야 합니다.')
      return
    }
    setCleaning(true)
    try {
      const { cleaned, summary } = await cleanupGuidelines(items)
      setCleanupPreview({ before: items, after: cleaned, summary })
    } catch (err) {
      showToast('warn', 'AI 정리 실패: ' + (err.message || '네트워크 오류'))
    } finally {
      setCleaning(false)
    }
  }
  const applyCleanup = () => {
    onChange(cleanupPreview.after)
    setCleanupPreview(null)
    showToast('ok', '지침을 새로 정리했습니다.')
  }

  return (
    <>
      {items.length === 0 && <div style={{ ...S.desc, fontSize: 13 }}>아직 등록된 지침이 없습니다. 한 줄씩 자유롭게 추가하세요.</div>}
      {items.map((g, i) => (
        <div key={i} style={S.itemRow}>
          <div style={S.itemText}><span style={{ color: '#9ca3af', marginRight: 8 }}>{i + 1}.</span>{g}</div>
          <button onClick={() => onChange(items.filter((_, idx) => idx !== i))} style={S.delBtn}>삭제</button>
        </div>
      ))}

      <div style={{ ...S.addRow, marginTop: 12 }}>
        <input value={text} onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !checking && tryAdd()}
          placeholder="예: 불안해하는 환자엔 안심 문구를 반드시 추가"
          disabled={checking}
          style={{ ...S.input, opacity: checking ? 0.6 : 1 }} />
        <button onClick={tryAdd} disabled={checking || !text.trim()} style={{ ...S.addBtn, opacity: (checking || !text.trim()) ? 0.5 : 1 }}>
          {checking ? '검수 중…' : '추가'}
        </button>
      </div>

      <div style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: '#eff6ff', borderRadius: 8, border: '1px solid #bfdbfe' }}>
        <div style={{ fontSize: 12, color: '#1d4ed8' }}>
          🤖 지침이 쌓이면 AI가 중복·모호한 문장을 정리해줍니다.
        </div>
        <button onClick={runCleanup} disabled={cleaning || items.length < 2} style={{ ...S.addBtn, padding: '8px 14px', background: '#1d4ed8', opacity: (cleaning || items.length < 2) ? 0.5 : 1 }}>
          {cleaning ? '정리 중…' : 'AI 정리'}
        </button>
      </div>

      {toast && (
        <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600,
          background: toast.kind === 'ok' ? '#ecfdf5' : '#fef3c7',
          color: toast.kind === 'ok' ? '#065f46' : '#78350f',
          border: `1px solid ${toast.kind === 'ok' ? '#a7f3d0' : '#fcd34d'}` }}>
          {toast.text}
        </div>
      )}

      {conflict && (
        <div style={S.modalBackdrop}>
          <div style={S.modalCard}>
            <h3 style={{ margin: '0 0 8px', fontSize: 16, color: '#1e3a5f' }}>
              {conflict.kind === 'conflict' ? '⚠️ 기존 지침과 충돌합니다' : '🔗 기존 지침과 의미가 겹칩니다'}
            </h3>
            {conflict.reason && <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 12 }}>{conflict.reason}</p>}
            <div style={{ padding: 10, background: '#f9fafb', borderRadius: 6, fontSize: 13, marginBottom: 8 }}>
              <div style={{ color: '#6b7280', fontSize: 11, fontWeight: 700, marginBottom: 4 }}>기존 #{conflict.idx + 1}</div>
              <div style={{ color: '#374151' }}>{conflict.existingText}</div>
            </div>
            <div style={{ padding: 10, background: '#f0f9ff', borderRadius: 6, fontSize: 13, marginBottom: 8, border: '1px solid #bfdbfe' }}>
              <div style={{ color: '#1d4ed8', fontSize: 11, fontWeight: 700, marginBottom: 4 }}>새 지침</div>
              <div style={{ color: '#1e3a5f' }}>{conflict.newText}</div>
            </div>
            {conflict.mergedText && (
              <div style={{ padding: 10, background: '#ecfdf5', borderRadius: 6, fontSize: 13, marginBottom: 12, border: '1px solid #a7f3d0' }}>
                <div style={{ color: '#059669', fontSize: 11, fontWeight: 700, marginBottom: 4 }}>AI 병합안</div>
                <div style={{ color: '#065f46' }}>{conflict.mergedText}</div>
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {conflict.mergedText && (
                <button onClick={mergeBoth} style={{ ...S.addBtn, background: '#059669' }}>✅ 병합안 적용</button>
              )}
              <button onClick={replaceExisting} style={{ ...S.addBtn, background: '#7c3aed' }}>🔁 기존 교체</button>
              <button onClick={keepExisting} style={{ ...S.delBtn, padding: '10px 16px' }}>❌ 기존 유지</button>
              <button onClick={forceAdd} style={{ ...S.delBtn, padding: '10px 16px', color: '#1d4ed8', borderColor: '#bfdbfe' }}>➕ 둘 다 유지</button>
            </div>
          </div>
        </div>
      )}

      {cleanupPreview && (
        <div style={S.modalBackdrop}>
          <div style={{ ...S.modalCard, maxWidth: 680 }}>
            <h3 style={{ margin: '0 0 8px', fontSize: 16, color: '#1e3a5f' }}>🤖 AI 정리 미리보기</h3>
            {cleanupPreview.summary && <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 12 }}>{cleanupPreview.summary}</p>}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', marginBottom: 6 }}>BEFORE ({cleanupPreview.before.length}개)</div>
                <div style={{ maxHeight: 260, overflowY: 'auto', border: '1px solid #e5e7eb', borderRadius: 6, padding: 8, background: '#f9fafb', fontSize: 12, lineHeight: 1.5 }}>
                  {cleanupPreview.before.map((g, i) => (
                    <div key={i} style={{ padding: '4px 0', borderBottom: i < cleanupPreview.before.length - 1 ? '1px dashed #e5e7eb' : 'none' }}>{i + 1}. {g}</div>
                  ))}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#059669', marginBottom: 6 }}>AFTER ({cleanupPreview.after.length}개)</div>
                <div style={{ maxHeight: 260, overflowY: 'auto', border: '1px solid #a7f3d0', borderRadius: 6, padding: 8, background: '#ecfdf5', fontSize: 12, lineHeight: 1.5 }}>
                  {cleanupPreview.after.map((g, i) => (
                    <div key={i} style={{ padding: '4px 0', borderBottom: i < cleanupPreview.after.length - 1 ? '1px dashed #a7f3d0' : 'none' }}>{i + 1}. {g}</div>
                  ))}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setCleanupPreview(null)} style={{ ...S.delBtn, padding: '10px 16px' }}>취소</button>
              <button onClick={applyCleanup} style={{ ...S.addBtn, background: '#059669' }}>✅ 이대로 교체</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ─── 학습 탭 ───
function LearningTab({ terms, onTermsChange, corrections, onReloadCorrections }) {
  const [showProcessed, setShowProcessed] = useState(false)

  const norm = (s) => (s || '').replace(/\s+/g, ' ').trim()
  const meaningful = corrections.filter(c => {
    const o = norm(c.original_term), e = norm(c.corrected_term)
    return o && e && o !== e
  })
  const pending = meaningful.filter(c => (c.status || 'pending') === 'pending')
  const processed = meaningful.filter(c => (c.status || 'pending') !== 'pending')
  const visible = showProcessed ? processed : pending

  const setStatus = async (id, status) => {
    await supabase.from('charting_corrections').update({ status }).eq('id', id)
    onReloadCorrections()
  }

  const promoteToTerm = async (c) => {
    const from = (c.original_term || '').trim()
    const to = (c.corrected_term || '').trim()
    if (!from || !to) return
    const exists = terms.some(t => t.from === from)
    if (!exists) onTermsChange([...terms, { from, to }])
    await setStatus(c.id, 'promoted')
  }

  return (
    <>
      <p style={S.desc}>환자별 수정 기록을 AI에 반영시키는 탭입니다.</p>

      <h3 style={S.subTitle}>① 용어 사전</h3>
      <TermDictionaryEditor items={terms} onChange={onTermsChange} />

      <h3 style={{ ...S.subTitle, marginTop: 28, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>② 누적 교정 기록 ({pending.length}건 대기)</span>
        <button onClick={() => setShowProcessed(!showProcessed)} style={{ ...S.delBtn, color: '#6b7280', borderColor: '#d1d5db' }}>
          {showProcessed ? `대기만 보기` : `처리됨 ${processed.length}건 보기`}
        </button>
      </h3>

      {visible.length === 0 && (
        <div style={{ ...S.desc, padding: 16, textAlign: 'center' }}>
          {showProcessed ? '처리된 교정 기록이 없습니다.' : '대기 중인 교정 기록이 없습니다. AI 초안을 수동으로 수정하면 여기에 쌓입니다.'}
        </div>
      )}

      {visible.map((c) => (
        <div key={c.id} style={S.catCard}>
          <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 6 }}>
            {c.created_at?.slice(0, 10)} · {c.context || '수동 교정'} · 상태: {c.status || 'pending'}
          </div>
          <div style={{ padding: '8px 12px', background: '#fef2f2', borderRadius: 6, fontSize: 13, color: '#991b1b', marginBottom: 4 }}>
            원본: {c.original_term}
          </div>
          <div style={{ padding: '8px 12px', background: '#f0fdf4', borderRadius: 6, fontSize: 13, color: '#166534', marginBottom: 10 }}>
            수정: {c.corrected_term}
          </div>
          {(c.status || 'pending') === 'pending' ? (
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => promoteToTerm(c)} style={{ ...S.addBtn, background: '#059669' }}>용어 사전에 추가</button>
              <button onClick={() => setStatus(c.id, 'ignored')} style={{ ...S.delBtn, color: '#6b7280', borderColor: '#d1d5db' }}>무시</button>
            </div>
          ) : (
            <button onClick={() => setStatus(c.id, 'pending')} style={{ ...S.delBtn, color: '#6b7280', borderColor: '#d1d5db' }}>대기로 되돌리기</button>
          )}
        </div>
      ))}
    </>
  )
}

function TermDictionaryEditor({ items, onChange }) {
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const add = () => {
    if (!from.trim() || !to.trim()) return
    onChange([...items, { from: from.trim(), to: to.trim() }])
    setFrom(''); setTo('')
  }
  return (
    <>
      {items.length === 0 && <div style={{ ...S.desc, fontSize: 13 }}>아직 등록된 용어가 없습니다.</div>}
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

// ─── 어필포인트 탭 (사진 1 + 설명 + 상세 링크) ───
function StrengthCardsTab({ items, onChange }) {
  const addCard = () => {
    onChange([...items, { id: newCaseId(), title: '', description: '', photo_url: '', detail_url: '' }])
  }
  const updateCard = (id, patch) => onChange(items.map(c => c.id === id ? { ...c, ...patch } : c))
  const removeCard = (id) => {
    if (!confirm('이 어필포인트를 삭제할까요?')) return
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
        우리 치과의 어필포인트를 카드로 관리합니다. 환자별 진단서에서 <strong>원하는 항목만 선택</strong>해 삽입합니다.
      </p>
      {items.map(c => (
        <div key={c.id} style={S.catCard}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
            <input
              value={c.title} onChange={(e) => updateCard(c.id, { title: e.target.value })}
              placeholder="어필포인트 제목 (예: 교정과 전문의가 직접)"
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
      <button onClick={addCard} style={{ ...S.addBtn, width: '100%', padding: '12px' }}>+ 어필포인트 추가</button>
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
  container: { maxWidth: '960px', margin: '0 auto' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' },
  backBtn: { padding: '8px 16px', background: '#6b7280', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' },
  savingBar: { background: '#dbeafe', color: '#1d4ed8', padding: '8px 16px', borderRadius: '8px', fontSize: '13px', marginBottom: '16px', textAlign: 'center' },
  tabBar: { display: 'flex', gap: '4px', marginBottom: '0', background: '#fff', borderRadius: '12px 12px 0 0', padding: '8px 8px 0', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', overflowX: 'auto', flexWrap: 'nowrap' },
  tabActive: { flex: '0 0 auto', padding: '12px 14px', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: '8px 8px 0 0', fontSize: '13px', fontWeight: '700', cursor: 'pointer', whiteSpace: 'nowrap' },
  tabInactive: { flex: '0 0 auto', padding: '12px 14px', background: 'transparent', color: '#6b7280', border: 'none', borderRadius: '8px 8px 0 0', fontSize: '13px', fontWeight: '500', cursor: 'pointer', whiteSpace: 'nowrap' },
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
  warnBox: { padding: '12px 16px', background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 8, fontSize: 13, color: '#78350f', marginBottom: 16, lineHeight: 1.6 },
  sectionHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', padding: '8px 4px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 15, fontWeight: 700, color: '#1e3a5f' },
  modalBackdrop: { position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 },
  modalCard: { background: '#fff', borderRadius: 12, padding: 20, maxWidth: 480, width: '100%', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 40px rgba(0,0,0,0.25)' },
}
