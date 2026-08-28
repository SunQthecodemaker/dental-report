/**
 * CaseStrengthSelector — 환자별 케이스/어필포인트 선택 + 태그 기반 매칭.
 * - 상단: 카테고리 탭 + 관련 태그 칩 (선택/추가/다시 추천)
 * - 중단: 매칭된 케이스 (카테고리 → 태그 OR 매칭 + 매치 개수 순 정렬)
 * - 하단: 매칭된 어필포인트 (같은 매커니즘)
 */
import { useMemo, useState } from 'react'
import { normalizeTag, normalizeTags, matchCount } from '../lib/library'
import { CASE_CATEGORIES } from '../lib/caseSheet'

/** 폴더 하나에서 기본으로 보여줄 케이스 수 — 너무 많으면 고르기 어렵다 */
const CASES_PER_FOLDER = 6

export default function CaseStrengthSelector({
  cases, strengths,
  selectedCaseIds, selectedStrengthIds,
  onChangeCases, onChangeStrengths,
  caseTags = [], strengthTags = [],
  // 케이스 태그는 이제 직접 고르지 않고 폴더로 탐색한다 — onChangeCaseTags 는 쓰지 않는다
  onChangeStrengthTags,
  onSuggestTags, isSuggesting = false,
}) {
  const toggle = (ids, id, setter) => {
    if (ids.includes(id)) setter(ids.filter(x => x !== id))
    else setter([...ids, id])
  }

  // 케이스는 태그 칩 대신 폴더로 고른다 (아래 caseFolders 참고).
  // caseTags 는 AI 추천 결과로만 남아 폴더 정렬·표시에 쓰인다.

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

  /**
   * 태그를 폴더로 묶는다. 61건이 한 번에 펼쳐져 있으면 고르기 어려워
   * 기본은 전부 접어 두고, 폴더를 눌렀을 때만 그 태그의 사진을 보여 준다.
   * 한 케이스에 태그가 여러 개면 해당 폴더마다 나온다(찾아가는 길이 여럿).
   * AI 가 추천한 태그(caseTags)는 위로 올리고 표시를 단다.
   */
  const [openFolder, setOpenFolder] = useState(null)
  const [showAllIn, setShowAllIn] = useState(null)   // 전부 펼친 폴더
  const caseFolders = useMemo(() => {
    const rec = new Set((caseTags || []).map(t => t.toLowerCase()))
    const byTag = new Map()
    catCases.forEach((c, order) => {
      const tags = (c.tags || []).length ? c.tags : ['(태그 없음)']
      for (const t of tags) {
        const k = t.toLowerCase()
        if (!byTag.has(k)) byTag.set(k, { tag: t, cases: [] })
        byTag.get(k).cases.push({ ...c, _order: order })
      }
    })
    return [...byTag.entries()]
      .map(([k, v]) => {
        // 폴더 안에서도 보여줄 순서를 정한다.
        // 전후 세트가 많은 케이스일수록 여러 각도가 담겨 상담에 쓰기 좋아 앞에 둔다.
        // 같으면 시트에 적힌 순서를 지킨다.
        const ranked = [...v.cases].sort((a, b) =>
          ((b.pairs || []).length - (a.pairs || []).length) || (a._order - b._order))
        return {
          ...v,
          cases: ranked,
          recommended: rec.has(k),
          picked: v.cases.filter(c => selectedCaseIds.includes(c.id)).length,
        }
      })
      // AI 추천 → 선택된 게 있는 폴더 → 케이스 많은 순
      .sort((a, b) =>
        (b.recommended - a.recommended) ||
        ((b.picked > 0) - (a.picked > 0)) ||
        (b.cases.length - a.cases.length))
  }, [catCases, caseTags, selectedCaseIds])

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
        <SectionHead
          label="유사 치료 사례"
          count={selectedCaseIds.length}
          total={sortedCases.length}
          totalLabel={caseTags.length ? '추천' : (caseCategory === '전체' ? '전체' : caseCategory)}
        />
        <TagActions onSuggest={onSuggestTags} isSuggesting={isSuggesting} />
        {/*
          한 케이스는 태그 수만큼 여러 폴더에 나온다(대부분 2~3곳).
          그래서 하나만 골라도 폴더 머리의 "선택" 표시가 2~3개 동시에 붙어
          여러 건이 선택된 것처럼 보이고, 하나를 풀면 그게 한꺼번에 사라진다.
          실제로 몇 건이 담겼는지는 이 줄이 정본이다.
        */}
        <SelectedCases
          items={selectedCaseIds.map(id => (cases || []).find(c => c.id === id)).filter(Boolean)}
          onRemove={(id) => onChangeCases(selectedCaseIds.filter(x => x !== id))}
        />
        {cases.length === 0 ? (
          <Empty hint="공용 케이스 시트를 불러오지 못했습니다. 잠시 후 다시 시도해주세요." />
        ) : caseFolders.length === 0 ? (
          <Empty hint="이 카테고리에 등록된 케이스가 없습니다." />
        ) : (
          <div style={S.folderList}>
            {caseFolders.map(f => {
              const open = openFolder === f.tag
              // 폴더당 기본 6개만. 고른 케이스는 6위 밖이어도 항상 보이게 끌어올린다.
              const expanded = showAllIn === f.tag
              const head = f.cases.slice(0, CASES_PER_FOLDER)
              const pickedOutside = f.cases
                .slice(CASES_PER_FOLDER)
                .filter(c => selectedCaseIds.includes(c.id))
              const shown = expanded ? f.cases : [...head, ...pickedOutside]
              const hidden = f.cases.length - shown.length
              return (
                <div key={f.tag} style={{ ...S.folder, ...(open ? S.folderOpen : {}) }}>
                  <button
                    type="button"
                    onClick={() => setOpenFolder(open ? null : f.tag)}
                    style={S.folderHead}
                  >
                    <span style={S.folderCaret}>{open ? '▾' : '▸'}</span>
                    <span style={S.folderName}>#{f.tag}</span>
                    {f.recommended && <span style={S.folderRec}>AI 추천</span>}
                    <span style={S.folderCount}>
                      {f.cases.length > CASES_PER_FOLDER
                        ? `${CASES_PER_FOLDER} / ${f.cases.length}건`
                        : `${f.cases.length}건`}
                    </span>
                    {f.picked > 0 && <span style={S.folderPicked}>선택 {f.picked}</span>}
                  </button>

                  {open && (
                    <div style={S.grid}>
                      {shown.map(c => {
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
                            {/* 이 케이스가 어느 폴더들에 함께 들어가 있는지 — 같은 케이스를
                                다른 태그에서 다시 만났을 때 헷갈리지 않게 */}
                            {(c.tags || []).length > 1 && (
                              <div style={S.cardTags}>
                                {c.tags.map(t => (
                                  <span key={t} style={t.toLowerCase() === f.tag.toLowerCase() ? S.cardTagOn : S.cardTag}>#{t}</span>
                                ))}
                              </div>
                            )}
                            {c.description && <div style={S.cardDesc}>{c.description}</div>}
                            <Checkmark active={active} />
                          </button>
                        )
                      })}
                    </div>
                  )}

                  {open && (hidden > 0 || expanded) && (
                    <button
                      type="button"
                      onClick={() => setShowAllIn(expanded ? null : f.tag)}
                      style={S.folderMore}
                    >
                      {expanded ? '접기 ▴' : `+${hidden}개 더 보기 ▾`}
                    </button>
                  )}
                </div>
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

/**
 * 지금 담긴 케이스만 모아 보여 준다 — 이게 선택의 정본이다.
 * 폴더 머리의 "선택" 표시는 같은 케이스가 여러 태그에 걸쳐 여러 번 뜨므로
 * 건수를 세는 용도로 쓰면 안 된다.
 */
function SelectedCases({ items, onRemove }) {
  if (!items.length) return null
  return (
    <div style={S.picked}>
      <div style={S.pickedHead}>담은 사례 {items.length}건</div>
      <div style={S.pickedList}>
        {items.map(c => (
          <button
            key={c.id} type="button"
            onClick={() => onRemove(c.id)}
            title="빼기"
            style={S.pickedChip}
          >
            <span>{c.title || '(제목 없음)'}</span>
            <span style={S.pickedX}>×</span>
          </button>
        ))}
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

  /* 태그 폴더 — 기본은 접힘, 누르면 그 태그의 케이스만 펼쳐진다 */
  folderList: { display: 'flex', flexDirection: 'column', gap: 8 },
  folder: { border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff', overflow: 'hidden' },
  folderOpen: { borderColor: '#b5976a', boxShadow: '0 1px 6px rgba(181,151,106,0.18)' },
  folderHead: {
    display: 'flex', alignItems: 'center', gap: 10, width: '100%',
    padding: '12px 14px', border: 'none', background: 'transparent',
    cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
  },
  folderCaret: { color: '#9ca3af', fontSize: 12, width: 12, flex: '0 0 auto' },
  folderName: { fontSize: 14, fontWeight: 600, color: '#1f2937' },
  folderRec: { padding: '2px 7px', borderRadius: 8, background: '#b5976a', color: '#fff', fontSize: 10, fontWeight: 700 },
  folderCount: { marginLeft: 'auto', fontSize: 12, color: '#9ca3af' },
  folderPicked: { padding: '2px 7px', borderRadius: 8, background: '#6a9b7a', color: '#fff', fontSize: 10, fontWeight: 700 },
  /* 담은 사례 — 선택의 정본 */
  picked: {
    marginBottom: 12, padding: '10px 12px',
    border: '1px solid #cfe0d6', borderRadius: 8, background: '#f4f9f6',
  },
  pickedHead: { fontSize: 12, fontWeight: 700, color: '#3f6b52', marginBottom: 8 },
  pickedList: { display: 'flex', flexWrap: 'wrap', gap: 6 },
  pickedChip: {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '5px 8px 5px 10px', borderRadius: 14,
    border: '1px solid #6a9b7a', background: '#fff',
    color: '#2f5c43', fontSize: 12, fontWeight: 600,
    cursor: 'pointer', fontFamily: 'inherit',
  },
  pickedX: { color: '#9ca3af', fontSize: 14, lineHeight: 1 },

  /* 카드에 붙는 태그 — 이 케이스가 어느 폴더들에 함께 들어가 있는지 */
  cardTags: { display: 'flex', flexWrap: 'wrap', gap: 4 },
  cardTag: { fontSize: 10, color: '#9ca3af', fontWeight: 600 },
  cardTagOn: { fontSize: 10, color: '#b5976a', fontWeight: 700 },

  folderMore: {
    display: 'block', width: '100%', padding: '10px 14px',
    border: 'none', borderTop: '1px solid #f3f4f6', background: '#fafafa',
    color: '#6b7280', fontSize: 12, fontWeight: 600,
    cursor: 'pointer', fontFamily: 'inherit',
  },
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
