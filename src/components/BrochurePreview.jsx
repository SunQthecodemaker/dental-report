/**
 * BrochurePreview — v4 하이브리드 (위→아래 구조)
 * - 섹션 상단: 사진 + 개별 짧은 설명 (figcaption)
 * - 섹션 하단: 종합 소견 (드롭캡 풀어 서술)
 * - 치료 계획: 각 계획 독립 블록 (목표 추출 불가시 방법·효과만)
 * - 실 입력 데이터만 렌더 (추측 필드 없음)
 */
import { useRef, useState } from 'react'
import MarkingOverlay from './MarkingOverlay'
import { parseMarkingsAttr } from '../lib/markings'

/**
 * 치료 계획 헤더 인식 — AI 출력 표기가 한 가지로 고정되지 않아 모두 받는다.
 *   "계획 [1]:", "계획 #1:", "계획 1:", "계획 1안:", "계획 1번:", "1안:", "계획 [1]안:"
 * 여기서 놓치면 계획이 파싱되지 않아 1안/2안 배지 없이 원문이 그대로 나온다.
 * "기간:", "주의사항:", "2026:" 같은 것은 걸리지 않아야 한다.
 */
const PLAN_HEADER_RE = /^(?:계획\s*[#[]?\s*\d+\s*\]?\s*(?:안|번)?|[#[]?\s*\d+\s*\]?\s*(?:안|번))\s*[:：]\s*/

/** 섹션 바탕색 — 흰색과 아이보리를 번갈아 써서 스크롤할 때 띠처럼 나뉘어 보이게 한다 */
function toneStyle(tone) {
  return tone === 'cream' ? S.toneCream : S.toneLight
}

const EN_LABEL = {
  // 새 4섹션 구조
  '구외 소견': 'Extra-oral Findings',
  '구내 소견': 'Intra-oral Findings',
  '치료 계획': 'Treatment Plan',
  '종합 안내': 'Overall Assessment',
  // 옛 섹션명 (기존 저장된 진단서 호환용)
  '문제 목록': 'Problem Findings',
  '치성 관계': 'Dental Relationship',
  '골격 관계': 'Skeletal Relationship',
  '추가 사항': 'Additional Notes',
}

export default function BrochurePreview({ patientName, consultDate, content, photos = [], mode = 'preview', onUpdateCaption, onUpdateNote, onOpenMarker, cases = [], strengths = [] }) {
  const v = mode === 'view' || mode === 'design'
  const design = mode === 'design'
  const bodyHtml = content?.body || ''
  const hasBody = !!bodyHtml && bodyHtml.replace(/<[^>]+>/g, '').trim().length > 0
  const hasNote = !!content?.personalNote
  const hasPhotos = Array.isArray(photos) && photos.length > 0
  const hasCases = Array.isArray(cases) && cases.length > 0
  const hasStrengths = Array.isArray(strengths) && strengths.length > 0

  if (!hasBody && !hasNote && !hasPhotos && !hasCases && !hasStrengths) {
    return (
      <div style={S.empty}>AI 텍스트를 생성하면<br />여기에 미리보기가 표시됩니다</div>
    )
  }

  const sections = mergeLegacySections(parseSections(bodyHtml))
  // 치료 계획 뒤에 케이스/장점 삽입. 그 뒤 나머지 섹션(예: 추가사항) → 맞춤안내 → 푸터.
  const tIdx = sections.findIndex(s => s.title === '치료 계획')
  const secBefore = tIdx >= 0 ? sections.slice(0, tIdx + 1) : sections
  const secAfter  = tIdx >= 0 ? sections.slice(tIdx + 1) : []
  // 홀수 섹션은 흰 바탕, 짝수 섹션은 아이보리 — 스크롤하면 띠처럼 번갈아 나온다
  const toneOf = (i) => (i % 2 === 0 ? 'cream' : 'light')

  const renderSection = (sec, globalNum) => {
    const num = String(globalNum).padStart(2, '0')
    const en = EN_LABEL[sec.title] || ''
    const tone = toneOf(globalNum)
    if (sec.title === '치료 계획') {
      return <TreatmentSection key={`t-${globalNum}`} num={num} en={en} kr={sec.title} summaryHtml={sec.summaryHtml} v={v} tone={tone} />
    }
    return (
      <DiagnosticSection
        key={`s-${globalNum}`} num={num} en={en} kr={sec.title}
        figures={sec.figures} summaryHtml={sec.summaryHtml} v={v} tone={tone}
        design={design} onUpdateCaption={onUpdateCaption} onOpenMarker={onOpenMarker}
      />
    )
  }

  let n = 0
  const blocks = []
  for (const sec of secBefore) { n++; blocks.push(renderSection(sec, n)) }
  if (hasCases)     { n++; blocks.push(<CasesSection    key={`cases-${n}`}     num={String(n).padStart(2, '0')} cases={cases} tone={toneOf(n)} />) }
  if (hasStrengths) { n++; blocks.push(<StrengthsSection key={`strengths-${n}`} num={String(n).padStart(2, '0')} strengths={strengths} tone={toneOf(n)} />) }
  for (const sec of secAfter)  { n++; blocks.push(renderSection(sec, n)) }

  return (
    <div style={S.page}>
      {/* COVER */}
      <Cover patientName={patientName} consultDate={consultDate} v={v} />

      {blocks}

      {/* 맞춤 안내 */}
      {hasNote && <PersonalNote patientName={patientName} note={content.personalNote} v={v} design={design} onUpdateNote={onUpdateNote} />}

      {/* 푸터 */}
      <Footer v={v} />
    </div>
  )
}

/* ═════════════ 파싱 로직 ═════════════ */

function parseSections(bodyHtml) {
  if (!bodyHtml) return []
  try {
    const parser = new DOMParser()
    const doc = parser.parseFromString(`<div id="root">${bodyHtml}</div>`, 'text/html')
    const root = doc.getElementById('root')
    if (!root) return []

    // 🛡 중첩된 figure 자동 unnest (parseSections 안전 장치)
    const nestedFigs = root.querySelectorAll('figure figure')
    nestedFigs.forEach(nested => {
      let anc = nested.parentElement
      while (anc && anc.tagName !== 'FIGURE') anc = anc.parentElement
      if (anc && anc.parentElement) {
        anc.parentElement.insertBefore(nested, anc.nextSibling)
      }
    })

    const raw = []
    let cur = { title: null, nodes: [] }
    for (const node of Array.from(root.childNodes)) {
      if (node.nodeType === 1 && node.tagName === 'H2') {
        if (cur.title || cur.nodes.length) raw.push(cur)
        cur = { title: node.textContent.trim(), nodes: [] }
      } else {
        cur.nodes.push(node)
      }
    }
    if (cur.title || cur.nodes.length) raw.push(cur)

    return raw
      .filter(s => s.title)
      .map(sec => {
        const figures = []
        const summaryParts = []
        for (const node of sec.nodes) {
          if (node.nodeType !== 1) {
            const t = (node.textContent || '').trim()
            if (t) summaryParts.push(node.textContent)
            continue
          }
          // 노드 자체가 figure/img
          if (node.tagName === 'FIGURE') {
            figures.push(readFigure(node))
            continue
          }
          if (node.tagName === 'IMG') {
            figures.push({ src: node.getAttribute('src') || '', caption: '', orient: node.getAttribute('data-orient') || '' })
            continue
          }
          // 자식에 figure/img가 있으면 분리
          const innerFigs = node.querySelectorAll('figure')
          const innerImgs = node.querySelectorAll('img')
          if (innerFigs.length || innerImgs.length) {
            innerFigs.forEach(f => { figures.push(readFigure(f)); f.remove() })
            innerImgs.forEach(img => {
              if (img.closest('figure')) return
              figures.push({ src: img.getAttribute('src') || '', caption: '', orient: img.getAttribute('data-orient') || '' })
              img.remove()
            })
            // 잔여 텍스트가 있으면 summary에 포함
            const leftover = node.textContent.replace(/\s+/g, ' ').trim()
            if (leftover) summaryParts.push(node.outerHTML)
          } else {
            summaryParts.push(node.outerHTML)
          }
        }
        return {
          title: sec.title,
          figures,
          summaryHtml: summaryParts.join('').trim(),
        }
      })
  } catch {
    return []
  }
}

/**
 * AI 가 한자 섞어 출력한 섹션 키를 한글로 정규화 (방어선 — Gemini 한국어 한자어 혼용 약점 대응)
 * 시스템 프롬프트에서 한자 금지 명시했지만 100% 막을 수는 없어 렌더 시점 보강.
 */
const HANJA_TO_HANGUL = [
  [/治療/g, '치료'],
  [/問題/g, '문제'],
  [/計劃/g, '계획'],
  [/計画/g, '계획'],
  [/案內/g, '안내'],
  [/案内/g, '안내'],
  [/目錄/g, '목록'],
  [/目录/g, '목록'],
  [/綜合/g, '종합'],
  [/总合/g, '종합'],
  [/總合/g, '종합'],
  [/患者/g, '환자'],
  [/齒性/g, '치성'],
  [/骨格/g, '골격'],
  [/追加/g, '추가'],
  [/事項/g, '사항'],
  [/關係/g, '관계'],
  [/関係/g, '관계'],
]
function normalizeSectionTitle(title) {
  if (!title) return title
  let out = title
  for (const [pat, rep] of HANJA_TO_HANGUL) out = out.replace(pat, rep)
  return out.trim()
}

/**
 * 옛 섹션(치성 관계 / 골격 관계 / 문제 목록 / 추가 사항) 본문을
 * 새 4섹션(구외 소견 / 구내 소견 / 치료 계획 / 종합 안내) 으로 렌더 시점에 통합.
 * - 골격 관계 → 구외 소견 (figure·summary 합산)
 * - 치성 관계 → 구내 소견
 * - 문제 목록 (4/29~4/30 단일 통합) → 구내 소견 (이미지 분실 방지 best-effort)
 * - 추가 사항 → 종합 안내
 * - 새 라벨이 같은 본문에 여러 번 나오면 머지 (drift 방지)
 * - 새 키만 있는 본문은 그대로 통과
 * - 한자 섞인 키도 한글로 정규화 후 매핑
 * - 본문 자체(DB)는 손대지 않음 — 표시만 새 라벨
 */
const LEGACY_SECTION_MAP = {
  '골격 관계': '구외 소견',
  '치성 관계': '구내 소견',
  '문제 목록': '구내 소견',
  '추가 사항': '종합 안내',
}
function mergeLegacySections(sections) {
  if (!Array.isArray(sections) || sections.length === 0) return sections
  // 1) 한자 → 한글 정규화 먼저
  const normalized = sections.map(s => ({ ...s, title: normalizeSectionTitle(s.title) }))
  const out = []
  const buckets = {}  // title → bucket reference (재사용으로 같은 라벨 머지)
  const ensureBucket = (title) => {
    if (!buckets[title]) {
      buckets[title] = { title, figures: [], summaryHtml: '' }
      out.push(buckets[title])
    }
    return buckets[title]
  }
  for (const sec of normalized) {
    const targetTitle = LEGACY_SECTION_MAP[sec.title] || sec.title
    const b = ensureBucket(targetTitle)
    if (Array.isArray(sec.figures) && sec.figures.length) b.figures.push(...sec.figures)
    if (sec.summaryHtml) b.summaryHtml = b.summaryHtml ? b.summaryHtml + sec.summaryHtml : sec.summaryHtml
  }
  return out
}

function readFigure(fig) {
  const img = fig.querySelector('img')
  const cap = fig.querySelector('figcaption')
  const src = img?.getAttribute('src') || ''
  const rawCaption = (cap?.textContent || '').trim()
  // 옛 캡션의 " — 소견" / " - 소견" / " : 소견" 자동 부연 잘라내기
  // (gemini.js generateImageCaption 후처리와 동일 — 옛 데이터 환각 잔재 제거)
  const caption = rawCaption.split(/\s[—–\-:]\s/)[0].trim()
  const orient = img?.getAttribute('data-orient') || fig.getAttribute('data-orient') || ''
  // 종횡비 기반 폴백 판정 (이미지가 이미 로드된 경우만)
  let phototype = img?.getAttribute('data-phototype') || fig.getAttribute('data-phototype') || detectPhotoTypeFromCaption(caption)
  if (!phototype && img && img.naturalWidth > 0 && img.naturalHeight > 0) {
    const r = img.naturalWidth / img.naturalHeight
    if (r > 1.8) phototype = 'panorama'
    else if (r < 0.9) phototype = 'cephalogram'
    else phototype = 'intraoral'
  }
  const markings = parseMarkingsAttr(img?.getAttribute('data-markings') || fig.getAttribute('data-markings'))
  return { src, caption, orient, phototype, markings }
}

// 캡션 텍스트로 타입 폴백 판정 (레거시 데이터용)
function detectPhotoTypeFromCaption(caption) {
  if (!caption) return ''
  const c = caption.trim()
  if (/^파노라마/.test(c)) return 'panorama'
  if (/^측모두부|^측모 두부|^세팔로|^cephalo/i.test(c)) return 'cephalogram'
  if (/^구내/.test(c)) return 'intraoral'
  if (/^전치부|^근접/.test(c)) return 'intraoral'
  if (/^얼굴/.test(c)) return 'face'
  return ''
}

function parseTreatmentPlans(summaryHtml) {
  if (!summaryHtml) return []
  try {
    const parser = new DOMParser()
    const doc = parser.parseFromString(`<div id="root">${summaryHtml}</div>`, 'text/html')
    const root = doc.getElementById('root')
    if (!root) return []

    const plans = []
    let cur = null

    for (const node of Array.from(root.childNodes)) {
      if (node.nodeType !== 1) continue
      const strong = node.querySelector?.('strong')
      const strongText = strong?.textContent?.trim() || ''
      const isPlanHeader = PLAN_HEADER_RE.test(strongText)

      if (isPlanHeader) {
        if (cur) plans.push(cur)
        // strong 안의 텍스트에서 계획 번호 표기를 제거한 나머지 → 제목으로 사용
        const titleFromStrong = strongText.replace(PLAN_HEADER_RE, '').trim()
        // <p> 전체에서 <strong>...</strong>를 제거한 나머지 HTML → method 본문으로 사용
        // (AI가 같은 <p> 안에 본문을 함께 쓴 경우 파싱 누락 방지)
        const fullHtml = node.innerHTML || ''
        const afterStrong = fullHtml.replace(/<strong>[\s\S]*?<\/strong>\s*:?\s*/i, '').trim()
        const methodHtml = afterStrong ? `<p>${afterStrong}</p>` : ''
        cur = { title: titleFromStrong, methodHtml, effect: '', duration: '' }
        continue
      }
      if (!cur) continue

      // 기대 효과 감지
      const em = node.querySelector?.('em')
      if (em && /기대\s*효과/.test(em.textContent || '')) {
        const html = node.innerHTML
        const m = html.match(/<em>[^<]*기대\s*효과[^<]*<\/em>\s*(.*)/)
        if (m) cur.effect = m[1].trim()
        continue
      }

      const txt = (node.textContent || '').trim()
      // 기간 감지
      if (/^기간\s*[:：]/.test(txt)) {
        cur.duration = txt.replace(/^기간\s*[:：]\s*/, '').trim()
        continue
      }

      cur.methodHtml += node.outerHTML
    }
    if (cur) plans.push(cur)
    return plans
  } catch {
    return []
  }
}

/* ═════════════ 컴포넌트 ═════════════ */

/** 얇은 선 가운데 마름모 하나 — 표지·구분에 쓰는 장식 */
function OrnamentRule({ style }) {
  return (
    <div style={{ ...S.ornRow, ...style }}>
      <span style={S.ornLine} />
      <span style={S.ornDiamond} />
      <span style={S.ornLine} />
    </div>
  )
}

/** 2026-04-18 → 2026. 04. 18 */
function formatCoverDate(d) {
  const m = String(d || '').match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[1]}. ${m[2]}. ${m[3]}` : (d || '____. __. __')
}

function Cover({ patientName, consultDate, v }) {
  return (
    <div style={S.cover}>
      <div style={S.coverBrand}>Prime S Dental</div>
      <OrnamentRule />
      <div style={S.coverDisplay}>Consultation Report</div>
      <div style={S.coverShortRule} />
      <div className="brochure-cover-name" style={S.coverName}>{patientName || '○○○'} 님</div>
      <div style={S.coverSub}>초진 상담 결과서</div>
      <div style={S.coverDate}>{formatCoverDate(consultDate)}</div>
    </div>
  )
}

/**
 * MarkedImage — 이미지 + 마킹 오버레이 + (design 모드에서) 📍 편집 버튼
 * 모든 figure 렌더링에서 공용으로 사용
 */
function MarkedImage({ f, imgStyle, design, onOpenMarker }) {
  const hasMarkings = Array.isArray(f.markings) && f.markings.length > 0
  return (
    <div style={{ position: 'relative', display: 'block' }}>
      <img src={f.src} alt={f.caption || ''} style={imgStyle} />
      <MarkingOverlay markings={f.markings || []} />
      {design && onOpenMarker && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onOpenMarker(f.src, f.markings || []) }}
          style={markerBtnStyle}
          title="사진 마킹"
        >
          {hasMarkings ? `📍 ${f.markings.length}` : '📍 마킹'}
        </button>
      )}
    </div>
  )
}

const markerBtnStyle = {
  position: 'absolute', top: 8, right: 8,
  padding: '4px 10px',
  background: 'rgba(26,26,24,0.85)', color: '#d4c8b4',
  border: '1px solid rgba(181,151,106,0.4)', borderRadius: 6,
  fontSize: 11, fontWeight: 600, cursor: 'pointer',
  fontFamily: "'Pretendard', sans-serif",
  backdropFilter: 'blur(4px)',
  zIndex: 2,
}

function DiagnosticSection({ num, en, kr, figures, summaryHtml, v, design, onUpdateCaption, onOpenMarker, tone }) {
  const hasFigs = figures.length > 0
  const hasSummary = !!summaryHtml && summaryHtml.replace(/<[^>]+>/g, '').trim().length > 0
  if (!hasFigs && !hasSummary) return null

  // 타입별 그룹핑
  const panoramas = figures.filter(f => f.phototype === 'panorama')
  const intraorals = figures.filter(f => !f.phototype || f.phototype === 'intraoral')
  const others = figures.filter(f => ['cephalogram', 'face', 'other'].includes(f.phototype))

  // 구내 그룹이 텍스트를 소비하는지
  const intraoralConsumesText = intraorals.length > 0 && hasSummary

  return (
    <div style={{ ...S.sec, ...toneStyle(tone) }}>
      <SecHead num={num} en={en} kr={kr} />

      {/* 1단: 파노라마 풀폭 */}
      {panoramas.map((f, i) => (
        <figure key={`pano-${i}`} style={S.figFull}>
          <MarkedImage f={f} imgStyle={S.imgFull} design={design} onOpenMarker={onOpenMarker} />
          <EditableCaption caption={f.caption} src={f.src} design={design} onUpdateCaption={onUpdateCaption} full />
        </figure>
      ))}

      {/* 2단: 기타(셉, 얼굴 등) - 사용자 지정: "따로 배치" */}
      {others.map((f, i) => (
        <figure key={`oth-${i}`} style={S.figCenter}>
          <MarkedImage f={f} imgStyle={S.imgPortrait} design={design} onOpenMarker={onOpenMarker} />
          <EditableCaption caption={f.caption} src={f.src} design={design} onUpdateCaption={onUpdateCaption} />
        </figure>
      ))}

      {/* 3단: 구내 그룹 + 텍스트 */}
      <IntraoralGroup figures={intraorals} summaryHtml={summaryHtml} design={design} onUpdateCaption={onUpdateCaption} onOpenMarker={onOpenMarker} />

      {/* 구내가 텍스트를 소비 안 했고 텍스트만 남아있으면 단독 렌더 */}
      {!intraoralConsumesText && hasSummary && <Summary html={summaryHtml} />}
    </div>
  )
}

// 편집 가능한 캡션 (design 모드에서만 editable)
function EditableCaption({ caption, src, design, onUpdateCaption, full }) {
  if (!design && !caption) return null
  const style = full ? { ...S.figCap, padding: '14px 48px 0', background: 'transparent' } : S.figCap
  if (design) {
    return (
      <figcaption
        style={{ ...style, outline: 'none', minHeight: '1em', cursor: 'text' }}
        contentEditable
        suppressContentEditableWarning
        onBlur={(e) => onUpdateCaption?.(src, e.currentTarget.textContent.trim())}
        data-placeholder="사진 설명 입력..."
      >{caption}</figcaption>
    )
  }
  return <figcaption style={style}>{caption}</figcaption>
}

// 구내 그룹 + 텍스트 통합 레이아웃
function IntraoralGroup({ figures, summaryHtml, design, onUpdateCaption, onOpenMarker }) {
  const count = figures.length
  const hasSummary = !!summaryHtml && summaryHtml.replace(/<[^>]+>/g, '').trim().length > 0

  if (count === 0) return null

  const img = (f, i) => (
    <figure key={i} style={S.figGrid}>
      <MarkedImage f={f} imgStyle={S.imgGrid} design={design} onOpenMarker={onOpenMarker} />
      <EditableCaption caption={f.caption} src={f.src} design={design} onUpdateCaption={onUpdateCaption} />
    </figure>
  )

  // 1장 + 텍스트 → 좌 사진 / 우 텍스트 (모바일 세로)
  if (count === 1 && hasSummary) {
    return (
      <div className="v4-split">
        <div className="v4-split-photo">{img(figures[0], 0)}</div>
        <div className="v4-split-text"><Summary html={summaryHtml} inSplit /></div>
      </div>
    )
  }

  // 1장 + 텍스트 없음 → 중앙 단독
  if (count === 1) {
    return (
      <div style={S.figSolo}>{img(figures[0], 0)}</div>
    )
  }

  // 2장 + 텍스트 → 2-up, 텍스트 아래
  if (count === 2) {
    return (
      <>
        <div className="v4-grid2">{figures.map(img)}</div>
        {hasSummary && <Summary html={summaryHtml} />}
      </>
    )
  }

  // 3장 + 텍스트 → [1][2] / [3][텍스트]
  if (count === 3 && hasSummary) {
    return (
      <div className="v4-grid3">
        {figures.map(img)}
        <div className="v4-grid3-text"><Summary html={summaryHtml} inSplit /></div>
      </div>
    )
  }

  // 3장 텍스트 없음 → 2-up + 1장 단독
  if (count === 3) {
    return (
      <>
        <div className="v4-grid2">{figures.slice(0, 2).map(img)}</div>
        {img(figures[2], 2)}
      </>
    )
  }

  // 4장+ → 2×2 (혹은 2-col) grid + 텍스트 아래
  return (
    <>
      <div className="v4-grid2">{figures.map(img)}</div>
      {hasSummary && <Summary html={summaryHtml} />}
    </>
  )
}

function CasesSection({ num, cases, tone }) {
  if (!cases?.length) return null
  return (
    <div style={{ ...S.secPlan, ...toneStyle(tone) }}>
      <SecHead num={num} en="Similar Cases" kr="유사 치료 사례" center />
      {cases.map((c, i) => (
        <div key={c.id || i} style={{ ...S.planBlock, ...(i > 0 ? S.planBlockDivider : {}) }}>
          {c.title && <h3 style={S.planTitle}>{c.title}</h3>}
          <CaseSlider pairs={c.pairs || []} />
          {c.description && (
            <div style={{ ...S.planMethodBody, maxWidth: 640, margin: '0 auto', whiteSpace: 'pre-wrap' }}>
              {c.description}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

/**
 * 케이스 하나의 전·후 사진 슬라이더.
 * 한 슬라이드 = 전후 한 쌍 (Before/After 비교가 깨지지 않도록 쌍 단위로 넘긴다).
 * 쌍이 하나뿐이면 넘길 게 없으므로 화살표·인디케이터 없이 그대로 보여준다.
 */
function CaseSlider({ pairs }) {
  const usable = (pairs || []).filter(p => p?.before_url || p?.after_url)
  const trackRef = useRef(null)
  const [idx, setIdx] = useState(0)

  if (usable.length === 0) return null

  const pair = (p, i) => (
    <div key={i} className="case-slider-slide">
      <div className="case-slider-pair">
        <CasePhoto label="Before" url={p.before_url} />
        <CasePhoto label="After" url={p.after_url} />
      </div>
    </div>
  )

  // 한 쌍뿐이면 슬라이더 껍데기 없이 바로
  if (usable.length === 1) {
    return (
      <div style={{ marginBottom: 20 }}>
        <div className="case-slider-pair">
          <CasePhoto label="Before" url={usable[0].before_url} />
          <CasePhoto label="After" url={usable[0].after_url} />
        </div>
      </div>
    )
  }

  const goTo = (i) => {
    const el = trackRef.current
    if (!el) return
    const next = Math.max(0, Math.min(usable.length - 1, i))
    el.scrollTo({ left: next * el.clientWidth, behavior: 'smooth' })
    setIdx(next)
  }

  // 스와이프로 움직였을 때 인디케이터 동기화
  const onScroll = () => {
    const el = trackRef.current
    if (!el || !el.clientWidth) return
    const next = Math.round(el.scrollLeft / el.clientWidth)
    if (next !== idx) setIdx(Math.max(0, Math.min(usable.length - 1, next)))
  }

  return (
    <div className="case-slider" style={{ marginBottom: 20 }}>
      <div className="case-slider-track" ref={trackRef} onScroll={onScroll}>
        {usable.map(pair)}
      </div>

      <div className="case-slider-nav" style={S.sliderNav}>
        <button
          type="button"
          onClick={() => goTo(idx - 1)}
          disabled={idx === 0}
          aria-label="이전 사진"
          style={{ ...S.sliderArrow, ...(idx === 0 ? S.sliderArrowOff : {}) }}
        >‹</button>

        <div style={S.sliderDots}>
          {usable.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => goTo(i)}
              aria-label={`${i + 1}번째 사진`}
              aria-current={i === idx}
              style={{ ...S.sliderDot, ...(i === idx ? S.sliderDotOn : {}) }}
            />
          ))}
        </div>

        <span style={S.sliderCount}>{idx + 1} / {usable.length}</span>

        <button
          type="button"
          onClick={() => goTo(idx + 1)}
          disabled={idx === usable.length - 1}
          aria-label="다음 사진"
          style={{ ...S.sliderArrow, ...(idx === usable.length - 1 ? S.sliderArrowOff : {}) }}
        >›</button>
      </div>
    </div>
  )
}

function CasePhoto({ label, url }) {
  if (!url) return null
  // 라벨은 사진 위에 얹지 않고 아래로 — 사진을 가리지 않도록.
  // 위쪽 모서리를 아치로 — 참고 레퍼런스의 아치형 이미지 처리.
  // 환자 본인의 구내 사진에는 쓰지 않는다(진단 정보가 잘릴 수 있어서).
  return (
    <figure style={{ margin: 0 }}>
      <img src={url} alt={label} style={S.caseImg} />
      <figcaption style={S.caseCap}>{label}</figcaption>
    </figure>
  )
}

function StrengthsSection({ num, strengths, tone }) {
  if (!strengths?.length) return null
  return (
    <div style={{ ...S.sec, ...toneStyle(tone) }}>
      <SecHead num={num} en="Why Choose Us" kr="프라임에스가 특별한 이유" />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 24, maxWidth: 720, margin: '0 auto' }}>
        {strengths.map((s, i) => (
          <StrengthCard key={s.id || i} card={s} />
        ))}
      </div>
    </div>
  )
}

function StrengthCard({ card }) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: card.photo_url ? '160px 1fr' : '1fr',
      gap: 18, alignItems: 'start',
      padding: '18px 0', borderTop: `1px solid ${C.line}`,
    }}>
      {card.photo_url && (
        <img src={card.photo_url} alt={card.title || ''}
             style={{ width: '100%', aspectRatio: '1/1', objectFit: 'cover', borderRadius: 2 }} />
      )}
      <div>
        {card.title && (
          <div style={{ fontFamily: FONTS.kor, fontWeight: 700, fontSize: 17, color: C.ink, marginBottom: 8 }}>
            {card.title}
          </div>
        )}
        {card.description && (
          <div style={{ fontSize: FS.body, lineHeight: 1.85, color: C.ink2, whiteSpace: 'pre-wrap', marginBottom: card.detail_url ? 10 : 0 }}>
            {card.description}
          </div>
        )}
        {card.detail_url && (
          <a href={card.detail_url} target="_blank" rel="noreferrer"
             style={{ fontFamily: FONTS.sans, fontSize: 12, fontWeight: 600, letterSpacing: '0.2em', textTransform: 'uppercase', color: C.gold, textDecoration: 'none', borderBottom: `1px solid ${C.gold}`, paddingBottom: 3 }}>
            자세히 보기 →
          </a>
        )}
      </div>
    </div>
  )
}

function TreatmentSection({ num, en, kr, summaryHtml, v, tone }) {
  const plans = parseTreatmentPlans(summaryHtml)
  const hasParsed = plans.length > 0
  return (
    <div style={{ ...S.secPlan, ...toneStyle(tone) }}>
      <SecHead num={num} en={en} kr={kr} center />
      {hasParsed
        ? plans.map((p, i) => <PlanBlock key={i} idx={i} plan={p} />)
        : summaryHtml && (
          <div style={S.planFallback}>
            <div dangerouslySetInnerHTML={{ __html: summaryHtml }} />
          </div>
        )}
    </div>
  )
}

function PlanBlock({ idx, plan }) {
  return (
    <div style={{ ...S.planBlock, ...(idx > 0 ? S.planBlockDivider : {}) }}>
      {/* 몇 번째 안인지 한눈에 — 로마숫자 대신 "1안 / 2안" */}
      <div style={S.planTag}>
        <span style={S.planBadge}>{idx + 1}안</span>
        <span style={S.planTagRule} />
      </div>
      {plan.title && <h3 style={S.planTitle}>{plan.title}</h3>}

      {plan.methodHtml && (
        <div style={S.planMethod}>
          <div style={S.planMethodHead}>치료 방법</div>
          <div style={S.planMethodBody} dangerouslySetInnerHTML={{ __html: plan.methodHtml }} />
        </div>
      )}

      {plan.effect && (
        <div style={S.planEffect}>
          <div style={S.planEffectHead}>기대 효과</div>
          <div style={S.planEffectQuote}>&ldquo;{plan.effect}&rdquo;</div>
        </div>
      )}

      {plan.duration && (
        <div style={S.planMeta}>
          <span style={S.planMetaKey}>기간</span>
          {plan.duration}
        </div>
      )}
    </div>
  )
}

/**
 * 섹션 머리말 — 홈페이지의 label + title 적층 방식.
 * 위에 골드 헤어라인이 가로지르고 오른쪽 끝에 번호가 붙는다.
 * 그 아래 영문 라벨, 그 아래 큰 한글 제목 — 제목이 시선의 주인공.
 */
function SecHead({ num, en, kr, center }) {
  return (
    <div style={{ ...S.secHead, ...(center ? S.secHeadCenter : {}) }}>
      <div style={S.secRuleRow}>
        <span style={S.secRule} />
        <span style={S.secNum}>{num}</span>
      </div>
      {en && <div style={S.secEn}>{en}</div>}
      <div style={S.secKr}>{kr}</div>
    </div>
  )
}

// eslint-disable-next-line no-unused-vars
function _LegacyPhotos({ figures, design, onUpdateCaption }) {
  // 배치 규칙: 1장 → single, 2장 → 2-up, 3+ → 첫장 full + 나머지 2-up
  if (figures.length === 1) {
    return (
      <div style={S.photos}>
        <FigCard fig={figures[0]} variant="solo" design={design} onUpdateCaption={onUpdateCaption} />
      </div>
    )
  }
  if (figures.length === 2) {
    return (
      <div style={S.photos}>
        <div style={S.grid2}>
          {figures.map((f, i) => <FigCard key={i} fig={f} variant="grid" design={design} onUpdateCaption={onUpdateCaption} />)}
        </div>
      </div>
    )
  }
  // 3+
  const [first, ...rest] = figures
  return (
    <div style={S.photos}>
      <FigCard fig={first} variant="full" design={design} onUpdateCaption={onUpdateCaption} />
      <div style={S.grid2}>
        {rest.map((f, i) => <FigCard key={i} fig={f} variant="grid" design={design} onUpdateCaption={onUpdateCaption} />)}
      </div>
    </div>
  )
}

// eslint-disable-next-line no-unused-vars
function _LegacyFigCard({ fig, variant, design, onUpdateCaption }) {
  if (!fig?.src) return null
  const isPortrait = fig.orient === 'portrait'
  const imgStyle =
    variant === 'solo' && isPortrait ? S.imgPortrait :
    variant === 'solo' ? S.imgSolo :
    variant === 'full' ? S.imgFull :
    S.imgGrid

  const wrapperStyle =
    variant === 'solo' && isPortrait ? S.figCenter :
    variant === 'solo' ? S.figSolo :
    variant === 'full' ? S.figFull :
    S.figGrid

  return (
    <figure style={wrapperStyle}>
      <img src={fig.src} alt={fig.caption || ''} style={imgStyle} />
      {design ? (
        <figcaption
          style={{ ...S.figCap, outline: 'none', minHeight: '1em', cursor: 'text' }}
          contentEditable
          suppressContentEditableWarning
          onBlur={(e) => onUpdateCaption?.(fig.src, e.currentTarget.textContent.trim())}
          data-placeholder="사진 설명 입력..."
        >{fig.caption}</figcaption>
      ) : (
        fig.caption && <figcaption style={S.figCap}>{fig.caption}</figcaption>
      )}
    </figure>
  )
}

function Summary({ html, inSplit }) {
  const wrapStyle = inSplit ? { ...S.summary, maxWidth: '100%', paddingTop: 12, marginTop: 0 } : S.summary
  return (
    <div style={wrapStyle}>
      {!inSplit && <div style={S.summaryMark} />}
      <div style={S.summaryLabel}>
        <span style={S.summaryEn}>Summary</span>
        <span style={S.summaryDot} />
        <span style={S.summaryKr}>종합 소견</span>
      </div>
      <div className={inSplit ? 'brochure-summary brochure-summary-narrow' : 'brochure-summary'} dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  )
}

/**
 * 드리는 말씀을 읽기 좋게 끊는다.
 *
 * AI 가 100~250자를 줄바꿈 없이 한 덩어리로 주기 때문에 문장 사이에 빈 줄을 넣는다.
 * DOM 을 쪼개지 않고 문자열에만 줄바꿈을 넣는 이유:
 *   noteQuote 가 pre-wrap 이라 그대로 문단처럼 보이고,
 *   편집 모드(contentEditable)의 textContent 저장이 줄바꿈을 그대로 보존한다.
 *   <p> 로 쪼개면 저장 시 문장들이 도로 붙어버린다.
 *
 * 이미 줄바꿈이 있으면(직접 넣었거나 한 번 저장된 것) 손대지 않는다 — 반복 적용해도 안전.
 * 마침표 뒤 공백 기준이라 "1.5mm" 같은 소수점은 쪼개지지 않는다.
 */
function formatNote(note) {
  const text = String(note || '').trim()
  if (!text) return ''
  if (/\n/.test(text)) return text
  return text.replace(/([.!?])\s+/g, '$1\n\n')
}

function PersonalNote({ patientName, note, v, design, onUpdateNote }) {
  const shown = formatNote(note)
  return (
    <div style={S.note}>
      <div style={S.noteTopRule} />
      <div style={S.noteLabel}>A Personal Note · 드리는 말씀</div>
      {design ? (
        <div
          style={{ ...S.noteQuote, outline: 'none', minHeight: '1em', cursor: 'text' }}
          contentEditable
          suppressContentEditableWarning
          onBlur={(e) => onUpdateNote?.(e.currentTarget.textContent.trim())}
          data-placeholder="맞춤 메시지 입력..."
        >{shown}</div>
      ) : (
        <div style={S.noteQuote}>{shown}</div>
      )}
      <div style={S.noteSign}>— Prime-S</div>
    </div>
  )
}

/**
 * 푸터 배너 링크.
 * 홈페이지는 http 로 둔다 — primes.co.kr 은 https 로 접속하면 도메인 전체가
 * NHN 호스팅 안내 페이지로 302 된다. 호스팅에 SSL 이 붙으면 https 로 바꿀 것.
 * 카카오톡은 http 로 넣으면 308 로 https 에 다시 붙으므로 처음부터 https 로.
 */
const LINKS = {
  kakao: 'https://pf.kakao.com/_kxmrXj',
  naver: 'https://map.naver.com/p/entry/place/1013847092?placePath=%252Fhome%253Fentry%253Dplt&searchType=place&lng=126.7221497&lat=37.4910957',
  home: 'http://primes.co.kr',
}

function Footer({ v }) {
  return (
    <div style={S.footer}>
      <div style={S.footerBrand}>Prime S</div>
      <div style={S.footerTag}>ORTHODONTIC SPECIALTY</div>
      <div style={S.footerInfo}>
        인천 부평구 경원대로 1380 / 부평역 지하상가 15번 출구 앞<br />032-504-6030
      </div>
      <div style={S.cta}>
        <a href={LINKS.kakao} target="_blank" rel="noopener noreferrer"
           style={{ ...S.ctaBtn, background: '#fee500', color: '#3c1e1e' }}>카카오톡 상담</a>
        <a href={LINKS.naver} target="_blank" rel="noopener noreferrer"
           style={{ ...S.ctaBtn, background: '#03c75a', color: '#fff' }}>네이버 예약</a>
        <a href={LINKS.home} target="_blank" rel="noopener noreferrer"
           style={{ ...S.ctaBtn, background: C.gold, color: '#2e2418' }}>홈페이지</a>
      </div>
      <div style={S.copy}>© Prime S Dental · 2026</div>
    </div>
  )
}

/* ═════════════ 스타일 ═════════════ */

const C = {
  paper: '#ffffff', ivory: '#faf8f3', cream: '#f3efe7',
  gold: '#b5976a', goldL: '#d4b896',
  dark: '#1a1a18', ink: '#1a1a18', ink2: '#3a3a36',
  mid: '#6a6a65', line: '#e8e3d8',
}
const FONTS = {
  serif: "'Cormorant Garamond', 'Nanum Myeongjo', serif",
  kor: "'Nanum Myeongjo', 'Noto Serif KR', serif",
  sans: "'Pretendard', -apple-system, sans-serif",
}

// 반응형 clamp 기반 토큰
// ─ 폰트/패딩/간격은 뷰포트(vw)에 비례, min/max는 가독성·디자인 보존
const SP = {
  // 섹션 좌우 패딩
  pageX: 'clamp(20px, 6vw, 48px)',
  pageY: 'clamp(40px, 9vw, 72px)',
  // Cover 안쪽 장식 여백
  coverPad: 'clamp(40px, 9vw, 80px) clamp(20px, 6vw, 48px)',
  coverBorderInset: 'clamp(40px, 9vw, 80px) clamp(20px, 6vw, 48px)',
  coverFramePad: 'clamp(14px, 3vw, 24px) clamp(14px, 3vw, 28px)',
  coverCenterPad: '0 clamp(14px, 3vw, 28px)',
  // Note / Footer
  notePad: 'clamp(48px, 12vw, 96px) clamp(20px, 6vw, 48px)',
  footerPad: 'clamp(24px, 6vw, 48px)',
  // 사진 풀폭 margin (섹션 좌우 패딩 역(逆)만큼)
  figFullMargin: '0 calc(-1 * clamp(20px, 6vw, 48px)) 24px',
}

// 모바일에서 읽기 편한 크기 기준. 최솟값(clamp 1번째)이 좁은 화면에서의 실제 크기이므로
// 본문은 15px 아래로 내려가지 않게 잡았다.
const FS = {
  // 본문·레이블
  label: 'clamp(10px, 2.6vw, 11px)',
  caption: 'clamp(13px, 3.4vw, 14px)',
  body: 'clamp(15px, 4.2vw, 17px)',
  // 강조
  noteQuote: 'clamp(17px, 4.8vw, 22px)',
  planEffect: 'clamp(16px, 4.6vw, 19px)',
  // 헤딩
  planTitle: 'clamp(19px, 5.2vw, 25px)',
  secEn: 'clamp(11px, 2.9vw, 14px)',
  secKr: 'clamp(23px, 5.8vw, 34px)',
  // 번호는 헤어라인 끝에 붙는 표식 — 제목이 주인공이다
  secNum: 'clamp(15px, 3.8vw, 19px)',
  // Cover 디스플레이 — "CONSULTATION REPORT" 19자를 한 줄로 유지해야 하므로
  // 좁은 화면(320px)에서도 넘치지 않게 크기·자간을 보수적으로 잡는다
  coverDisplay: 'clamp(15px, 4vw, 26px)',
  coverDisplayLS: 'clamp(0.1em, 0.4vw, 0.18em)',
  coverName: 'clamp(30px, 8vw, 52px)',
  coverDate: 'clamp(14px, 3.6vw, 18px)',
  // Footer
  footerBrand: 'clamp(20px, 5vw, 26px)',
}

// letterSpacing: 좁은 화면에서 와이드-spacing이 줄바꿈 유발 → 축소
const LS = {
  tightWide: 'clamp(0.18em, 0.6vw, 0.35em)',
  mediumWide: 'clamp(0.22em, 0.8vw, 0.4em)',
  looseWide: 'clamp(0.28em, 1vw, 0.5em)',
}

const S = {
  empty: { display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '400px', color: '#9ca3af', fontSize: '14px', textAlign: 'center', padding: '40px', fontFamily: FONTS.sans },
  // 본문 기본은 고딕(Pretendard) — 읽는 글은 전부 여기서 상속받는다.
  // 명조(FONTS.kor)·영문 세리프(FONTS.serif)는 표지·섹션 제목 등 디자인 요소에만 남긴다.
  // 바탕은 흰색이 아니라 따뜻한 크림 — 카드·사진만 흰색으로 떠오르게 한다
  page: { fontFamily: FONTS.sans, color: C.ink, lineHeight: 1.8, background: C.cream, WebkitFontSmoothing: 'antialiased' },

  /* COVER — 크림 바탕에 가운데 정렬. 위에서부터
     브랜드 → 마름모 헤어라인 → 큰 세리프 두 줄 → 짧은 룰 → 이름 → 안내 → 날짜 */
  cover: {
    background: C.cream,
    padding: 'clamp(60px, 15vw, 120px) clamp(22px, 7vw, 64px)',
    textAlign: 'center',
  },
  coverBrand: { fontFamily: FONTS.sans, fontWeight: 600, fontSize: FS.label, letterSpacing: LS.looseWide, textTransform: 'uppercase', color: C.ink2 },

  // 장식 — 얇은 선 + 가운데 마름모
  ornRow: { display: 'flex', alignItems: 'center', gap: 'clamp(10px, 2.5vw, 16px)', maxWidth: 420, margin: 'clamp(18px, 4vw, 28px) auto clamp(44px, 10vw, 78px)' },
  ornLine: { flex: 1, height: 1, background: 'rgba(181,151,106,0.55)' },
  ornDiamond: { flex: '0 0 auto', width: 8, height: 8, background: C.gold, transform: 'rotate(45deg)' },

  coverDisplay: {
    fontFamily: FONTS.serif, fontWeight: 400,
    fontSize: FS.coverDisplay, letterSpacing: FS.coverDisplayLS,
    textTransform: 'uppercase', color: C.ink, lineHeight: 1.3,
    whiteSpace: 'nowrap',
  },
  coverShortRule: { width: 'clamp(40px, 10vw, 72px)', height: 1, background: C.gold, margin: 'clamp(28px, 6.5vw, 48px) auto' },
  coverName: { fontFamily: FONTS.kor, fontWeight: 700, fontSize: FS.coverName, letterSpacing: '0.02em', color: C.ink, wordBreak: 'keep-all' },
  coverSub: { marginTop: 'clamp(14px, 3vw, 22px)', fontFamily: FONTS.sans, fontSize: FS.caption, letterSpacing: LS.mediumWide, color: C.mid },
  coverDate: { marginTop: 'clamp(6px, 1.5vw, 10px)', fontFamily: FONTS.serif, fontSize: FS.coverDate, letterSpacing: '0.12em', color: C.gold },

  // 공통 섹션
  // 섹션끼리는 구분선 대신 바탕색을 번갈아 써서 띠처럼 나뉘게 한다
  sec: { padding: `${SP.pageY} ${SP.pageX}` },
  secPlan: { padding: `${SP.pageY} ${SP.pageX}` },
  toneLight: { background: C.ivory },
  toneCream: { background: C.cream },

  secHead: { marginBottom: 'clamp(30px, 6vw, 52px)' },
  secHeadCenter: { maxWidth: 720, margin: '0 auto clamp(30px, 6vw, 52px)' },
  // 골드 헤어라인이 가로지르고 오른쪽 끝에 번호
  secRuleRow: { display: 'flex', alignItems: 'center', gap: 'clamp(12px, 3vw, 18px)', marginBottom: 'clamp(18px, 4vw, 30px)' },
  secRule: { flex: 1, height: 1, background: 'rgba(181,151,106,0.5)' },
  secNum: { flex: '0 0 auto', fontFamily: FONTS.serif, fontWeight: 400, fontSize: FS.secNum, lineHeight: 1, color: C.gold, letterSpacing: '0.1em' },
  // 홈페이지 .section-label 과 같은 언어 — 이탤릭 없이 골드 대문자 + 넓은 자간
  secEn: {
    fontFamily: FONTS.serif, fontWeight: 500, fontSize: FS.secEn,
    letterSpacing: LS.looseWide, textTransform: 'uppercase',
    color: C.gold, marginBottom: 'clamp(8px, 2vw, 14px)',
  },
  // 홈페이지 .section-title — 명조 굵게, 여유 있는 행간
  secKr: { fontFamily: FONTS.kor, fontWeight: 700, fontSize: FS.secKr, lineHeight: 1.45, color: C.ink, letterSpacing: '-0.01em' },

  // 사진 — 크롭 금지: 자연 비율 유지
  photos: { marginBottom: 40 },
  figFull: { margin: SP.figFullMargin },
  figSolo: { margin: '0 0 24px', textAlign: 'center' },
  figCenter: { maxWidth: 480, margin: '0 auto 24px' },
  figGrid: { margin: 0 },
  grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'clamp(8px, 2vw, 18px)', alignItems: 'start' },
  imgFull: { width: '100%', display: 'block' },
  imgSolo: { maxWidth: '100%', display: 'block', margin: '0 auto', borderRadius: 2 },
  imgPortrait: { maxWidth: '100%', display: 'block', margin: '0 auto', borderRadius: 2 },
  imgGrid: { width: '100%', display: 'block', borderRadius: 2 },
  figCap: { marginTop: 10, paddingTop: 8, borderTop: `1px solid ${C.gold}`, fontFamily: FONTS.sans, fontSize: FS.caption, lineHeight: 1.7, color: C.mid, textAlign: 'center', letterSpacing: '0.01em' },

  // 종합 소견
  summary: { maxWidth: 680, margin: '0 auto', paddingTop: 28, borderTop: `1px solid ${C.line}`, position: 'relative' },
  summaryMark: { position: 'absolute', top: -1, left: '50%', transform: 'translateX(-50%)', width: 72, height: 3, background: C.gold },
  summaryLabel: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, marginBottom: 22 },
  summaryEn: { fontFamily: FONTS.serif, fontWeight: 500, fontSize: FS.secEn, letterSpacing: LS.looseWide, color: C.gold, textTransform: 'uppercase' },
  summaryKr: { fontFamily: FONTS.kor, fontWeight: 700, fontSize: FS.body, color: C.ink, letterSpacing: '0.02em' },
  summaryDot: { width: 4, height: 4, background: C.gold, borderRadius: '50%' },

  // 치료 계획
  // 각 안을 카드로 — 어디서 끊기는지 한눈에 보이게
  planBlock: {
    maxWidth: 720, margin: '0 auto clamp(20px, 4vw, 32px)',
    padding: 'clamp(26px, 5.5vw, 44px) clamp(20px, 4.5vw, 40px)',
    background: C.paper, border: '1px solid rgba(181,151,106,0.28)',
    position: 'relative',
  },
  planBlockDivider: {},

  /* 유사 치료 사례 — 위쪽 아치, 아래는 살짝만 둥글게 */
  caseImg: {
    width: '100%', display: 'block',
    borderRadius: 'clamp(36px, 11vw, 80px) clamp(36px, 11vw, 80px) 4px 4px',
    objectFit: 'cover',
  },

  /* 유사 치료 사례 — 사진 아래 Before / After 라벨 */
  caseCap: {
    marginTop: 10, paddingTop: 8,
    borderTop: `1px solid ${C.gold}`,
    fontFamily: FONTS.sans, fontWeight: 700,
    fontSize: FS.label, letterSpacing: LS.mediumWide,
    textTransform: 'uppercase',
    color: C.gold, textAlign: 'center',
  },

  /* 유사 치료 사례 슬라이더 조작부 */
  sliderNav: {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14,
    marginTop: 14,
  },
  sliderArrow: {
    width: 32, height: 32, flex: '0 0 auto',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: 0, lineHeight: 1,
    border: `1px solid ${C.line}`, borderRadius: '50%',
    background: C.paper, color: C.ink,
    fontFamily: FONTS.serif, fontSize: 20,
    cursor: 'pointer',
  },
  sliderArrowOff: { opacity: 0.3, cursor: 'default' },
  sliderDots: { display: 'flex', alignItems: 'center', gap: 7 },
  sliderDot: {
    width: 7, height: 7, padding: 0,
    border: 'none', borderRadius: '50%',
    background: C.line, cursor: 'pointer',
    transition: 'background 0.2s',
  },
  sliderDotOn: { background: C.gold },
  sliderCount: {
    fontFamily: FONTS.sans, fontSize: 11, letterSpacing: '0.08em',
    color: C.mid, minWidth: 34, textAlign: 'center',
  },
  planTag: { display: 'flex', alignItems: 'center', gap: 'clamp(10px, 2.5vw, 16px)', marginBottom: 'clamp(16px, 3.5vw, 22px)' },
  planBadge: {
    flex: '0 0 auto',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    padding: 'clamp(7px, 1.8vw, 9px) clamp(12px, 3vw, 16px)',
    background: C.gold, color: '#fff',
    fontFamily: FONTS.sans, fontWeight: 700,
    fontSize: 'clamp(14px, 3.8vw, 16px)', letterSpacing: '0.02em', lineHeight: 1,
    borderRadius: 2,
  },
  planTagRule: { flex: 1, height: 1, background: C.line },
  planTitle: { fontFamily: FONTS.kor, fontWeight: 700, fontSize: FS.planTitle, lineHeight: 1.45, color: C.ink, letterSpacing: '-0.01em', margin: '0 0 clamp(18px, 4vw, 32px)', maxWidth: 640 },
  planMethod: { marginBottom: 24 },
  planMethodHead: { fontFamily: FONTS.sans, fontWeight: 700, fontSize: FS.caption, letterSpacing: '0.06em', color: C.gold, marginBottom: 10 },
  planMethodBody: { fontFamily: FONTS.sans, fontSize: FS.body, lineHeight: 1.85, color: C.ink2 },
  planEffect: { padding: 'clamp(16px, 4vw, 24px) clamp(18px, 4vw, 28px)', background: C.dark, color: '#fff', position: 'relative' },
  // 한글 라벨은 고딕 유지 — 세리프로 두면 명조로 폴백돼 작은 글씨가 흐려진다
  planEffectHead: { fontFamily: FONTS.sans, fontWeight: 700, fontSize: FS.caption, letterSpacing: '0.18em', color: C.gold, marginBottom: 12 },
  planEffectQuote: { fontFamily: FONTS.sans, fontWeight: 400, fontSize: FS.planEffect, lineHeight: 1.75, color: 'rgba(255,255,255,0.94)' },
  planMeta: { marginTop: 18, paddingTop: 14, borderTop: `1px solid ${C.line}`, fontFamily: FONTS.sans, fontSize: FS.caption, color: C.mid },
  planMetaKey: { fontFamily: FONTS.sans, fontStyle: 'normal', fontWeight: 500, fontSize: FS.label, letterSpacing: '0.3em', color: C.gold, textTransform: 'uppercase', marginRight: 10 },
  planFallback: { maxWidth: 720, margin: '0 auto', fontSize: FS.body, lineHeight: 2, color: C.ink2 },

  // 맞춤 안내
  note: { padding: SP.notePad, background: C.dark, color: '#fff', textAlign: 'center', position: 'relative' },
  noteTopRule: { position: 'absolute', top: 'clamp(20px, 5vw, 40px)', left: '50%', transform: 'translateX(-50%)', width: 1, height: 'clamp(36px, 8vw, 64px)', background: `linear-gradient(to bottom, transparent, ${C.gold})` },
  // 한글이 섞여 있어 고딕 유지 (세리프면 한글만 명조로 폴백돼 어색해진다)
  noteLabel: { fontFamily: FONTS.sans, fontWeight: 500, fontSize: FS.caption, letterSpacing: LS.mediumWide, color: C.gold, marginBottom: 'clamp(20px, 5vw, 36px)' },
  noteQuote: { fontFamily: FONTS.sans, fontWeight: 400, fontSize: FS.noteQuote, lineHeight: 1.85, color: 'rgba(255,255,255,0.94)', maxWidth: 640, margin: '0 auto 24px', whiteSpace: 'pre-wrap' },
  noteSign: { fontFamily: FONTS.serif, fontStyle: 'italic', fontSize: FS.caption, color: C.goldL },

  // 푸터
  footer: { padding: SP.footerPad, background: '#0e0e0c', color: '#fff', textAlign: 'center' },
  footerBrand: { fontFamily: FONTS.serif, fontSize: FS.footerBrand, letterSpacing: '0.1em', marginBottom: 4 },
  footerTag: { fontFamily: FONTS.serif, fontWeight: 500, fontSize: FS.secEn, letterSpacing: LS.looseWide, color: C.gold, textTransform: 'uppercase', marginBottom: 20 },
  footerInfo: { fontFamily: FONTS.sans, fontSize: FS.caption, lineHeight: 1.9, color: 'rgba(255,255,255,0.5)', marginBottom: 20 },
  // 버튼 3개가 한 줄에 균등하게. 폭이 모자라면 2개 → 1개로 자동으로 접힌다.
  cta: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(96px, 1fr))', gap: 8, maxWidth: 460, margin: '0 auto 20px' },
  ctaBtn: {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: '12px 8px', textAlign: 'center',
    fontFamily: FONTS.sans, fontSize: FS.caption, fontWeight: 700, lineHeight: 1.35,
    borderRadius: 2, textDecoration: 'none',
  },
  copy: { fontFamily: FONTS.serif, fontStyle: 'italic', fontSize: FS.caption, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.15em' },
}
