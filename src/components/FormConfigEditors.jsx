/**
 * Settings 페이지의 "진단 폼" / "치료 계획 폼" 탭 UI.
 * ClinicalForm 의 실제 스타일(CF_STYLES)을 공유해 사용자가 보는 실제 페이지와
 * 가능한 한 똑같이 렌더링하되, 각 chip/row/section 옆에 추가·삭제 컨트롤을 붙여서
 * 인라인으로 편집할 수 있게 한다.
 */
import { useState } from 'react'
import { CF_STYLES } from './ClinicalForm'
import { DEFAULT_DIAGNOSIS_CONFIG, DEFAULT_TREATMENT_CONFIG } from '../lib/formConfig'

const ITEM_TYPES = [
  { value: 'checkbox',      label: '여러 선택' },
  { value: 'radio',         label: '하나 선택' },
  { value: 'checkbox_text', label: '선택 + 자유입력' },
  { value: 'text',          label: '자유입력만' },
]

/* ─────────────────────────── 진단 폼 에디터 ─────────────────────────── */

export function DiagnosisFormEditor({ value, onChange }) {
  const cfg = value && Array.isArray(value.sections) && value.sections.length > 0
    ? value
    : DEFAULT_DIAGNOSIS_CONFIG
  const sections = cfg.sections

  const writeSections = (next) => onChange({ ...cfg, sections: next })

  const updateSection = (idx, patch) => {
    const next = sections.slice()
    next[idx] = { ...next[idx], ...patch }
    writeSections(next)
  }
  const removeSection = (idx) => {
    if (!confirm(`"${sections[idx].label}" 섹션 전체를 삭제할까요?`)) return
    writeSections(sections.filter((_, i) => i !== idx))
  }
  const moveSection = (idx, dir) => {
    const to = idx + dir
    if (to < 0 || to >= sections.length) return
    const next = sections.slice()
    ;[next[idx], next[to]] = [next[to], next[idx]]
    writeSections(next)
  }
  const addSection = (key, label, color) => {
    if (!key.trim() || !label.trim()) return
    if (sections.some(s => s.key === key.trim())) { alert('이미 같은 키의 섹션이 있습니다.'); return }
    writeSections([...sections, { key: key.trim(), label: label.trim(), color: color || '#374151', items: [] }])
  }

  const updateItem = (sIdx, iIdx, patch) => {
    const items = (sections[sIdx].items || []).slice()
    items[iIdx] = { ...items[iIdx], ...patch }
    updateSection(sIdx, { items })
  }
  const removeItem = (sIdx, iIdx) => {
    if (!confirm(`"${sections[sIdx].items[iIdx].label}" 항목을 삭제할까요?`)) return
    const items = (sections[sIdx].items || []).filter((_, i) => i !== iIdx)
    updateSection(sIdx, { items })
  }
  const moveItem = (sIdx, iIdx, dir) => {
    const items = (sections[sIdx].items || []).slice()
    const to = iIdx + dir
    if (to < 0 || to >= items.length) return
    ;[items[iIdx], items[to]] = [items[to], items[iIdx]]
    updateSection(sIdx, { items })
  }
  const addItem = (sIdx, newItem) => {
    const items = [...(sections[sIdx].items || []), newItem]
    updateSection(sIdx, { items })
  }

  const addOption = (sIdx, iIdx, opt) => {
    const o = opt.trim()
    if (!o) return
    const options = [...(sections[sIdx].items[iIdx].options || [])]
    if (options.includes(o)) { alert('이미 있는 옵션입니다.'); return }
    options.push(o)
    updateItem(sIdx, iIdx, { options })
  }
  const removeOption = (sIdx, iIdx, oIdx) => {
    const options = (sections[sIdx].items[iIdx].options || []).filter((_, i) => i !== oIdx)
    updateItem(sIdx, iIdx, { options })
  }
  const renameOption = (sIdx, iIdx, oIdx, nextVal) => {
    const v = nextVal.trim()
    if (!v) return
    const options = (sections[sIdx].items[iIdx].options || []).slice()
    options[oIdx] = v
    updateItem(sIdx, iIdx, { options })
  }

  const resetDefault = () => {
    if (!confirm('진단 폼 항목을 기본값으로 되돌립니다. 저장된 편집 내용은 사라집니다.')) return
    onChange(DEFAULT_DIAGNOSIS_CONFIG)
  }

  return (
    <div>
      <InfoBanner>
        💡 실제 진단 페이지와 같은 모습으로 표시됩니다. 각 선택지의 <code>×</code>, 항목 끝의 <code>삭제</code>, 섹션 하단의 <code>+ 항목 추가</code> 로 바로 편집됩니다.
      </InfoBanner>

      {sections.map((section, sIdx) => (
        <div key={section.key} style={{ ...CF_STYLES.sectionStyle, marginBottom: 20 }}>
          <SectionHeader
            section={section}
            onRename={(label) => updateSection(sIdx, { label })}
            onColorChange={(color) => updateSection(sIdx, { color })}
            onRemove={() => removeSection(sIdx)}
            onMoveUp={sIdx > 0 ? () => moveSection(sIdx, -1) : null}
            onMoveDown={sIdx < sections.length - 1 ? () => moveSection(sIdx, 1) : null}
          />

          {(section.items || []).map((item, iIdx) => (
            <ItemRowEditor
              key={item.key}
              item={item}
              color={section.color}
              onRename={(label) => updateItem(sIdx, iIdx, { label })}
              onTypeChange={(type) => updateItem(sIdx, iIdx, { type })}
              onSevereToggle={() => updateItem(sIdx, iIdx, { severe: !item.severe })}
              onRemoveOption={(oIdx) => removeOption(sIdx, iIdx, oIdx)}
              onRenameOption={(oIdx, v) => renameOption(sIdx, iIdx, oIdx, v)}
              onAddOption={(opt) => addOption(sIdx, iIdx, opt)}
              onRemove={() => removeItem(sIdx, iIdx)}
              onMoveUp={iIdx > 0 ? () => moveItem(sIdx, iIdx, -1) : null}
              onMoveDown={iIdx < (section.items || []).length - 1 ? () => moveItem(sIdx, iIdx, 1) : null}
            />
          ))}

          <AddItemForm onAdd={(item) => addItem(sIdx, item)} />
        </div>
      ))}

      <AddSectionForm onAdd={addSection} />

      <div style={{ marginTop: 16, textAlign: 'right' }}>
        <button onClick={resetDefault} style={resetBtn}>⟲ 기본값으로 되돌리기</button>
      </div>
    </div>
  )
}

function SectionHeader({ section, onRename, onColorChange, onRemove, onMoveUp, onMoveDown }) {
  const [editing, setEditing] = useState(false)
  const [label, setLabel] = useState(section.label)
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      marginBottom: 16, paddingBottom: 10,
      borderBottom: `2px solid ${(section.color || '#374151')}20`,
    }}>
      <input
        type="color"
        value={section.color || '#374151'}
        onChange={(e) => onColorChange(e.target.value)}
        style={{ width: 28, height: 28, border: 'none', padding: 0, background: 'none', cursor: 'pointer' }}
        title="섹션 색상"
      />
      {editing ? (
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onBlur={() => { onRename(label); setEditing(false) }}
          onKeyDown={(e) => { if (e.key === 'Enter') { onRename(label); setEditing(false) } }}
          autoFocus
          style={{ fontSize: 15, fontWeight: 700, color: section.color || '#374151', border: '1px solid #d1d5db', borderRadius: 6, padding: '4px 8px', flex: 1 }}
        />
      ) : (
        <span
          onClick={() => setEditing(true)}
          style={{ fontSize: 15, fontWeight: 700, color: section.color || '#374151', cursor: 'pointer', flex: 1 }}
          title="클릭하여 이름 변경"
        >
          {section.label}
        </span>
      )}
      {onMoveUp && <button onClick={onMoveUp} style={tinyBtn}>▲</button>}
      {onMoveDown && <button onClick={onMoveDown} style={tinyBtn}>▼</button>}
      <button onClick={onRemove} style={delBtn}>섹션 삭제</button>
    </div>
  )
}

function ItemRowEditor({ item, color, onRename, onTypeChange, onSevereToggle, onRemoveOption, onRenameOption, onAddOption, onRemove, onMoveUp, onMoveDown }) {
  const [editingLabel, setEditingLabel] = useState(false)
  const [label, setLabel] = useState(item.label)
  const [newOpt, setNewOpt] = useState('')
  const [editingOpt, setEditingOpt] = useState(null) // { idx, text }

  const hasOptions = item.type !== 'text'

  return (
    <div style={{ ...CF_STYLES.itemRowStyle, marginBottom: 16, paddingBottom: 12, borderBottom: '1px dashed #f0f0f0' }}>
      {/* 라벨 */}
      <div style={{ width: 140, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
        {editingLabel ? (
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onBlur={() => { onRename(label); setEditingLabel(false) }}
            onKeyDown={(e) => { if (e.key === 'Enter') { onRename(label); setEditingLabel(false) } }}
            autoFocus
            style={{ fontSize: 13, fontWeight: 600, color: '#374151', padding: '4px 6px', border: '1px solid #d1d5db', borderRadius: 4 }}
          />
        ) : (
          <span
            onClick={() => setEditingLabel(true)}
            style={{ fontSize: 13, fontWeight: 600, color: '#374151', cursor: 'pointer' }}
            title="클릭하여 라벨 변경"
          >
            {item.label}
          </span>
        )}
        <select
          value={item.type}
          onChange={(e) => onTypeChange(e.target.value)}
          style={typeSelect}
        >
          {ITEM_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <label style={{ fontSize: 11, color: '#6b7280', display: 'flex', alignItems: 'center', gap: 4 }}>
          <input type="checkbox" checked={!!item.severe} onChange={onSevereToggle} />
          심함/경미
        </label>
      </div>

      {/* 옵션 영역 */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, flex: 1 }}>
        {hasOptions ? (
          <>
            {(item.options || []).map((opt, oIdx) => (
              <div key={oIdx} style={{ ...CF_STYLES.chipStyle(true, color || '#374151'), display: 'inline-flex', alignItems: 'center', gap: 6, paddingRight: 6 }}>
                {editingOpt?.idx === oIdx ? (
                  <input
                    value={editingOpt.text}
                    onChange={(e) => setEditingOpt({ idx: oIdx, text: e.target.value })}
                    onBlur={() => { onRenameOption(oIdx, editingOpt.text); setEditingOpt(null) }}
                    onKeyDown={(e) => { if (e.key === 'Enter') { onRenameOption(oIdx, editingOpt.text); setEditingOpt(null) } }}
                    autoFocus
                    style={{ background: 'transparent', border: 'none', outline: 'none', fontSize: 13, color: 'inherit', fontWeight: 'inherit', minWidth: 40, maxWidth: 160 }}
                  />
                ) : (
                  <span onClick={() => setEditingOpt({ idx: oIdx, text: opt })} style={{ cursor: 'pointer' }} title="클릭하여 이름 변경">{opt}</span>
                )}
                <button onClick={() => onRemoveOption(oIdx)} style={chipX}>×</button>
              </div>
            ))}
            <input
              value={newOpt}
              onChange={(e) => setNewOpt(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { onAddOption(newOpt); setNewOpt('') } }}
              placeholder="+ 옵션 추가"
              style={addOptInput}
            />
            {newOpt.trim() && (
              <button onClick={() => { onAddOption(newOpt); setNewOpt('') }} style={miniAddBtn}>추가</button>
            )}
          </>
        ) : (
          <span style={{ fontSize: 12, color: '#9ca3af', fontStyle: 'italic' }}>
            자유입력 항목 (옵션 없음)
          </span>
        )}
      </div>

      {/* 항목 조작 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginLeft: 8 }}>
        {onMoveUp && <button onClick={onMoveUp} style={tinyBtn}>▲</button>}
        {onMoveDown && <button onClick={onMoveDown} style={tinyBtn}>▼</button>}
        <button onClick={onRemove} style={delBtn}>삭제</button>
      </div>
    </div>
  )
}

function AddItemForm({ onAdd }) {
  const [open, setOpen] = useState(false)
  const [key, setKey] = useState('')
  const [label, setLabel] = useState('')
  const [type, setType] = useState('checkbox')
  const [optsText, setOptsText] = useState('')
  const [severe, setSevere] = useState(false)

  const submit = () => {
    if (!key.trim() || !label.trim()) { alert('키와 라벨은 필수입니다.'); return }
    const options = type === 'text' ? undefined : optsText.split(',').map(s => s.trim()).filter(Boolean)
    const item = { key: key.trim().replace(/\s+/g, '_'), label: label.trim(), type, severe }
    if (options) item.options = options
    if (type === 'checkbox_text') item.textPlaceholder = '자유 입력'
    if (type === 'text') item.placeholder = '내용 기재'
    onAdd(item)
    setOpen(false); setKey(''); setLabel(''); setType('checkbox'); setOptsText(''); setSevere(false)
  }

  if (!open) {
    return <button onClick={() => setOpen(true)} style={{ ...addItemBtn, marginTop: 8 }}>+ 항목 추가</button>
  }

  return (
    <div style={addFormBox}>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#6b7280', marginBottom: 8 }}>새 항목 추가</div>
      <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr', gap: 8, marginBottom: 8 }}>
        <input value={key} onChange={(e) => setKey(e.target.value)} placeholder="키 (영문, 예: painLevel)" style={fieldInput} />
        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="표시명 (예: 통증 수준)" style={fieldInput} />
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
        <select value={type} onChange={(e) => setType(e.target.value)} style={fieldInput}>
          {ITEM_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <label style={{ fontSize: 12, color: '#6b7280', display: 'flex', alignItems: 'center', gap: 4 }}>
          <input type="checkbox" checked={severe} onChange={(e) => setSevere(e.target.checked)} />
          심함/경미 표시
        </label>
      </div>
      {type !== 'text' && (
        <input value={optsText} onChange={(e) => setOptsText(e.target.value)}
          placeholder="옵션 (쉼표로 구분) 예: Class I, Class II, Class III"
          style={{ ...fieldInput, width: '100%', marginBottom: 8 }} />
      )}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button onClick={() => setOpen(false)} style={cancelBtn}>취소</button>
        <button onClick={submit} style={addBtn}>추가</button>
      </div>
    </div>
  )
}

function AddSectionForm({ onAdd }) {
  const [open, setOpen] = useState(false)
  const [key, setKey] = useState('')
  const [label, setLabel] = useState('')
  const [color, setColor] = useState('#374151')

  const submit = () => {
    if (!key.trim() || !label.trim()) { alert('키와 이름은 필수입니다.'); return }
    onAdd(key, label, color)
    setOpen(false); setKey(''); setLabel(''); setColor('#374151')
  }

  if (!open) {
    return <button onClick={() => setOpen(true)} style={{ ...addItemBtn, width: '100%', padding: '14px', fontSize: 14, marginTop: 12 }}>+ 섹션 추가</button>
  }

  return (
    <div style={addFormBox}>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#6b7280', marginBottom: 8 }}>새 섹션 추가</div>
      <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr 50px', gap: 8, marginBottom: 8 }}>
        <input value={key} onChange={(e) => setKey(e.target.value)} placeholder="키 (영문)" style={fieldInput} />
        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="표시명" style={fieldInput} />
        <input type="color" value={color} onChange={(e) => setColor(e.target.value)} style={{ width: '100%', height: 40, border: '1px solid #d1d5db', borderRadius: 6, cursor: 'pointer' }} />
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button onClick={() => setOpen(false)} style={cancelBtn}>취소</button>
        <button onClick={submit} style={addBtn}>추가</button>
      </div>
    </div>
  )
}

/* ─────────────────────────── 치료 계획 폼 에디터 ─────────────────────────── */

export function TreatmentFormEditor({ value, onChange }) {
  const cfg = value && Array.isArray(value.phase1Groups) ? value : DEFAULT_TREATMENT_CONFIG

  const patch = (p) => onChange({ ...cfg, ...p })

  return (
    <div>
      <InfoBanner>
        💡 치료 계획 페이지의 1차/2차 교정 옵션을 편집합니다.
      </InfoBanner>

      {/* 단계 옵션 */}
      <SimpleListEditor
        title="① 교정 단계 옵션"
        description="치료 계획 상단의 '1차 교정 / 2차 교정' 버튼"
        items={cfg.phaseOptions || []}
        onChange={(items) => patch({ phaseOptions: items })}
        chipColor="#b5976a"
      />

      {/* 범위 옵션 */}
      <SimpleListEditor
        title="② 교정 범위 옵션"
        description="'전체 교정 / 부분 교정' 버튼"
        items={cfg.scopeOptions || []}
        onChange={(items) => patch({ scopeOptions: items })}
        chipColor="#b5976a"
      />

      {/* 1차 교정 그룹 */}
      <h3 style={subTitle}>③ 1차 교정 그룹</h3>
      <p style={descStyle}>각 그룹은 라인 하나(근기능, 악궁확장 …)로 표시됩니다. 그룹별 옵션은 모두 같은 <code>primary</code> 배열에 누적됩니다.</p>
      <Phase1GroupsEditor
        groups={cfg.phase1Groups || []}
        onChange={(groups) => patch({ phase1Groups: groups })}
      />

      {/* 2차 교정 */}
      <h3 style={{ ...subTitle, marginTop: 32 }}>④ 2차 교정 옵션</h3>

      <SimpleListEditor
        title="악궁 확장"
        description="Expansion / RPE / MARPE / SARPE 등"
        items={cfg.phase2?.expansion || []}
        onChange={(items) => patch({ phase2: { ...cfg.phase2, expansion: items } })}
        chipColor="#2563eb"
        compact
      />
      <SimpleListEditor
        title="2차 기타"
        description="매복치, 잇몸수술, 악교정 수술 등 추가 시술"
        items={cfg.phase2?.txEtc || []}
        onChange={(items) => patch({ phase2: { ...cfg.phase2, txEtc: items } })}
        chipColor="#059669"
        compact
      />
      <SimpleListEditor
        title="발치 부위 선택지"
        description="사분면 드롭다운에서 고를 수 있는 값 (비발치는 자동 포함)"
        items={cfg.phase2?.extraction || []}
        onChange={(items) => patch({ phase2: { ...cfg.phase2, extraction: items } })}
        chipColor="#dc2626"
        compact
      />

      <div style={{ marginTop: 16, textAlign: 'right' }}>
        <button onClick={() => {
          if (!confirm('치료 계획 폼 항목을 기본값으로 되돌립니다.')) return
          onChange(DEFAULT_TREATMENT_CONFIG)
        }} style={resetBtn}>⟲ 기본값으로 되돌리기</button>
      </div>
    </div>
  )
}

function Phase1GroupsEditor({ groups, onChange }) {
  const [newOpts, setNewOpts] = useState({})

  const updateGroup = (gIdx, patch) => {
    const next = groups.slice()
    next[gIdx] = { ...next[gIdx], ...patch }
    onChange(next)
  }
  const removeGroup = (gIdx) => {
    if (!confirm(`"${groups[gIdx].label}" 그룹을 삭제할까요?`)) return
    onChange(groups.filter((_, i) => i !== gIdx))
  }
  const moveGroup = (gIdx, dir) => {
    const to = gIdx + dir
    if (to < 0 || to >= groups.length) return
    const next = groups.slice()
    ;[next[gIdx], next[to]] = [next[to], next[gIdx]]
    onChange(next)
  }
  const addOption = (gIdx) => {
    const v = (newOpts[gIdx] || '').trim()
    if (!v) return
    const options = [...(groups[gIdx].options || [])]
    if (options.includes(v)) { alert('이미 있는 옵션'); return }
    options.push(v)
    updateGroup(gIdx, { options })
    setNewOpts({ ...newOpts, [gIdx]: '' })
  }
  const removeOption = (gIdx, oIdx) => {
    const options = (groups[gIdx].options || []).filter((_, i) => i !== oIdx)
    updateGroup(gIdx, { options })
  }
  const addGroup = () => {
    const k = prompt('그룹 키 (영문, 예: extraDevices):')
    if (!k) return
    const label = prompt('표시명:')
    if (!label) return
    onChange([...groups, { key: k.trim().replace(/\s+/g, '_'), label: label.trim(), options: [] }])
  }

  return (
    <div style={{ ...CF_STYLES.sectionStyle, padding: 16 }}>
      {groups.map((group, gIdx) => (
        <div key={group.key} style={{ ...CF_STYLES.itemRowStyle, alignItems: 'center', marginBottom: 14, paddingBottom: 10, borderBottom: '1px dashed #f0f0f0' }}>
          <input
            value={group.label}
            onChange={(e) => updateGroup(gIdx, { label: e.target.value })}
            style={{ width: 160, padding: '4px 8px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 13, fontWeight: 600, color: '#374151', flexShrink: 0 }}
          />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, flex: 1, alignItems: 'center' }}>
            {(group.options || []).map((opt, oIdx) => (
              <div key={oIdx} style={{ ...CF_STYLES.chipStyle(true, '#7c3aed'), display: 'inline-flex', alignItems: 'center', gap: 6, paddingRight: 6 }}>
                <span>{opt}</span>
                <button onClick={() => removeOption(gIdx, oIdx)} style={chipX}>×</button>
              </div>
            ))}
            <input
              value={newOpts[gIdx] || ''}
              onChange={(e) => setNewOpts({ ...newOpts, [gIdx]: e.target.value })}
              onKeyDown={(e) => { if (e.key === 'Enter') addOption(gIdx) }}
              placeholder="+ 옵션"
              style={addOptInput}
            />
            {(newOpts[gIdx] || '').trim() && (
              <button onClick={() => addOption(gIdx)} style={miniAddBtn}>추가</button>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {gIdx > 0 && <button onClick={() => moveGroup(gIdx, -1)} style={tinyBtn}>▲</button>}
            {gIdx < groups.length - 1 && <button onClick={() => moveGroup(gIdx, 1)} style={tinyBtn}>▼</button>}
            <button onClick={() => removeGroup(gIdx)} style={delBtn}>삭제</button>
          </div>
        </div>
      ))}
      <button onClick={addGroup} style={{ ...addItemBtn, marginTop: 8 }}>+ 그룹 추가</button>
    </div>
  )
}

function SimpleListEditor({ title, description, items, onChange, chipColor, compact }) {
  const [newVal, setNewVal] = useState('')
  const add = () => {
    const v = newVal.trim()
    if (!v) return
    if ((items || []).includes(v)) { alert('이미 있는 값'); return }
    onChange([...(items || []), v])
    setNewVal('')
  }
  const remove = (i) => onChange((items || []).filter((_, idx) => idx !== i))

  return (
    <div style={{ marginBottom: compact ? 12 : 20 }}>
      {title && <h3 style={{ ...subTitle, marginTop: compact ? 8 : 20, marginBottom: 4 }}>{title}</h3>}
      {description && <p style={{ ...descStyle, marginTop: 0 }}>{description}</p>}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', padding: 12, background: '#f9fafb', borderRadius: 8, border: '1px solid #e5e7eb' }}>
        {(items || []).map((v, i) => (
          <div key={i} style={{ ...CF_STYLES.chipStyle(true, chipColor || '#374151'), display: 'inline-flex', alignItems: 'center', gap: 6, paddingRight: 6 }}>
            <span>{v}</span>
            <button onClick={() => remove(i)} style={chipX}>×</button>
          </div>
        ))}
        <input
          value={newVal}
          onChange={(e) => setNewVal(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') add() }}
          placeholder="+ 추가"
          style={addOptInput}
        />
        {newVal.trim() && <button onClick={add} style={miniAddBtn}>추가</button>}
      </div>
    </div>
  )
}

/* ─────────────────────────── 공통 스타일 ─────────────────────────── */

function InfoBanner({ children }) {
  return (
    <div style={{ padding: '10px 14px', background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 8, fontSize: 13, color: '#0369a1', marginBottom: 16 }}>
      {children}
    </div>
  )
}

const tinyBtn = {
  padding: '2px 6px',
  background: '#fff',
  border: '1px solid #d1d5db',
  borderRadius: 4,
  fontSize: 11,
  color: '#6b7280',
  cursor: 'pointer',
  lineHeight: 1,
}

const delBtn = {
  padding: '2px 8px',
  background: '#fff',
  border: '1px solid #fecaca',
  borderRadius: 4,
  fontSize: 11,
  color: '#dc2626',
  cursor: 'pointer',
  fontWeight: 600,
}

const chipX = {
  background: 'rgba(0,0,0,0.1)',
  border: 'none',
  borderRadius: '50%',
  width: 16,
  height: 16,
  fontSize: 11,
  color: '#374151',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 0,
  lineHeight: 1,
}

const addOptInput = {
  padding: '4px 10px',
  border: '1px dashed #d1d5db',
  borderRadius: 16,
  fontSize: 12,
  color: '#6b7280',
  outline: 'none',
  background: '#fff',
  minWidth: 120,
}

const miniAddBtn = {
  padding: '4px 10px',
  background: '#7c3aed',
  color: '#fff',
  border: 'none',
  borderRadius: 12,
  fontSize: 11,
  fontWeight: 600,
  cursor: 'pointer',
}

const typeSelect = {
  padding: '3px 4px',
  border: '1px solid #d1d5db',
  borderRadius: 4,
  fontSize: 11,
  color: '#6b7280',
  background: '#fff',
  outline: 'none',
}

const addItemBtn = {
  padding: '8px 14px',
  background: '#f9fafb',
  border: '1px dashed #d1d5db',
  borderRadius: 8,
  fontSize: 13,
  fontWeight: 600,
  color: '#6b7280',
  cursor: 'pointer',
}

const addFormBox = {
  marginTop: 12,
  padding: 14,
  background: '#fafafa',
  borderRadius: 8,
  border: '1px dashed #d1d5db',
}

const fieldInput = {
  padding: '8px 10px',
  border: '1px solid #d1d5db',
  borderRadius: 6,
  fontSize: 13,
  fontFamily: 'inherit',
  outline: 'none',
  boxSizing: 'border-box',
}

const addBtn = {
  padding: '8px 16px',
  background: '#7c3aed',
  color: '#fff',
  border: 'none',
  borderRadius: 6,
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
}

const cancelBtn = {
  padding: '8px 16px',
  background: '#fff',
  border: '1px solid #d1d5db',
  borderRadius: 6,
  fontSize: 13,
  color: '#6b7280',
  cursor: 'pointer',
}

const resetBtn = {
  padding: '6px 12px',
  background: '#fff',
  border: '1px solid #fde68a',
  borderRadius: 6,
  fontSize: 12,
  color: '#b45309',
  cursor: 'pointer',
  fontWeight: 500,
}

const subTitle = {
  fontSize: 15,
  fontWeight: 700,
  color: '#374151',
  margin: '20px 0 8px',
}

const descStyle = {
  fontSize: 12,
  color: '#9ca3af',
  margin: '0 0 10px',
}
