/**
 * ContentEditor — AI 작성 단계: 결과 편집
 * 좌측: AI 초안 (읽기전용 참조)
 * 우측: 섹션별 편집 (골격관계, 치성관계, 치료계획, 맞춤 안내, 어필, 추가사항)
 */
export default function ContentEditor({ original, edited, onChange }) {
  const update = (field, value) => onChange({ ...edited, [field]: value })

  const isChanged = (a, b) => JSON.stringify(a) !== JSON.stringify(b)
  const revert = (field) => onChange({ ...edited, [field]: original[field] })

  // 치료 옵션
  const updateOption = (idx, field, value) => {
    const opts = [...edited.treatmentOptions]
    opts[idx] = { ...opts[idx], [field]: value }
    onChange({ ...edited, treatmentOptions: opts })
  }
  const moveOption = (idx, dir) => {
    const opts = [...edited.treatmentOptions]
    const t = idx + dir
    if (t < 0 || t >= opts.length) return
    ;[opts[idx], opts[t]] = [opts[t], opts[idx]]
    onChange({ ...edited, treatmentOptions: opts })
  }
  const addOption = () => {
    onChange({ ...edited, treatmentOptions: [...edited.treatmentOptions, { name: '', description: '', expectedEffect: '', duration: '', appliance: '' }] })
  }
  const removeOption = (idx) => {
    onChange({ ...edited, treatmentOptions: edited.treatmentOptions.filter((_, i) => i !== idx) })
  }

  return (
    <div style={S.container}>
      {/* ── 좌측: AI 초안 (읽기전용) ── */}
      <div style={S.left}>
        <div style={S.panelHead}>
          <span style={S.badge}>AI 초안</span>
          <span style={S.hint}>참조용 (수정 불가)</span>
        </div>

        {original.skeletalRelationship && (
          <RO title="골격 관계" content={original.skeletalRelationship} />
        )}
        {original.dentalRelationship && (
          <RO title="치성 관계" content={original.dentalRelationship} />
        )}
        {original.treatmentOptions?.map((opt, i) => (
          <div key={i} style={S.roOption}>
            <div style={S.roOptName}>{opt.name}</div>
            <div style={S.roText}>{opt.description}</div>
            {opt.expectedEffect && <div style={S.roMeta}>기대 효과: {opt.expectedEffect}</div>}
            {opt.duration && <div style={S.roMeta}>기간: {opt.duration}</div>}
            {opt.appliance && <div style={S.roMeta}>장치: {opt.appliance}</div>}
          </div>
        ))}
        {original.additionalNotes && (
          <RO title="추가 사항" content={original.additionalNotes} />
        )}
      </div>

      {/* ── 우측: 편집창 ── */}
      <div style={S.right}>
        <div style={S.panelHead}>
          <span style={{ ...S.badge, background: '#7c3aed', color: '#fff' }}>내용 편집</span>
          <span style={S.hint}>배치 변경 · 용어 수정</span>
        </div>

        {/* 골격 관계 */}
        <EditSec
          title="골격 관계"
          changed={isChanged(original.skeletalRelationship, edited.skeletalRelationship)}
          onRevert={() => revert('skeletalRelationship')}
        >
          <textarea
            value={edited.skeletalRelationship || ''}
            onChange={e => update('skeletalRelationship', e.target.value)}
            placeholder="골격(뼈, 악골) 관련 분석 내용"
            style={S.ta}
            rows={3}
          />
        </EditSec>

        {/* 치성 관계 */}
        <EditSec
          title="치성 관계"
          changed={isChanged(original.dentalRelationship, edited.dentalRelationship)}
          onRevert={() => revert('dentalRelationship')}
        >
          <textarea
            value={edited.dentalRelationship || ''}
            onChange={e => update('dentalRelationship', e.target.value)}
            placeholder="치아 배열, 교합, 총생 등"
            style={S.ta}
            rows={4}
          />
        </EditSec>

        {/* 치료 옵션 */}
        <div style={S.secWrap}>
          <div style={S.secHead}>
            <span style={S.secTitle}>치료 계획</span>
            <button onClick={addOption} style={S.addBtn}>+ 옵션 추가</button>
          </div>
          {edited.treatmentOptions.map((opt, idx) => {
            const orig = original.treatmentOptions[idx]
            const changed = orig ? isChanged(opt, orig) : true
            return (
              <div key={idx} style={S.optCard}>
                <div style={S.optTop}>
                  <span style={S.optNum}>Option {String.fromCharCode(65 + idx)}</span>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <button onClick={() => moveOption(idx, -1)} disabled={idx === 0} style={S.moveBtn}>↑</button>
                    <button onClick={() => moveOption(idx, 1)} disabled={idx === edited.treatmentOptions.length - 1} style={S.moveBtn}>↓</button>
                    <button onClick={() => removeOption(idx)} style={S.delBtn}>×</button>
                  </div>
                </div>
                <input
                  value={opt.name}
                  onChange={e => updateOption(idx, 'name', e.target.value)}
                  placeholder="옵션명 (예: 상악 소구치 발치 + 고정식 교정)"
                  style={S.optNameInput}
                />
                <textarea
                  value={opt.description}
                  onChange={e => updateOption(idx, 'description', e.target.value)}
                  placeholder="설명"
                  style={S.ta}
                  rows={3}
                />
                <textarea
                  value={opt.expectedEffect || ''}
                  onChange={e => updateOption(idx, 'expectedEffect', e.target.value)}
                  placeholder="기대 효과 (선택)"
                  style={{ ...S.ta, background: '#f0fdf4', borderColor: '#bbf7d0' }}
                  rows={2}
                />
                <div style={S.optMetaRow}>
                  <input
                    value={opt.duration || ''}
                    onChange={e => updateOption(idx, 'duration', e.target.value)}
                    placeholder="예상 기간"
                    style={S.metaInput}
                  />
                  <input
                    value={opt.appliance || ''}
                    onChange={e => updateOption(idx, 'appliance', e.target.value)}
                    placeholder="장치 종류"
                    style={S.metaInput}
                  />
                </div>
                {changed && <div style={S.changeBar} />}
              </div>
            )
          })}
        </div>

        {/* 추가 사항 */}
        <EditSec
          title="추가 사항"
          changed={isChanged(original.additionalNotes, edited.additionalNotes)}
          onRevert={() => revert('additionalNotes')}
        >
          <textarea
            value={edited.additionalNotes || ''}
            onChange={e => update('additionalNotes', e.target.value)}
            placeholder="추가로 알려드릴 사항 (선택)"
            style={S.ta}
            rows={2}
          />
        </EditSec>
      </div>
    </div>
  )
}

function RO({ title, content }) {
  return (
    <div style={S.roSection}>
      <div style={S.roTitle}>{title}</div>
      <div style={S.roText}>{content}</div>
    </div>
  )
}

function EditSec({ title, changed, onRevert, children }) {
  return (
    <div style={S.secWrap}>
      <div style={S.secHead}>
        <span style={S.secTitle}>{title}</span>
        {changed && <button onClick={onRevert} style={S.revertBtn}>↺ 원래대로</button>}
      </div>
      {children}
      {changed && <div style={S.changeBar} />}
    </div>
  )
}

const S = {
  container: { display: 'flex', gap: 0, height: 'calc(100vh - 140px)', border: '1px solid #e5e7eb', borderRadius: '12px', overflow: 'hidden', background: '#fff' },

  left: { flex: '0 0 36%', overflow: 'auto', padding: '20px', background: '#f8f9fa', borderRight: '1px solid #e5e7eb' },
  right: { flex: 1, overflow: 'auto', padding: '20px' },

  panelHead: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px', paddingBottom: '12px', borderBottom: '1px solid #e5e7eb' },
  badge: { padding: '4px 12px', borderRadius: '20px', fontSize: '13px', fontWeight: '600', background: '#e5e7eb', color: '#374151' },
  hint: { fontSize: '12px', color: '#9ca3af' },

  // 읽기전용
  roSection: { marginBottom: '16px' },
  roTitle: { fontSize: '12px', fontWeight: '700', color: '#b5976a', marginBottom: '6px', letterSpacing: '0.5px', textTransform: 'uppercase' },
  roText: { fontSize: '13px', lineHeight: '1.8', color: '#4b5563', whiteSpace: 'pre-wrap' },
  roItem: { fontSize: '13px', color: '#4b5563', padding: '4px 0', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' },
  roBadge: { display: 'inline-flex', width: '18px', height: '18px', borderRadius: '50%', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: '700', flexShrink: 0 },
  roOption: { padding: '12px', background: '#fff', borderRadius: '8px', border: '1px solid #e5e7eb', marginBottom: '8px' },
  roOptName: { fontSize: '14px', fontWeight: '600', color: '#1a1a18', marginBottom: '4px' },
  roMeta: { fontSize: '11px', color: '#9ca3af', marginTop: '3px' },

  // 편집
  secWrap: { marginBottom: '20px', position: 'relative' },
  secHead: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' },
  secTitle: { fontSize: '14px', fontWeight: '700', color: '#1a1a18' },
  ta: { width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', lineHeight: '1.8', resize: 'vertical', fontFamily: 'inherit', color: '#1f2937', background: '#fff', boxSizing: 'border-box', outline: 'none' },

  // 문제 목록
  problemRow: { display: 'flex', gap: '6px', alignItems: 'center', marginBottom: '6px' },
  problemNum: { width: '22px', height: '22px', borderRadius: '50%', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: '700', flexShrink: 0 },
  problemInput: { flex: 3, padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '13px', outline: 'none', boxSizing: 'border-box' },
  severitySelect: { padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '12px', background: '#fff', cursor: 'pointer' },

  // 치료 목표
  goalRow: { display: 'flex', gap: '6px', alignItems: 'center', marginBottom: '6px' },
  goalRefSelect: { width: '50px', padding: '6px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '12px', background: '#f0fdf4', textAlign: 'center' },

  // 치료 옵션
  optCard: { padding: '14px', background: '#f5f2ed', borderRadius: '10px', border: '1px solid #e5e0d5', marginBottom: '10px', position: 'relative' },
  optTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' },
  optNum: { fontSize: '11px', fontWeight: '600', color: '#b5976a', letterSpacing: '0.5px' },
  optNameInput: { width: '100%', padding: '8px 10px', border: '1px solid #d4c8b4', borderRadius: '6px', fontSize: '15px', fontWeight: '600', color: '#1a1a18', background: '#fff', marginBottom: '8px', boxSizing: 'border-box', outline: 'none' },
  optMetaRow: { display: 'flex', gap: '8px', marginTop: '8px' },
  metaInput: { flex: 1, padding: '6px 10px', border: '1px solid #d4c8b4', borderRadius: '6px', fontSize: '12px', background: '#fff', outline: 'none' },

  // 버튼
  addBtn: { padding: '4px 12px', background: '#f5f2ed', color: '#b5976a', border: '1px solid #d4c8b4', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' },
  revertBtn: { padding: '3px 8px', background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a', borderRadius: '4px', fontSize: '11px', cursor: 'pointer' },
  moveBtn: { padding: '2px 6px', background: '#f3f4f6', color: '#6b7280', border: '1px solid #d1d5db', borderRadius: '4px', fontSize: '12px', cursor: 'pointer' },
  delBtn: { padding: '2px 8px', background: '#fef2f2', color: '#ef4444', border: '1px solid #fecaca', borderRadius: '4px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' },

  changeBar: { position: 'absolute', left: '-4px', top: 0, bottom: 0, width: '3px', background: '#f59e0b', borderRadius: '2px' },
}
