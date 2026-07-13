/**
 * CaseStrengthSelector — 환자별 케이스/어필포인트 선택 + 태그 기반 매칭.
 * - 상단: 카테고리 탭 + 관련 태그 칩 (선택/추가/다시 추천)
 * - 중단: 매칭된 케이스 (카테고리 → 태그 OR 매칭 + 매치 개수 순 정렬)
 * - 하단: 매칭된 어필포인트 (같은 매커니즘)
 */
import { useMemo, useState } from 'react'
import { normalizeTag, normalizeTags, matchCount } from '../lib/library'
import { CASE_CATEGORIES } from '../lib/caseSheet'

export default function CaseStrengthSelector({
  cases, strengths,
  selectedCaseIds, selectedStrengthIds,
  onChangeCases, onChangeStrengths,
  caseTags = [], strengthTags = [],
  onChangeCaseTags, onChangeStrengthTags,
  onSuggestTags, isSuggesting = false,
}) {
  const toggle = (ids, id, setter) => {
    if (ids.includes(id)) setter(ids.filter(x => x !== id))
    else setter([...ids, id])
  }

  // 케이스 태그 토글 (클릭형 팔레트) — 홈페이지 filterByTag 와 동일 (OR 다중선택)
  const toggleCaseTag = (t) => {
    const l = t.toLowerCase()
    const has = (caseTags || []).some(x => x.toLowerCase() === l)
    onChangeCaseTags(has
      ? caseTags.filter(x => x.toLowerCase() !== l)
      : normalizeTags([...(caseTags || []), t]))
  }

  // 케이스 카테고리 (전체/치아교정/심미치료/임플란트) — 홈페이지 치료 전·후와 동일 구조
  const [caseCategory, setCaseCategory] = useState('전체')
  const catCases = useMemo(
    () => (caseCategory === '전체'
      ? (cases || [])
      : (cases || []).filter(c => (c.category || '치아교정') === caseCategory)),
    [cases, caseCategory],
  )
  const catCounts = useMemo(() => {
    const m = { 전체: (cases || []).length }
    for (const cat of CASE_CATEGORIES) m[cat] = 0
    for (const c of cases || []) {
      const cat = c.category || '치아교정'
      m[cat] = (m[cat] || 0) + 1
    }
    return m
  }, [cases])

  // 태그 풀 추출 — 선택 카테고리 범위로 스코프
  const casePool = useMemo(() => {
    const set = new Map()
    for (const c of catCases) for (const t of (c.tags || [])) {
      const lc = t.toLowerCase(); if (!set.has(lc)) set.set(lc, t)
    }
    return [...set.values()]
  }, [catCases])

  const strengthPool = useMemo(() => {
    const set = new Map()
    for (const s of strengths || []) for (const t of (s.tags || [])) {
      const lc = t.toLowerCase(); if (!set.has(lc)) set.set(lc, t)
    }
    return [...set.values()]
  }, [strengths])

  // 매칭 + 정렬 (카테고리 → 태그. 태그 0개면 카테고리 전체 노출, 원본 순서 유지)
  const sortedCases = useMemo(() => {
    if (!caseTags.length) return catCases
    return [...catCases]
      .map(c => ({ c, n: matchCount(c, caseTags) }))
      .filter(x => x.n > 0)
      .sort((a, b) => b.n - a.n)
      .map(x => x.c)
  }, [catCases, caseTags])

  const sortedStrengths = useMemo(() => {
    if (!strengthTags.length) return strengths
    return [...strengths]
      .map(s => ({ s, n: matchCount(s, strengthTags) }))
      .filter(x => x.n > 0)
      .sort((a, b) => b.n - a.n)
      .map(x => x.s)
  }, [strengths, strengthTags])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <section>
        <SectionHead label="🗂️ 케이스 카테고리" suffix={`${sortedCases.length}건`} />
        <CategoryTabs value={caseCategory} onChange={setCaseCategory} counts={catCounts} />
      </section>

      <section>
        <SectionHead label="🏷️ 태그로 좁히기" suffix={caseTags.length ? `${caseTags.length}개 선택` : '태그를 눌러보세요'} />
        <TagPalette
          pool={casePool}
          active={caseTags}
          onToggle={toggleCaseTag}
          onClear={() => onChangeCaseTags([])}
          emptyHint="이 카테고리에 등록된 태그가 없습니다."
        />
        <TagActions onSuggest={onSuggestTags} isSuggesting={isSuggesting} />
      </section>

      <section>
        <SectionHead label="유사 치료 사례" count={selectedCaseIds.length} total={sortedCases.length} totalLabel={caseTags.length ? '매칭됨' : (caseCategory === '전체' ? '전체' : caseCategory)} />
        {cases.length === 0 ? (
          <Empty hint="공용 케이스 시트를 불러오지 못했습니다. 잠시 후 다시 시도해주세요." />
        ) : sortedCases.length === 0 ? (
          <Empty hint="선택한 카테고리·태그와 일치하는 케이스가 없습니다. 조건을 조정해보세요." />
        ) : (
          <div style={S.grid}>
            {sortedCases.map(c => {
              const active = selectedCaseIds.includes(c.id)
              const firstPair = (c.pairs || [])[0] || {}
              const matched = (c.tags || []).filter(t => caseTags.some(s => s.toLowerCase() === t.toLowerCase()))
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
                  {matched.length > 0 && (
                    <div style={S.matchTags}>
                      {matched.map(t => <span key={t} style={S.matchChip}>#{t}</span>)}
                      <span style={S.matchCount}>{matched.length}개 일치</span>
                    </div>
                  )}
                  <Checkmark active={active} />
                </button>
              )
            })}
          </div>
        )}
      </section>

      <section>
        <SectionHead label="🏷️ 어필포인트 매칭 태그" suffix={`${strengthTags.length}개 선택`} />
        <TagBar
          tags={strengthTags}
          pool={strengthPool}
          onChange={onChangeStrengthTags}
          emptyHint="환자 성향 관련 태그를 추가하거나 '다시 추천'을 눌러주세요."
        />
      </section>

      <section>
        <SectionHead label="어필포인트" count={selectedStrengthIds.length} total={sortedStrengths.length} totalLabel={strengthTags.length ? '매칭됨' : '전체'} />
        {strengths.length === 0 ? (
          <Empty hint="Settings → 어필포인트 탭에서 등록해주세요." />
        ) : sortedStrengths.length === 0 ? (
          <Empty hint="선택한 태그와 일치하는 어필포인트가 없습니다." />
        ) : (
          <div style={S.grid}>
            {sortedStrengths.map(s => {
              const active = selectedStrengthIds.includes(s.id)
              const matched = (s.tags || []).filter(t => strengthTags.some(x => x.toLowerCase() === t.toLowerCase()))
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
                  {matched.length > 0 && (
                    <div style={S.matchTags}>
                      {matched.map(t => <span key={t} style={S.matchChip}>#{t}</span>)}
                      <span style={S.matchCount}>{matched.length}개 일치</span>
                    </div>
                  )}
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

// ─────── 카테고리 탭 (전체/치아교정/심미치료/임플란트)
function CategoryTabs({ value, onChange, counts }) {
  const cats = ['전체', ...CASE_CATEGORIES]
  return (
    <div style={S.catBar}>
      {cats.map(cat => {
        const active = value === cat
        const n = counts?.[cat] || 0
        return (
          <button
            key={cat} type="button"
            onClick={() => onChange(cat)}
            style={{ ...S.catBtn, ...(active ? S.catBtnActive : {}) }}
          >
            {cat}
            <span style={{ ...S.catCount, ...(active ? S.catCountActive : {}) }}>{n}</span>
          </button>
        )
      })}
    </div>
  )
}

// ─────── 클릭형 태그 팔레트 (홈페이지 치료 전·후와 동일 UX — 태그 버튼 나열, 클릭 토글)
function TagPalette({ pool, active, onToggle, onClear, emptyHint }) {
  const lower = (active || []).map(t => t.toLowerCase())
  if (!pool || pool.length === 0) {
    return (
      <div style={S.paletteEmpty}>{emptyHint || '태그가 없습니다.'}</div>
    )
  }
  return (
    <div style={S.palette}>
      {pool.map(t => {
        const on = lower.includes(t.toLowerCase())
        return (
          <button
            key={t} type="button"
            onClick={() => onToggle(t)}
            style={{ ...S.paletteChip, ...(on ? S.paletteChipOn : {}) }}
          >#{t}</button>
        )
      })}
      {lower.length > 0 && (
        <button type="button" onClick={onClear} style={S.paletteClear}>선택 해제 ×</button>
      )}
    </div>
  )
}

// ─────── 태그 칩 바 (선택/추가/제거 + 자동완성) — 어필포인트 섹션에서 사용
function TagBar({ tags, pool, onChange, emptyHint }) {
  const [input, setInput] = useState('')
  const [focused, setFocused] = useState(false)
  const lower = (tags || []).map(t => t.toLowerCase())
  const suggestions = (() => {
    const q = normalizeTag(input).toLowerCase()
    return (pool || [])
      .filter(t => !lower.includes(t.toLowerCase()))
      .filter(t => !q || t.toLowerCase().includes(q))
      .slice(0, 8)
  })()
  const add = (raw) => {
    const n = normalizeTag(raw); if (!n) return
    if (lower.includes(n.toLowerCase())) { setInput(''); return }
    onChange(normalizeTags([...(tags || []), n]))
    setInput('')
  }
  const remove = (t) => onChange((tags || []).filter(x => x.toLowerCase() !== t.toLowerCase()))
  const onKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(input) }
    else if (e.key === 'Backspace' && !input && tags?.length) remove(tags[tags.length - 1])
  }
  return (
    <div style={{ position: 'relative' }}>
      <div style={S.tagBar}>
        {(tags || []).map(t => (
          <span key={t} style={S.tagChipActive}>
            #{t}
            <button onClick={() => remove(t)} type="button" style={S.tagChipX}>×</button>
          </span>
        ))}
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          placeholder={tags?.length ? '' : (emptyHint || '태그 입력 후 Enter')}
          style={S.tagInput}
        />
      </div>
      {focused && suggestions.length > 0 && (
        <div style={S.tagDropdown}>
          {suggestions.map(s => (
            <button
              key={s} type="button"
              onMouseDown={(e) => { e.preventDefault(); add(s) }}
              style={S.tagOption}
              onMouseEnter={(e) => e.currentTarget.style.background = '#f3f4f6'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'none'}
            >#{s}</button>
          ))}
        </div>
      )}
    </div>
  )
}

function TagActions({ onSuggest, isSuggesting }) {
  if (!onSuggest) return null
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
      <button
        type="button"
        onClick={onSuggest}
        disabled={isSuggesting}
        style={{
          padding: '4px 10px', fontSize: 12, color: '#6b7280',
          background: '#fff', border: '1px solid #d1d5db', borderRadius: 4,
          cursor: isSuggesting ? 'not-allowed' : 'pointer', opacity: isSuggesting ? 0.5 : 1,
        }}
      >{isSuggesting ? '추천 중…' : '🔄 AI 다시 추천'}</button>
    </div>
  )
}

function SectionHead({ label, count, total, totalLabel = '전체', suffix }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
      <div style={{ fontSize: 16, fontWeight: 700, color: '#1a1a18' }}>{label}</div>
      <div style={{ fontSize: 12, color: '#6b7280' }}>
        {suffix
          ? suffix
          : <>선택 <strong style={{ color: '#b5976a' }}>{count}</strong> / {totalLabel} {total}</>}
      </div>
    </div>
  )
}

function Empty({ hint }) {
  return (
    <div style={{ padding: '28px', background: '#f9fafb', border: '1px dashed #d1d5db', borderRadius: 10, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>
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
  catBar: { display: 'flex', flexWrap: 'wrap', gap: 8 },
  catBtn: {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '8px 14px', fontSize: 14, fontWeight: 700,
    background: '#fff', border: '1px solid #d1d5db', borderRadius: 20,
    color: '#6b7280', cursor: 'pointer', fontFamily: 'inherit',
  },
  catBtnActive: { background: '#1a1a18', borderColor: '#1a1a18', color: '#fff' },
  catCount: {
    fontSize: 11, fontWeight: 700, padding: '1px 7px', borderRadius: 10,
    background: '#f3f4f6', color: '#9ca3af',
  },
  catCountActive: { background: '#b5976a', color: '#fff' },
  palette: { display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  paletteEmpty: { padding: '14px', background: '#f9fafb', border: '1px dashed #e5e7eb', borderRadius: 8, color: '#9ca3af', fontSize: 12, textAlign: 'center' },
  paletteChip: {
    padding: '6px 12px', fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
    background: '#fff', border: '1px solid #d1d5db', borderRadius: 16,
    color: '#4b5563', cursor: 'pointer',
  },
  paletteChipOn: { background: '#b5976a', borderColor: '#b5976a', color: '#fff' },
  paletteClear: {
    padding: '6px 10px', fontSize: 12, fontFamily: 'inherit',
    background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', marginLeft: 4,
  },
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
  matchTags: { display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center', marginTop: 4 },
  matchChip: { padding: '2px 6px', background: '#fef3c7', color: '#92400e', borderRadius: 8, fontSize: 11, fontWeight: 600 },
  matchCount: { fontSize: 10, color: '#b5976a', fontWeight: 700, marginLeft: 'auto' },
  tagBar: { display: 'flex', flexWrap: 'wrap', gap: 6, padding: 8, background: '#fff', border: '1px solid #d1d5db', borderRadius: 6, minHeight: 44 },
  tagChipActive: { display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px', background: '#fef3c7', color: '#92400e', borderRadius: 12, fontSize: 12, fontWeight: 600 },
  tagChipX: { background: 'none', border: 'none', cursor: 'pointer', color: '#92400e', padding: 0, fontSize: 14, lineHeight: 1 },
  tagInput: { flex: 1, minWidth: 140, border: 'none', outline: 'none', padding: '3px 4px', fontSize: 13, background: 'transparent' },
  tagDropdown: { position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 2, background: '#fff', border: '1px solid #d1d5db', borderRadius: 6, boxShadow: '0 4px 12px rgba(0,0,0,0.1)', maxHeight: 200, overflowY: 'auto', zIndex: 10 },
  tagOption: { display: 'block', width: '100%', textAlign: 'left', padding: '6px 10px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: '#374151' },
}
