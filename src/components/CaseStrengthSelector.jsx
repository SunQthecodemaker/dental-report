/**
 * CaseStrengthSelector — 이 환자 진단서에 포함할 케이스/장점 선택 UI.
 * 복수 선택 / 0개 선택 모두 허용.
 */

export default function CaseStrengthSelector({
  cases, strengths,
  selectedCaseIds, selectedStrengthIds,
  onChangeCases, onChangeStrengths,
}) {
  const toggle = (ids, id, setter) => {
    if (ids.includes(id)) setter(ids.filter(x => x !== id))
    else setter([...ids, id])
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <section>
        <SectionHead label="유사 치료 사례" count={selectedCaseIds.length} total={cases.length} />
        {cases.length === 0 ? (
          <Empty hint="Settings → 유사 케이스 탭에서 등록해주세요 (각 케이스는 전후 사진 1~2 세트 + 간단 설명)." />
        ) : (
          <div style={S.grid}>
            {cases.map(c => {
              const active = selectedCaseIds.includes(c.id)
              const firstPair = (c.pairs || [])[0] || {}
              return (
                <button
                  key={c.id} type="button"
                  onClick={() => toggle(selectedCaseIds, c.id, onChangeCases)}
                  style={{ ...S.card, ...(active ? S.cardActive : {}) }}
                >
                  <div style={S.cardThumbRow}>
                    <Thumb url={firstPair.before_url} label="Before" />
                    <Thumb url={firstPair.after_url} label="After" />
                  </div>
                  <div style={S.cardTitle}>{c.title || '(제목 없음)'}</div>
                  {c.description && <div style={S.cardDesc}>{c.description}</div>}
                  <Checkmark active={active} />
                </button>
              )
            })}
          </div>
        )}
      </section>

      <section>
        <SectionHead label="어필포인트" count={selectedStrengthIds.length} total={strengths.length} />
        {strengths.length === 0 ? (
          <Empty hint="Settings → 어필포인트 탭에서 등록해주세요." />
        ) : (
          <div style={S.grid}>
            {strengths.map(s => {
              const active = selectedStrengthIds.includes(s.id)
              return (
                <button
                  key={s.id} type="button"
                  onClick={() => toggle(selectedStrengthIds, s.id, onChangeStrengths)}
                  style={{ ...S.card, ...(active ? S.cardActive : {}) }}
                >
                  {s.photo_url
                    ? <img src={s.photo_url} alt="" style={S.cardImg} />
                    : <div style={S.cardImgPlaceholder}>사진 없음</div>}
                  <div style={S.cardTitle}>{s.title || '(제목 없음)'}</div>
                  {s.description && <div style={S.cardDesc}>{s.description}</div>}
                  <Checkmark active={active} />
                </button>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}

function SectionHead({ label, count, total }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
      <div style={{ fontSize: 16, fontWeight: 700, color: '#1a1a18' }}>{label}</div>
      <div style={{ fontSize: 12, color: '#6b7280' }}>
        선택 <strong style={{ color: '#b5976a' }}>{count}</strong> / 전체 {total}
      </div>
    </div>
  )
}

function Empty({ hint }) {
  return (
    <div style={{ padding: '28px', background: '#f9fafb', border: '1px dashed #d1d5db', borderRadius: 10, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>
      아직 등록된 항목이 없습니다.<br />
      <span style={{ fontSize: 12, color: '#6b7280' }}>{hint}</span>
    </div>
  )
}

function Thumb({ url, label }) {
  if (!url) {
    return (
      <div style={{ ...S.thumb, background: '#e5e7eb', color: '#9ca3af', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10 }}>
        {label} 없음
      </div>
    )
  }
  return (
    <div style={{ ...S.thumb, backgroundImage: `url(${url})`, backgroundSize: 'cover', backgroundPosition: 'center' }}>
      <div style={S.thumbLabel}>{label}</div>
    </div>
  )
}

function Checkmark({ active }) {
  return (
    <div style={{
      position: 'absolute', top: 8, right: 8,
      width: 24, height: 24, borderRadius: '50%',
      background: active ? '#b5976a' : 'rgba(255,255,255,0.9)',
      color: active ? '#fff' : '#d1d5db',
      border: active ? 'none' : '1px solid #d1d5db',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 13, fontWeight: 700,
    }}>{active ? '✓' : ''}</div>
  )
}

const S = {
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 },
  card: {
    position: 'relative',
    textAlign: 'left', padding: 12,
    background: '#fff', border: '2px solid #e5e7eb', borderRadius: 10,
    cursor: 'pointer', fontFamily: 'inherit',
    display: 'flex', flexDirection: 'column', gap: 8,
  },
  cardActive: { borderColor: '#b5976a', background: '#fefaf3' },
  cardThumbRow: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 },
  thumb: { position: 'relative', paddingTop: '75%', borderRadius: 6, overflow: 'hidden' },
  thumbLabel: {
    position: 'absolute', top: 4, left: 4,
    padding: '1px 6px', background: 'rgba(0,0,0,0.6)', color: '#fff',
    fontSize: 9, fontWeight: 700, letterSpacing: '0.15em', borderRadius: 3,
  },
  cardImg: { width: '100%', aspectRatio: '4/3', objectFit: 'cover', borderRadius: 6 },
  cardImgPlaceholder: {
    width: '100%', aspectRatio: '4/3',
    background: '#f3f4f6', borderRadius: 6,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 12, color: '#9ca3af',
  },
  cardTitle: { fontSize: 14, fontWeight: 700, color: '#1a1a18', lineHeight: 1.4 },
  cardDesc: { fontSize: 12, color: '#6b7280', lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' },
}
