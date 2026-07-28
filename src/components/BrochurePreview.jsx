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

/**
 * 화면에 보일 섹션 이름. AI 가 쓴 <h2> 제목을 그대로 두면 내부 로직(파싱·분기)이
 * 다 깨지므로, 저장된 이름은 두고 표시할 때만 바꾼다.
 */
const KR_LABEL = {
  '종합 안내': '종합 소견',
}

const EN_LABEL = {
  // 새 4섹션 구조
  '구외 소견': 'Extra-oral Findings',
  '구내 소견': 'Intra-oral Findings',
  '치료 계획': 'Treatment Plan',
  '종합 안내': 'Overall Assessment',
  '종합 소견': 'Overall Assessment',
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
    const krLabel = KR_LABEL[sec.title] || sec.title
    const tone = toneOf(globalNum)
    if (sec.title === '치료 계획') {
      return <TreatmentSection key={`t-${globalNum}`} num={num} en={en} kr={krLabel} summaryHtml={sec.summaryHtml} v={v} />
    }
    return (
      <DiagnosticSection
        key={`s-${globalNum}`} num={num} en={en} kr={krLabel} sectionKey={sec.title}
        figures={sec.figures} summaryHtml={sec.summaryHtml} v={v} tone={tone}
        design={design} onUpdateCaption={onUpdateCaption} onOpenMarker={onOpenMarker}
      />
    )
  }

  let n = 0
  const blocks = []
  for (const sec of secBefore) { n++; blocks.push(renderSection(sec, n)) }
  if (hasCases)     { n++; blocks.push(<CasesSection    key={`cases-${n}`}     num={String(n).padStart(2, '0')} cases={cases} tone={toneOf(n)} />) }
  if (hasStrengths) { n++; blocks.push(<StrengthsSection key={`strengths-${n}`} num={String(n).padStart(2, '0')} strengths={strengths} />) }
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
  // AI 가 마지막 섹션을 "종합 안내" 로도 "종합 소견" 으로도 쓴다.
  // 한 진단서 안에 둘 다 나오면(글은 안내에, 사진은 소견에) 섹션이 06·07 로 갈라지고
  // 화면에는 같은 이름이 두 번 찍힌다. 하나로 합쳐 둔다.
  '종합 소견': '종합 안내',
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
      <div style={S.coverSub}>교정 상담 결과서</div>
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

/**
 * 구간별 소견 표시 방식.
 * 섹션마다 따로 디자인하기 위한 스위치 — 섹션명을 여기에 추가하면 그 구간만 바뀐다.
 *   'cards' : 소제목 + 설명 카드 목록
 *   (없음)  : 리드 문장 + 화살표 항목
 */
const SUMMARY_VARIANT = {
  '구내 소견': 'cards',
}

/**
 * 소견 아래에 가로형 사진 한 장이 들어가는 구간.
 * AI 가 이 섹션 제목을 "종합 안내" 로도 "종합 소견" 으로도 쓰기 때문에 둘 다 등록한다.
 * 하나라도 빠지면 사진이 일반 배치로 흘러가 좌우 분할(사진 45%)로 붙는다.
 */
const WIDE_PHOTO_SECTION = {
  '종합 안내': true,
  '종합 소견': true,
}

/**
 * 가로형 사진 자리.
 * 사진이 들어오면 16:9 로 꽉 차게 보여주고,
 * 아직 없으면 편집 화면에서만 자리 틀을 보여 준다 — 환자 화면에는 빈 칸이 뜨지 않는다.
 */
function WidePhotoSlot({ figures = [], design, onUpdateCaption, onOpenMarker }) {
  const usable = figures.filter(f => f?.src)
  if (usable.length > 0) {
    // 여러 장이 붙어 있어도 하나도 버리지 않는다
    return (
      <>
        {usable.map((f, i) => (
          <figure key={i} style={S.wideFig}>
            <MarkedImage f={f} imgStyle={S.wideImg} design={design} onOpenMarker={onOpenMarker} />
            <EditableCaption caption={f.caption} src={f.src} design={design} onUpdateCaption={onUpdateCaption} full />
          </figure>
        ))}
      </>
    )
  }
  if (!design) return null
  return (
    <div style={S.widePlaceholder}>
      <span style={S.widePlaceholderText}>가로형 사진 자리 (16:9)</span>
    </div>
  )
}

function DiagnosticSection({ num, en, kr, sectionKey, figures, summaryHtml, v, design, onUpdateCaption, onOpenMarker, tone }) {
  const variant = SUMMARY_VARIANT[kr]
  const wantsWidePhoto = !!WIDE_PHOTO_SECTION[sectionKey || kr]
  const hasFigs = figures.length > 0
  const hasSummary = !!summaryHtml && summaryHtml.replace(/<[^>]+>/g, '').trim().length > 0
  if (!hasFigs && !hasSummary) return null

  // 타입별 그룹핑
  const panoramas = figures.filter(f => f.phototype === 'panorama')
  const intraorals = figures.filter(f => !f.phototype || f.phototype === 'intraoral')
  const others = figures.filter(f => ['cephalogram', 'face', 'other'].includes(f.phototype))

  // 구내 그룹이 텍스트를 소비하는지
  const intraoralConsumesText = intraorals.length > 0 && hasSummary

  // 가로형 사진 구간 — 소견 아래에 사진 한 장이 통으로 들어간다
  if (wantsWidePhoto) {
    return (
      <div style={{ ...S.sec, ...toneStyle(tone) }}>
        <SecHead num={num} en={en} kr={kr} />
        {hasSummary && <Summary html={summaryHtml} variant={variant} heading={kr} />}
        <WidePhotoSlot figures={figures} design={design} onUpdateCaption={onUpdateCaption} onOpenMarker={onOpenMarker} />
      </div>
    )
  }

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
      <IntraoralGroup figures={intraorals} summaryHtml={summaryHtml} design={design} onUpdateCaption={onUpdateCaption} onOpenMarker={onOpenMarker} variant={variant} heading={kr} />

      {/* 구내가 텍스트를 소비 안 했고 텍스트만 남아있으면 단독 렌더 */}
      {!intraoralConsumesText && hasSummary && <Summary html={summaryHtml} variant={variant} heading={kr} />}
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
function IntraoralGroup({ figures, summaryHtml, design, onUpdateCaption, onOpenMarker, variant, heading }) {
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
        <div className="v4-split-text"><Summary html={summaryHtml} inSplit variant={variant} heading={heading} /></div>
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
        {hasSummary && <Summary html={summaryHtml} variant={variant} heading={heading} />}
      </>
    )
  }

  // 3장 + 텍스트 → [1][2] / [3][텍스트]
  if (count === 3 && hasSummary) {
    return (
      <div className="v4-grid3">
        {figures.map(img)}
        <div className="v4-grid3-text"><Summary html={summaryHtml} inSplit variant={variant} heading={heading} /></div>
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
      {hasSummary && <Summary html={summaryHtml} variant={variant} heading={heading} />}
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
            <div style={S.caseDesc}>{c.description}</div>
          )}

          {/* 카드 안, 슬라이더 아래 — 홈페이지 치료 전후 갤러리로 */}
          <a href={LINKS.cases} target="_blank" rel="noopener noreferrer" style={S.moreBanner}>
            <span>더 많은 치료 사례 보기</span>
            <span style={S.moreArrow} aria-hidden="true">&rarr;</span>
          </a>
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

// 이 구간도 바탕색 교차(tone)를 쓰지 않고 항상 어두운 판이다
function StrengthsSection({ num, strengths }) {
  if (!strengths?.length) return null
  return (
    <div style={{ ...S.sec, ...S.secDark }}>
      <SecHead num={num} en="Why Choose Us" kr="프라임에스가 특별한 이유" dark />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 24, maxWidth: 720, margin: '0 auto' }}>
        {strengths.map((s, i) => (
          <StrengthCard key={s.id || i} card={s} />
        ))}
      </div>
    </div>
  )
}

/** 강조 장점 — 레퍼런스처럼 아치형 사진 + 얇은 구분선 + 알약 버튼 */
function StrengthCard({ card }) {
  return (
    <div style={S.strCard}>
      {card.photo_url && (
        <img src={card.photo_url} alt={card.title || ''} style={S.strImg} />
      )}
      <div style={{ minWidth: 0 }}>
        {card.title && <div style={S.strTitle}>{card.title}</div>}
        {card.description && <div style={S.strDesc}>{card.description}</div>}
        {card.detail_url && (
          <a href={card.detail_url} target="_blank" rel="noreferrer" style={S.strLink}>
            자세히 보기 &rarr;
          </a>
        )}
      </div>
    </div>
  )
}

/** 이 길이를 넘는 계획 제목만 두 줄로 끊는다 */
const PLAN_TITLE_WRAP_MIN = 26

/**
 * 긴 계획 제목을 뜻이 끊기지 않는 자리에서 두 줄로 나눈다.
 * 그냥 흘려 쓰면 화면 폭에 따라 아무 데서나 줄이 바뀐다.
 *
 * 끊는 자리 후보: 쉼표 / 연결어미(하여·하고·하면서·후) / 관형형(통한·위한·이용한) / + 기호
 * 후보가 여럿이면 가운데에 가장 가까운 곳을 골라 두 줄 길이를 비슷하게 맞춘다.
 *   "…작은어금니를 포함하여 / 위아래 좌우 …전체 교정"
 * 후보가 없으면 한 줄로 두고 브라우저가 알아서 흘리게 한다.
 */
function splitPlanTitle(title) {
  const t = String(title || '').trim()
  if (t.length <= PLAN_TITLE_WRAP_MIN) return [t]
  const boundary = /(,\s+|\s\+\s|(?:하여|하고|하면서|면서|이용한|통한|위한|후)\s+)/g
  const cands = []
  let m
  while ((m = boundary.exec(t)) !== null) {
    const end = m.index + m[0].length
    if (end > 2 && end < t.length - 2) cands.push(end)
  }
  if (cands.length === 0) return [t]
  const mid = t.length / 2
  const best = cands.reduce((a, b) => (Math.abs(b - mid) < Math.abs(a - mid) ? b : a))
  return [t.slice(0, best).trim(), t.slice(best).trim()]
}

// 치료 계획 구간은 바탕색 교차(tone)를 쓰지 않고 항상 어두운 판이다
function TreatmentSection({ num, en, kr, summaryHtml, v }) {
  const plans = parseTreatmentPlans(summaryHtml)
  const hasParsed = plans.length > 0
  return (
    <div style={{ ...S.secPlan, ...S.secDark }}>
      <SecHead num={num} en={en} kr={kr} center dark />
      {hasParsed
        ? <div style={S.planList}>
            {plans.map((p, i) => (
              <PlanBlock key={i} idx={i} plan={p} isLast={i === plans.length - 1} />
            ))}
          </div>
        : summaryHtml && (
          <div style={S.planFallback}>
            <div dangerouslySetInnerHTML={{ __html: summaryHtml }} />
          </div>
        )}
    </div>
  )
}

/**
 * 계획 한 건 — 레퍼런스(인테리어 프로세스)의 타임라인 배치.
 * 왼쪽에 큰 가는 번호와 세로 연결선, 오른쪽에 내용.
 */
function PlanBlock({ idx, plan, isLast }) {
  return (
    <div style={S.planRow}>
      <div style={S.planRail}>
        {!isLast && <span style={S.planRailLine} />}
      </div>

      <div style={S.planBody}>
        {/* 참고 화면처럼 배지를 맨 위에 — 기간이 있으면 배지에 함께 담는다 */}
        <div style={S.planBadgeRow}>
          <span style={S.planBadge}>{idx + 1}안</span>
          {plan.duration && <span style={S.planBadge}>교정치료 기간 : {plan.duration}</span>}
        </div>

        {plan.title && (
          <h3 style={S.planName}>
            {splitPlanTitle(plan.title).map((line, i) => (
              <span key={i} style={{ display: 'block' }}>{line}</span>
            ))}
          </h3>
        )}

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
      </div>
    </div>
  )
}

/**
 * 섹션 머리말 — 홈페이지의 label + title 적층 방식.
 * 위에 골드 헤어라인이 가로지르고 오른쪽 끝에 번호가 붙는다.
 * 그 아래 영문 라벨, 그 아래 큰 한글 제목 — 제목이 시선의 주인공.
 */
function SecHead({ num, en, kr, center, dark }) {
  return (
    <div style={{ ...S.secHead, ...(center ? S.secHeadCenter : {}) }}>
      <div style={S.secHeadRow}>
        <span style={S.secNum}>{num}</span>
        <div style={{ minWidth: 0 }}>
          {en && <div style={S.secEn}>{en}</div>}
          <div style={dark ? { ...S.secKr, color: C.paper } : S.secKr}>{kr}</div>
        </div>
      </div>
      <div style={dark ? { ...S.secUnderRule, background: 'rgba(181,151,106,0.45)' } : S.secUnderRule} />
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

/**
 * 소견 본문을 [첫 문장 = 리드] + [나머지 = → 항목]으로 나눈다.
 *
 * AI 가 한 <p> 안에 3~4문장을 붙여 주기 때문에 그대로 두면 긴 덩어리로 읽힌다.
 * 문장 단위로 끊어 리드 한 줄과 화살표 목록으로 정리한다.
 * 마침표 뒤 공백 기준이라 "1.5mm" 같은 소수점은 쪼개지지 않는다.
 */
function splitSummary(html) {
  if (!html) return { lead: '', points: [] }
  let text = ''
  try {
    const doc = new DOMParser().parseFromString(`<div id="r">${html}</div>`, 'text/html')
    // 문단 사이는 공백으로 이어 붙여 문장 단위로만 나뉘게 한다
    text = (doc.getElementById('r')?.textContent || '').replace(/\s+/g, ' ').trim()
  } catch {
    text = String(html).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  }
  if (!text) return { lead: '', points: [] }
  const sentences = text
    .replace(/([.!?])\s+/g, '$1\n')
    .split('\n')
    .map(s => s.trim())
    .filter(Boolean)
  return { lead: sentences[0] || '', points: sentences.slice(1) }
}


/**
 * 소견 문장을 주제별로 나누는 기준.
 * 화면에 나오는 순서도 이 순서를 따른다. 단어를 추가·수정하면 분류가 바로 바뀐다.
 */
const SUMMARY_TOPICS = [
  { key: '앞니', kw: ['앞니', '전치', '송곳니', '견치', '정중선'] },
  { key: '교합', kw: ['교합', '맞물림', '맞물려', '물림', '피개', '오버젯', 'Class'] },
  { key: '어금니', kw: ['어금니', '구치', '사랑니', '임플란트'] },
  { key: '잇몸·치아 상태', kw: ['잇몸', '치주', '충치', '우식', '치근', '신경치료', '병소'] },
]

/**
 * 문장 하나가 어느 주제인지 고른다.
 * 키워드가 "몇 번" 나오는지로 판단한다 — 위치로만 보면
 * "어금니의 맞물림은 Class I …" 이 맨 앞 단어 때문에 어금니로 잘못 묶인다.
 * 개수가 같으면 먼저 나온 쪽을 택한다.
 */
function topicOf(sentence) {
  let best = '기타', bestCount = 0, bestPos = Infinity
  for (const t of SUMMARY_TOPICS) {
    let count = 0, pos = Infinity
    for (const k of t.kw) {
      let i = sentence.indexOf(k)
      if (i >= 0 && i < pos) pos = i
      while (i >= 0) { count++; i = sentence.indexOf(k, i + k.length) }
    }
    if (count > bestCount || (count === bestCount && count > 0 && pos < bestPos)) {
      best = t.key; bestCount = count; bestPos = pos
    }
  }
  return best
}

/**
 * 문장들을 주제별 카드로 묶는다 (앞니 / 교합 / 어금니 …).
 * 문장은 자르지 않고 그대로 넣는다 — 주어를 떼면 말이 끊겨 보이고 내용도 흐려진다.
 */
function buildSummaryCards(sentences) {
  const groups = new Map()
  for (const s of sentences) {
    const key = topicOf(s)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(s)
  }
  const order = [...SUMMARY_TOPICS.map(t => t.key), '기타']
  return order
    .filter(k => groups.has(k))
    .map(k => ({ title: k, lines: groups.get(k) }))
}

function Summary({ html, inSplit, variant, heading }) {
  const { lead, points } = splitSummary(html)
  if (!lead && points.length === 0) return null
  const wrapStyle = inSplit ? { ...S.summary, maxWidth: '100%', paddingTop: 12, marginTop: 0 } : S.summary

  // 구간별 디자인 — 카드형 (소제목 + 설명)
  if (variant === 'cards') {
    const cards = buildSummaryCards([lead, ...points].filter(Boolean))
    return (
      <div style={wrapStyle}>
        {heading && <div style={S.cardHead}>{heading}</div>}
        <div style={S.cardList}>
          {cards.map((c, i) => (
            <div key={i} style={S.card}>
              {c.title && <div style={S.cardTitle}>{c.title}</div>}
              {c.lines.map((line, j) => (
                <div key={j} style={{ ...S.cardDesc, marginTop: j === 0 ? 0 : 'clamp(8px, 2vw, 12px)' }}>{line}</div>
              ))}
            </div>
          ))}
        </div>
      </div>
    )
  }

  // 섹션 머리말에 이미 제목이 있어 "Summary / 종합 소견" 라벨은 중복 — 표시하지 않는다
  return (
    <div style={wrapStyle}>
      {lead && <p style={inSplit ? { ...S.sumLead, fontSize: FS.body } : S.sumLead}>{lead}</p>}

      {points.length > 0 && (
        <ul style={S.sumList}>
          {points.map((p, i) => (
            <li key={i} style={S.sumItem}>
              <span style={S.sumArrow} aria-hidden="true">&rarr;</span>
              <span>{p}</span>
            </li>
          ))}
        </ul>
      )}
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
  // 마지막 문단은 맺음말이라 강조 박스로 뺀다 (참고 화면의 세로선 박스)
  const paras = shown.split(/\n{2,}/).map(s => s.trim()).filter(Boolean)
  const body = paras.length > 1 ? paras.slice(0, -1) : paras
  const highlight = paras.length > 1 ? paras[paras.length - 1] : ''

  return (
    <div style={S.note}>
      <div style={S.noteTopRule} />
      <div style={S.noteLabel}>A Personal Note · 드리는 말씀</div>

      {design ? (
        // 편집 모드는 원문 그대로 — 쪼개면 저장 시 문장이 도로 붙는다
        <div
          style={{ ...S.noteQuote, outline: 'none', minHeight: '1em', cursor: 'text' }}
          contentEditable
          suppressContentEditableWarning
          onBlur={(e) => onUpdateNote?.(e.currentTarget.textContent.trim())}
          data-placeholder="맞춤 메시지 입력..."
        >{shown}</div>
      ) : (
        <>
          {body.map((p, i) => (
            <p key={i} style={S.noteQuote}>{p}</p>
          ))}
          {highlight && (
            <div style={S.noteHighlight}>{highlight}</div>
          )}
        </>
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
  // 홈페이지 치료 전후 갤러리 (유사 치료 사례 "더 많은 사례 보기")
  cases: 'http://primes.co.kr/on/index/before_after/before_after.html',
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
  // 소제목용 브라운 — 골드보다 진해 밝은 바탕에서 또렷하게 읽힌다
  brown: '#7a5c38',
  // 케이스 제목용 진한 브라운 (크림 바탕 대비 7.7:1)
  brownDeep: '#5f4527',
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
  // 레퍼런스의 큰 가는 번호 — 폰에서는 제목을 누르지 않을 정도로
  secNum: 'clamp(30px, 7.5vw, 52px)',
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
    // 위아래 여백 축소 (기존 60~120px)
    padding: 'clamp(38px, 8.5vw, 68px) clamp(22px, 7vw, 64px)',
    textAlign: 'center',
  },
  coverBrand: { fontFamily: FONTS.sans, fontWeight: 600, fontSize: FS.label, letterSpacing: LS.looseWide, textTransform: 'uppercase', color: C.ink2 },

  // 장식 — 얇은 선 + 가운데 마름모
  ornRow: { display: 'flex', alignItems: 'center', gap: 'clamp(10px, 2.5vw, 16px)', maxWidth: 420, margin: 'clamp(14px, 3vw, 20px) auto clamp(28px, 6vw, 46px)' },
  ornLine: { flex: 1, height: 1, background: 'rgba(181,151,106,0.55)' },
  ornDiamond: { flex: '0 0 auto', width: 8, height: 8, background: C.gold, transform: 'rotate(45deg)' },

  coverDisplay: {
    fontFamily: FONTS.serif, fontWeight: 400,
    fontSize: FS.coverDisplay, letterSpacing: FS.coverDisplayLS,
    textTransform: 'uppercase', color: C.ink, lineHeight: 1.3,
    whiteSpace: 'nowrap',
  },
  coverShortRule: { width: 'clamp(40px, 10vw, 72px)', height: 1, background: C.gold, margin: 'clamp(20px, 4.5vw, 32px) auto' },
  coverName: { fontFamily: FONTS.kor, fontWeight: 700, fontSize: FS.coverName, letterSpacing: '0.02em', color: C.ink, wordBreak: 'keep-all' },
  coverSub: { marginTop: 'clamp(14px, 3vw, 22px)', fontFamily: FONTS.sans, fontSize: FS.caption, letterSpacing: LS.mediumWide, color: C.mid },
  coverDate: { marginTop: 'clamp(6px, 1.5vw, 10px)', fontFamily: FONTS.serif, fontSize: FS.coverDate, letterSpacing: '0.12em', color: C.gold },

  // 공통 섹션
  // 섹션끼리는 구분선 대신 바탕색을 번갈아 써서 띠처럼 나뉘게 한다
  sec: { padding: `${SP.pageY} ${SP.pageX}` },
  secPlan: { padding: `${SP.pageY} ${SP.pageX}` },
  toneLight: { background: C.ivory },
  toneCream: { background: C.cream },

  // 레퍼런스(인테리어 프로세스)처럼 큰 가는 번호가 제목 왼쪽에 서고, 아래에 헤어라인
  secHead: { marginBottom: 'clamp(30px, 6vw, 52px)' },
  secHeadCenter: { maxWidth: 720, margin: '0 auto clamp(30px, 6vw, 52px)' },
  secHeadRow: { display: 'flex', alignItems: 'baseline', gap: 'clamp(14px, 3.5vw, 26px)' },
  secNum: { flex: '0 0 auto', fontFamily: FONTS.serif, fontWeight: 300, fontSize: FS.secNum, lineHeight: 1, color: C.gold, letterSpacing: '0.02em' },
  secUnderRule: { height: 1, background: 'rgba(181,151,106,0.4)', marginTop: 'clamp(18px, 4vw, 28px)' },
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

  /* 소견 본문 — 리드 한 줄 + 화살표 항목 (참고 스크린샷 구조) */
  sumLead: {
    fontFamily: FONTS.sans, fontWeight: 500,
    fontSize: 'clamp(16px, 4.4vw, 19px)', lineHeight: 1.75,
    color: C.ink, margin: '0 0 clamp(20px, 4.5vw, 30px)',
    wordBreak: 'keep-all',
  },
  sumList: { listStyle: 'none', margin: 0, padding: 0 },
  sumItem: {
    display: 'flex', gap: 'clamp(10px, 2.6vw, 14px)', alignItems: 'flex-start',
    padding: 'clamp(12px, 3vw, 16px) 0',
    borderTop: '1px solid rgba(181,151,106,0.22)',
    fontSize: FS.body, lineHeight: 1.75, color: C.ink2,
    wordBreak: 'keep-all',
  },
  sumArrow: { flex: '0 0 auto', color: C.gold, fontWeight: 400, lineHeight: 1.75 },

  /* 카드형 소견 — 상단 머리띠 + [소제목 / 설명] 카드 목록 */
  cardHead: {
    padding: 'clamp(12px, 3vw, 16px)',
    background: 'rgba(181,151,106,0.16)',
    textAlign: 'center',
    fontFamily: FONTS.kor, fontWeight: 700,
    fontSize: 'clamp(15px, 4vw, 18px)', color: C.ink,
    marginBottom: 'clamp(10px, 2.4vw, 14px)',
  },
  cardList: { display: 'flex', flexDirection: 'column', gap: 'clamp(10px, 2.4vw, 14px)' },
  card: { background: C.paper, padding: 'clamp(16px, 4vw, 22px) clamp(16px, 4vw, 24px)' },
  // 소제목 — 브라운톤 굵은 고딕
  cardTitle: { fontFamily: FONTS.sans, fontWeight: 700, fontSize: 'clamp(15px, 4vw, 17px)', color: C.brown, letterSpacing: '-0.01em', marginBottom: 'clamp(6px, 1.6vw, 9px)' },
  cardDesc: { fontSize: FS.body, lineHeight: 1.8, color: C.mid, wordBreak: 'keep-all' },
  summaryDot: { width: 4, height: 4, background: C.gold, borderRadius: '50%' },

  // 치료 계획
  // 계획 목록 — 레퍼런스의 타임라인. 왼쪽 레일(번호+세로선) + 오른쪽 내용
  planList: { maxWidth: 720, margin: '0 auto' },
  planRow: { display: 'flex', gap: 'clamp(14px, 3.5vw, 26px)', alignItems: 'stretch' },
  // 번호를 뺀 뒤로는 계획을 잇는 세로선만 남으므로 레일을 좁게 — 본문 폭 확보
  planRail: { flex: '0 0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center', width: 'clamp(10px, 2.5vw, 16px)' },
  planRailLine: { flex: 1, width: 1, background: 'rgba(255,255,255,0.14)', marginTop: 'clamp(10px, 2.5vw, 16px)' },
  planBody: { flex: 1, minWidth: 0, paddingBottom: 'clamp(34px, 8vw, 60px)' },

  // 쓰지 않지만 남겨 둠 (유사 사례 카드가 참조)
  planBlock: {
    maxWidth: 720, margin: '0 auto clamp(20px, 4vw, 32px)',
    padding: 'clamp(26px, 5.5vw, 44px) clamp(20px, 4.5vw, 40px)',
    background: C.paper, border: '1px solid rgba(181,151,106,0.28)',
    position: 'relative',
  },
  planBlockDivider: {},

  /* 강조 장점 카드 */
  // 사진 : 문구 = 5 : 5, 사진은 정사각형
  strCard: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'clamp(16px, 4vw, 26px)', alignItems: 'start', paddingTop: 'clamp(22px, 5vw, 32px)', borderTop: '1px solid rgba(181,151,106,0.3)' },
  strImg: { width: '100%', aspectRatio: '1/1', objectFit: 'cover', borderRadius: 'clamp(24px, 7vw, 48px) clamp(24px, 7vw, 48px) 4px 4px' },
  // 어두운 판이라 밝은 글씨 — 제목은 베이지, 본문은 연한 흰색
  strTitle: { fontFamily: FONTS.sans, fontWeight: 700, fontSize: 'clamp(16px, 4.2vw, 19px)', color: C.goldL, lineHeight: 1.45, marginBottom: 10, wordBreak: 'keep-all' },
  strDesc: { fontSize: FS.body, lineHeight: 1.8, color: 'rgba(255,255,255,0.66)', whiteSpace: 'pre-wrap', marginBottom: 14, wordBreak: 'keep-all' },
  strLink: {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    padding: 'clamp(8px, 2vw, 11px) clamp(16px, 4vw, 24px)',
    border: `1px solid rgba(181,151,106,0.55)`, borderRadius: 999,
    fontFamily: FONTS.sans, fontSize: 'clamp(12px, 3.2vw, 13px)', fontWeight: 600,
    letterSpacing: '0.1em', color: C.goldL, textDecoration: 'none', background: 'transparent',
  },

  /* 유사 치료 사례 설명 — 밝은 바탕이므로 어두운 글씨.
     치료 계획(planMethodBody)은 어두운 판이라 흰 글씨여서 같이 쓸 수 없다 */
  caseDesc: { fontFamily: FONTS.sans, fontSize: FS.body, lineHeight: 1.85, color: C.ink2, maxWidth: 640, margin: '0 auto', whiteSpace: 'pre-wrap' },

  /* 가로형 사진 자리 — 종합 소견 아래 */
  wideFig: { maxWidth: 720, margin: 'clamp(28px, 6vw, 44px) auto 0' },
  wideImg: { width: '100%', aspectRatio: '16 / 9', objectFit: 'cover', display: 'block', borderRadius: 2 },
  widePlaceholder: {
    maxWidth: 720, margin: 'clamp(28px, 6vw, 44px) auto 0',
    aspectRatio: '16 / 9',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    border: `1px dashed ${C.gold}`, borderRadius: 2,
    background: 'rgba(181,151,106,0.06)',
  },
  widePlaceholderText: {
    fontFamily: FONTS.sans, fontSize: FS.caption, letterSpacing: '0.08em', color: C.gold,
  },

  /* "더 많은 치료 사례 보기" 배너 — 케이스 카드 안, 브라운 바탕 (흰 글씨 대비 8.87:1) */
  moreBanner: {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    gap: 'clamp(8px, 2vw, 12px)',
    maxWidth: 640, margin: 'clamp(20px, 4.5vw, 30px) auto 0',
    padding: 'clamp(14px, 3.4vw, 18px) clamp(18px, 4vw, 28px)',
    background: C.brownDeep, borderRadius: 2,
    fontFamily: FONTS.sans, fontWeight: 600,
    fontSize: 'clamp(14px, 3.6vw, 16px)', letterSpacing: '0.02em',
    color: '#ffffff', textDecoration: 'none',
  },
  moreArrow: { color: C.goldL, fontWeight: 400 },

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
  // 참고 화면의 배지 — 어두운 바탕에 얇은 골드 테두리, 각진 모서리
  planBadgeRow: { display: 'flex', flexWrap: 'wrap', gap: 'clamp(8px, 2vw, 12px)', marginBottom: 'clamp(18px, 4vw, 26px)' },
  planBadge: {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    padding: 'clamp(8px, 2vw, 11px) clamp(14px, 3.6vw, 20px)',
    background: 'transparent', color: C.goldL,
    border: `1px solid rgba(181,151,106,0.55)`, borderRadius: 3,
    fontFamily: FONTS.sans, fontWeight: 500,
    fontSize: 'clamp(13px, 3.4vw, 15px)', letterSpacing: '0.02em', lineHeight: 1,
  },
  // 유사 치료 사례 제목 — 가운데 정렬, 굵은 고딕 + 진한 브라운
  // (치료 계획 제목은 planName 을 따로 쓴다)
  planTitle: { fontFamily: FONTS.sans, fontWeight: 700, fontSize: FS.planTitle, lineHeight: 1.45, color: C.brownDeep, letterSpacing: '-0.01em', margin: '0 auto clamp(18px, 4vw, 32px)', maxWidth: 640, textAlign: 'center' },
  // 치료 계획 구간은 어두운 판 (참고 화면)
  secDark: { background: '#1c1a18' },
  // 1안·2안 소제목 — 밝은 베이지 (검은 판 대비 9.17:1)
  planName: { fontFamily: FONTS.sans, fontWeight: 700, fontSize: 'clamp(18px, 4.8vw, 22px)', lineHeight: 1.55, color: C.goldL, letterSpacing: '-0.01em', margin: '0 0 clamp(14px, 3.2vw, 20px)', maxWidth: 640, wordBreak: 'keep-all' },
  planMethod: { marginBottom: 24 },
  // 어두운 판 위 라벨 — 기대 효과 라벨과 같은 처리
  planMethodHead: { fontFamily: FONTS.sans, fontWeight: 500, fontSize: FS.caption, letterSpacing: '0.28em', color: C.gold, marginBottom: 'clamp(10px, 2.4vw, 14px)' },
  planMethodBody: { fontFamily: FONTS.sans, fontSize: FS.body, lineHeight: 1.9, color: 'rgba(255,255,255,0.62)' },
  // 어두운 판 위에서는 배경 대신 얇은 구분선으로 나눈다 (참고 화면)
  planEffect: { marginTop: 'clamp(22px, 5vw, 32px)', paddingTop: 'clamp(20px, 4.5vw, 28px)', borderTop: '1px solid rgba(255,255,255,0.12)' },
  // 한글 라벨은 고딕 유지 — 세리프로 두면 명조로 폴백돼 작은 글씨가 흐려진다
  planEffectHead: { fontFamily: FONTS.sans, fontWeight: 500, fontSize: FS.caption, letterSpacing: '0.28em', color: C.gold, marginBottom: 'clamp(12px, 3vw, 18px)' },
  planEffectQuote: { fontFamily: FONTS.serif, fontStyle: 'italic', fontWeight: 400, fontSize: FS.planEffect, lineHeight: 1.8, color: C.goldL },
  planMeta: { marginTop: 18, paddingTop: 14, borderTop: `1px solid ${C.line}`, fontFamily: FONTS.sans, fontSize: FS.caption, color: C.mid },
  planMetaKey: { fontFamily: FONTS.sans, fontStyle: 'normal', fontWeight: 500, fontSize: FS.label, letterSpacing: '0.3em', color: C.gold, textTransform: 'uppercase', marginRight: 10 },
  // 계획 파싱 실패 시 원문 그대로 나오는 자리 — 어두운 판이라 밝은 글씨여야 한다
  planFallback: { maxWidth: 720, margin: '0 auto', fontSize: FS.body, lineHeight: 2, color: 'rgba(255,255,255,0.72)' },

  // 맞춤 안내
  // 검은 판에 연한 본문, 맺음말은 베이지 강조 박스. 전체 가운데 정렬.
  note: { padding: SP.notePad, background: '#1c1a18', color: C.paper, textAlign: 'center', position: 'relative' },
  noteHighlight: {
    maxWidth: 640, margin: 'clamp(22px, 5vw, 32px) auto 0',
    padding: 'clamp(16px, 3.6vw, 22px) clamp(18px, 4vw, 26px)',
    background: 'rgba(255,255,255,0.05)',
    // 가운데 정렬이라 한쪽 선 대신 위아래 골드 선으로 감싼다
    borderTop: `1px solid ${C.gold}`, borderBottom: `1px solid ${C.gold}`,
    fontFamily: FONTS.sans, fontWeight: 700,
    fontSize: FS.body, lineHeight: 1.75,
    color: C.goldL, wordBreak: 'keep-all',
  },
  noteTopRule: { position: 'absolute', top: 'clamp(20px, 5vw, 40px)', left: '50%', transform: 'translateX(-50%)', width: 1, height: 'clamp(36px, 8vw, 64px)', background: `linear-gradient(to bottom, transparent, ${C.gold})` },
  // 한글이 섞여 있어 고딕 유지 (세리프면 한글만 명조로 폴백돼 어색해진다)
  noteLabel: { fontFamily: FONTS.sans, fontWeight: 500, fontSize: FS.caption, letterSpacing: LS.mediumWide, color: C.gold, maxWidth: 640, margin: '0 auto clamp(20px, 5vw, 36px)' },
  // 글자가 너무 커서 본문 크기로 낮춤 (기존 17~22px → 15~17px)
  noteQuote: { fontFamily: FONTS.sans, fontWeight: 400, fontSize: FS.body, lineHeight: 1.9, color: 'rgba(255,255,255,0.68)', maxWidth: 640, margin: '0 auto clamp(14px, 3vw, 20px)', whiteSpace: 'pre-wrap', wordBreak: 'keep-all' },
  noteSign: { fontFamily: FONTS.serif, fontStyle: 'italic', fontSize: FS.caption, color: C.gold, maxWidth: 640, margin: 'clamp(22px, 5vw, 32px) auto 0' },

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
