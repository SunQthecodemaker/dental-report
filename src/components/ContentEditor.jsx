/**
 * ContentEditor — Step 2: 내용 편집 (배치/용어 수정)
 * 좌측: AI 초안 (읽기전용 참조)
 * 우측: 편집 가능한 내용
 */
export default function ContentEditor({ original, edited, onChange }) {
  const updateField = (field, value) => {
    onChange({ ...edited, [field]: value })
  }

  const updateOption = (idx, field, value) => {
    const opts = [...edited.treatmentOptions]
    opts[idx] = { ...opts[idx], [field]: value }
    onChange({ ...edited, treatmentOptions: opts })
  }

  const moveOption = (idx, dir) => {
    const opts = [...edited.treatmentOptions]
    const target = idx + dir
    if (target < 0 || target >= opts.length) return
    ;[opts[idx], opts[target]] = [opts[target], opts[idx]]
    onChange({ ...edited, treatmentOptions: opts })
  }

  const removeOption = (idx) => {
    onChange({
      ...edited,
      treatmentOptions: edited.treatmentOptions.filter((_, i) => i !== idx),
    })
  }

  const addOption = () => {
    onChange({
      ...edited,
      treatmentOptions: [
        ...edited.treatmentOptions,
        { name: '', description: '', duration: '', note: '' },
      ],
    })
  }

  // 개별 섹션 원래대로
  const revertField = (field) => {
    onChange({ ...edited, [field]: original[field] })
  }

  const revertOption = (idx) => {
    if (original.treatmentOptions[idx]) {
      const opts = [...edited.treatmentOptions]
      opts[idx] = { ...original.treatmentOptions[idx] }
      onChange({ ...edited, treatmentOptions: opts })
    }
  }

  const isChanged = (a, b) => {
    if (typeof a === 'string' && typeof b === 'string') return a.trim() !== b.trim()
    return JSON.stringify(a) !== JSON.stringify(b)
  }

  return (
    <div style={styles.container}>
      {/* 좌측: AI 초안 (읽기전용) */}
      <div style={styles.leftPanel}>
        <div style={styles.panelHeader}>
          <div style={styles.panelBadge}>AI 초안</div>
          <span style={styles.panelHint}>참조용 (수정 불가)</span>
        </div>

        <ReadOnlySection title="진단 내용" content={original.diagnosis} />

        {original.treatmentOptions?.map((opt, i) => (
          <div key={i} style={styles.readOnlyOption}>
            <div style={styles.readOnlyOptionName}>{opt.name}</div>
            <div style={styles.readOnlyText}>{opt.description}</div>
            {opt.duration && (
              <div style={styles.readOnlyMeta}>기간: {opt.duration}</div>
            )}
            {opt.note && (
              <div style={styles.readOnlyMeta}>참고: {opt.note}</div>
            )}
          </div>
        ))}

        {original.additionalNotes && (
          <ReadOnlySection title="추가 사항" content={original.additionalNotes} />
        )}
      </div>

      {/* 우측: 편집창 */}
      <div style={styles.rightPanel}>
        <div style={styles.panelHeader}>
          <div style={{ ...styles.panelBadge, background: '#7c3aed', color: '#fff' }}>
            내용 편집
          </div>
          <span style={styles.panelHint}>배치 변경 · 용어 수정</span>
        </div>

        {/* 진단 */}
        <EditSection
          title="진단 내용"
          changed={isChanged(original.diagnosis, edited.diagnosis)}
          onRevert={() => revertField('diagnosis')}
        >
          <textarea
            value={edited.diagnosis}
            onChange={(e) => updateField('diagnosis', e.target.value)}
            style={styles.textarea}
            rows={Math.max(3, edited.diagnosis.split('\n').length + 1)}
          />
        </EditSection>

        {/* 치료 옵션 */}
        <div style={styles.sectionWrap}>
          <div style={styles.sectionHeader}>
            <span style={styles.sectionTitle}>치료 옵션</span>
            <button onClick={addOption} style={styles.addBtn}>+ 옵션 추가</button>
          </div>

          {edited.treatmentOptions.map((opt, idx) => {
            const origOpt = original.treatmentOptions[idx]
            const changed = origOpt ? isChanged(opt, origOpt) : true

            return (
              <div key={idx} style={styles.optionCard}>
                <div style={styles.optionTop}>
                  <span style={styles.optionNum}>옵션 {idx + 1}</span>
                  <div style={styles.optionActions}>
                    {changed && origOpt && (
                      <button onClick={() => revertOption(idx)} style={styles.revertBtn} title="원래대로">↺</button>
                    )}
                    <button
                      onClick={() => moveOption(idx, -1)}
                      disabled={idx === 0}
                      style={styles.moveBtn}
                      title="위로"
                    >↑</button>
                    <button
                      onClick={() => moveOption(idx, 1)}
                      disabled={idx === edited.treatmentOptions.length - 1}
                      style={styles.moveBtn}
                      title="아래로"
                    >↓</button>
                    <button onClick={() => removeOption(idx)} style={styles.deleteBtn} title="삭제">×</button>
                  </div>
                </div>
                <input
                  value={opt.name}
                  onChange={(e) => updateOption(idx, 'name', e.target.value)}
                  placeholder="옵션명"
                  style={styles.optionNameInput}
                />
                <textarea
                  value={opt.description}
                  onChange={(e) => updateOption(idx, 'description', e.target.value)}
                  placeholder="설명"
                  style={styles.textarea}
                  rows={Math.max(2, (opt.description || '').split('\n').length + 1)}
                />
                <div style={styles.optionMetaRow}>
                  <input
                    value={opt.duration || ''}
                    onChange={(e) => updateOption(idx, 'duration', e.target.value)}
                    placeholder="예상 기간 (선택)"
                    style={styles.metaInput}
                  />
                  <input
                    value={opt.note || ''}
                    onChange={(e) => updateOption(idx, 'note', e.target.value)}
                    placeholder="참고사항 (선택)"
                    style={{ ...styles.metaInput, flex: 2 }}
                  />
                </div>
                {changed && (
                  <div style={styles.changedIndicator} />
                )}
              </div>
            )
          })}
        </div>

        {/* 추가 사항 */}
        <EditSection
          title="추가 사항"
          changed={isChanged(original.additionalNotes, edited.additionalNotes)}
          onRevert={() => revertField('additionalNotes')}
        >
          <textarea
            value={edited.additionalNotes || ''}
            onChange={(e) => updateField('additionalNotes', e.target.value)}
            placeholder="추가로 알려드릴 사항 (선택)"
            style={styles.textarea}
            rows={Math.max(2, (edited.additionalNotes || '').split('\n').length + 1)}
          />
        </EditSection>
      </div>
    </div>
  )
}

function ReadOnlySection({ title, content }) {
  return (
    <div style={styles.readOnlySection}>
      <div style={styles.readOnlySectionTitle}>{title}</div>
      <div style={styles.readOnlyText}>{content}</div>
    </div>
  )
}

function EditSection({ title, changed, onRevert, children }) {
  return (
    <div style={styles.sectionWrap}>
      <div style={styles.sectionHeader}>
        <span style={styles.sectionTitle}>{title}</span>
        {changed && (
          <button onClick={onRevert} style={styles.revertBtn} title="원래대로">
            ↺ 원래대로
          </button>
        )}
      </div>
      {children}
      {changed && <div style={styles.changedIndicator} />}
    </div>
  )
}

const styles = {
  container: {
    display: 'flex',
    gap: '0',
    height: 'calc(100vh - 140px)',
    border: '1px solid #e5e7eb',
    borderRadius: '12px',
    overflow: 'hidden',
    background: '#fff',
  },

  // 좌측 패널
  leftPanel: {
    flex: '0 0 38%',
    overflow: 'auto',
    padding: '20px',
    background: '#f8f9fa',
    borderRight: '1px solid #e5e7eb',
  },
  panelHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    marginBottom: '20px',
    paddingBottom: '12px',
    borderBottom: '1px solid #e5e7eb',
  },
  panelBadge: {
    padding: '4px 12px',
    borderRadius: '20px',
    fontSize: '13px',
    fontWeight: '600',
    background: '#e5e7eb',
    color: '#374151',
  },
  panelHint: {
    fontSize: '12px',
    color: '#9ca3af',
  },

  // 읽기전용 스타일
  readOnlySection: {
    marginBottom: '16px',
  },
  readOnlySectionTitle: {
    fontSize: '13px',
    fontWeight: '700',
    color: '#6b7280',
    marginBottom: '6px',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  readOnlyText: {
    fontSize: '13px',
    lineHeight: '1.8',
    color: '#4b5563',
    whiteSpace: 'pre-wrap',
  },
  readOnlyOption: {
    padding: '12px',
    background: '#fff',
    borderRadius: '8px',
    border: '1px solid #e5e7eb',
    marginBottom: '8px',
  },
  readOnlyOptionName: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#1e3a5f',
    marginBottom: '4px',
  },
  readOnlyMeta: {
    fontSize: '12px',
    color: '#9ca3af',
    marginTop: '4px',
  },

  // 우측 패널
  rightPanel: {
    flex: 1,
    overflow: 'auto',
    padding: '20px',
  },

  // 편집 섹션
  sectionWrap: {
    marginBottom: '20px',
    position: 'relative',
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '8px',
  },
  sectionTitle: {
    fontSize: '14px',
    fontWeight: '700',
    color: '#1e3a5f',
  },
  textarea: {
    width: '100%',
    padding: '10px 12px',
    border: '1px solid #d1d5db',
    borderRadius: '8px',
    fontSize: '14px',
    lineHeight: '1.8',
    resize: 'vertical',
    fontFamily: 'inherit',
    color: '#1f2937',
    background: '#fff',
    boxSizing: 'border-box',
    outline: 'none',
    transition: 'border-color 0.15s',
  },

  // 옵션 카드
  optionCard: {
    padding: '14px',
    background: '#f0f7ff',
    borderRadius: '10px',
    border: '1px solid #bfdbfe',
    marginBottom: '10px',
    position: 'relative',
  },
  optionTop: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '8px',
  },
  optionNum: {
    fontSize: '11px',
    fontWeight: '600',
    color: '#3b82f6',
    textTransform: 'uppercase',
  },
  optionActions: {
    display: 'flex',
    gap: '4px',
  },
  optionNameInput: {
    width: '100%',
    padding: '8px 10px',
    border: '1px solid #93c5fd',
    borderRadius: '6px',
    fontSize: '15px',
    fontWeight: '600',
    color: '#1e3a5f',
    background: '#fff',
    marginBottom: '8px',
    boxSizing: 'border-box',
    outline: 'none',
  },
  optionMetaRow: {
    display: 'flex',
    gap: '8px',
    marginTop: '8px',
  },
  metaInput: {
    flex: 1,
    padding: '6px 10px',
    border: '1px solid #bfdbfe',
    borderRadius: '6px',
    fontSize: '12px',
    background: '#fff',
    outline: 'none',
  },

  // 버튼
  addBtn: {
    padding: '4px 12px',
    background: '#eff6ff',
    color: '#3b82f6',
    border: '1px solid #93c5fd',
    borderRadius: '6px',
    fontSize: '12px',
    fontWeight: '600',
    cursor: 'pointer',
  },
  revertBtn: {
    padding: '3px 8px',
    background: '#fef3c7',
    color: '#92400e',
    border: '1px solid #fde68a',
    borderRadius: '4px',
    fontSize: '11px',
    cursor: 'pointer',
  },
  moveBtn: {
    padding: '2px 6px',
    background: '#f3f4f6',
    color: '#6b7280',
    border: '1px solid #d1d5db',
    borderRadius: '4px',
    fontSize: '12px',
    cursor: 'pointer',
  },
  deleteBtn: {
    padding: '2px 8px',
    background: '#fef2f2',
    color: '#ef4444',
    border: '1px solid #fecaca',
    borderRadius: '4px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
  },

  // 변경 표시
  changedIndicator: {
    position: 'absolute',
    left: '-4px',
    top: '0',
    bottom: '0',
    width: '3px',
    background: '#f59e0b',
    borderRadius: '2px',
  },
}
