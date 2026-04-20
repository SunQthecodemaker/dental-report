/**
 * BrochurePreview — v4 하이브리드 (위→아래 구조)
 * - 섹션 상단: 사진 + 개별 짧은 설명 (figcaption)
 * - 섹션 하단: 종합 소견 (드롭캡 풀어 서술)
 * - 치료 계획: 각 계획 독립 블록 (목표 추출 불가시 방법·효과만)
 * - 실 입력 데이터만 렌더 (추측 필드 없음)
 */
import MarkingOverlay from './MarkingOverlay'
import { parseMarkingsAttr } from '../lib/markings'

const EN_LABEL = {
  '치성 관계': 'Dental Relationship',
  '골격 관계': 'Skeletal Relationship',
  '치료 계획': 'Treatment Plan',
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

  const sections = parseSections(bodyHtml)
  // 치료 계획 뒤에 케이스/장점 삽입. 그 뒤 나머지 섹션(예: 추가사항) → 맞춤안내 → 푸터.
  const tIdx = sections.findIndex(s => s.title === '치료 계획')
  const secBefore = tIdx >= 0 ? sections.slice(0, tIdx + 1) : sections
  const secAfter  = tIdx >= 0 ? sections.slice(tIdx + 1) : []
  const renderSection = (sec, globalNum) => {
    const num = String(globalNum).padStart(2, '0')
    const en = EN_LABEL[sec.title] || ''
    if (sec.title === '치료 계획') {
      return <TreatmentSection key={`t-${globalNum}`} num={num} en={en} kr={sec.title} summaryHtml={sec.summaryHtml} v={v} />
    }
    return (
      <DiagnosticSection
        key={`s-${globalNum}`} num={num} en={en} kr={sec.title}
        figures={sec.figures} summaryHtml={sec.summaryHtml} v={v}
        design={design} onUpdateCaption={onUpdateCaption} onOpenMarker={onOpenMarker}
      />
    )
  }

  let n = 0
  const blocks = []
  for (const sec of secBefore) { n++; blocks.push(renderSection(sec, n)) }
  if (hasCases)     { n++; blocks.push(<CasesSection    key={`cases-${n}`}     num={String(n).padStart(2, '0')} cases={cases} />) }
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

function readFigure(fig) {
  const img = fig.querySelector('img')
  const cap = fig.querySelector('figcaption')
  const src = img?.getAttribute('src') || ''
  const caption = (cap?.textContent || '').trim()
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
      const isPlanHeader = /^계획\s*#?\d+\s*[:：]/.test(strongText)

      if (isPlanHeader) {
        if (cur) plans.push(cur)
        const title = strongText.replace(/^계획\s*#?\d+\s*[:：]\s*/, '')
        cur = { title, methodHtml: '', effect: '', duration: '' }
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

function Cover({ patientName, consultDate, v }) {
  return (
    <div style={S.cover}>
      <div style={S.coverBorder} />
      <div style={S.coverTop}>
        <span>Prime S Dental</span>
        <span>2026</span>
      </div>
      <div style={S.coverCenter}>
        <div style={S.coverEyebrow}>Consultation Report</div>
        <div style={S.coverRule} />
        <div style={S.coverTitle}>
          <span style={S.coverFor}>for</span>
          <span style={S.coverName}>{patientName || '○○○'}</span>
        </div>
        <div style={S.coverVolume}>VOL. 01 · 초진 상담 결과서</div>
      </div>
      <div style={S.coverBottom}>
        <span>Prime S · 2026</span>
        <span style={S.coverDate}>{consultDate || '____. __. __'}</span>
      </div>
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

function DiagnosticSection({ num, en, kr, figures, summaryHtml, v, design, onUpdateCaption, onOpenMarker }) {
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
    <div style={S.sec}>
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

function CasesSection({ num, cases }) {
  if (!cases?.length) return null
  return (
    <div style={S.secPlan}>
      <SecHead num={num} en="Similar Cases" kr="유사 치료 사례" center />
      {cases.map((c, i) => (
        <div key={c.id || i} style={{ ...S.planBlock, ...(i > 0 ? S.planBlockDivider : {}) }}>
          {c.title && <h3 style={S.planTitle}>{c.title}</h3>}
          {(c.pairs || []).map((p, pi) => (
            <div key={pi} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
              <CasePhoto label="Before" url={p.before_url} />
              <CasePhoto label="After" url={p.after_url} />
            </div>
          ))}
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

function CasePhoto({ label, url }) {
  if (!url) return null
  return (
    <figure style={{ margin: 0 }}>
      <div style={{ position: 'relative' }}>
        <img src={url} alt={label} style={{ width: '100%', display: 'block', borderRadius: 2 }} />
        <div style={{
          position: 'absolute', top: 10, left: 10,
          padding: '3px 10px', background: 'rgba(26,26,24,0.85)',
          color: '#fff', fontSize: 10, fontWeight: 700, letterSpacing: '0.2em',
          textTransform: 'uppercase', borderRadius: 2,
        }}>{label}</div>
      </div>
    </figure>
  )
}

function StrengthsSection({ num, strengths }) {
  if (!strengths?.length) return null
  return (
    <div style={S.sec}>
      <SecHead num={num} en="Why Choose Us" kr="프라임에스의 강점" />
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
          <div style={{ fontSize: 14, lineHeight: 1.85, color: C.ink2, whiteSpace: 'pre-wrap', marginBottom: card.detail_url ? 10 : 0 }}>
            {card.description}
          </div>
        )}
        {card.detail_url && (
          <a href={card.detail_url} target="_blank" rel="noreferrer"
             style={{ fontFamily: FONTS.sans, fontSize: 11, letterSpacing: '0.3em', textTransform: 'uppercase', color: C.gold, textDecoration: 'none', borderBottom: `1px solid ${C.gold}`, paddingBottom: 2 }}>
            자세히 보기 →
          </a>
        )}
      </div>
    </div>
  )
}

function TreatmentSection({ num, en, kr, summaryHtml, v }) {
  const plans = parseTreatmentPlans(summaryHtml)
  const hasParsed = plans.length > 0
  return (
    <div style={S.secPlan}>
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
  const roman = ['I', 'II', 'III', 'IV', 'V'][idx] || String(idx + 1)
  const label = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon'][idx] || ''
  return (
    <div style={{ ...S.planBlock, ...(idx > 0 ? S.planBlockDivider : {}) }}>
      <div style={S.planTag}>
        <span style={S.planRoman}>{roman}</span>
        <span style={S.planLabel}>Plan{label ? ` · ${label}` : ''}</span>
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

function SecHead({ num, en, kr, center }) {
  return (
    <div style={{ ...S.secHead, ...(center ? S.secHeadCenter : {}) }}>
      <span style={S.secNum}>{num}</span>
      <div style={S.secLabels}>
        {en && <div style={S.secEn}>{en}</div>}
        <div style={S.secKr}>{kr}</div>
      </div>
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

function PersonalNote({ patientName, note, v, design, onUpdateNote }) {
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
        >{note}</div>
      ) : (
        <div style={S.noteQuote}>{note}</div>
      )}
      <div style={S.noteSign}>— 프라임에스 치과교정과</div>
    </div>
  )
}

function Footer({ v }) {
  return (
    <div style={S.footer}>
      <div style={S.footerBrand}>Prime S</div>
      <div style={S.footerTag}>ORTHODONTIC SPECIALTY</div>
      <div style={S.footerInfo}>
        인천 부평구 부평대로 · 부평역 지하상가 15번 출구 앞<br />032-123-4567
      </div>
      <div style={S.cta}>
        <div style={{ ...S.ctaBtn, background: '#fee500', color: '#3c1e1e' }}>카카오톡 상담</div>
        <div style={{ ...S.ctaBtn, background: '#03c75a', color: '#fff' }}>네이버 예약</div>
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

const S = {
  empty: { display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '400px', color: '#9ca3af', fontSize: '14px', textAlign: 'center', padding: '40px', fontFamily: FONTS.kor },
  page: { fontFamily: FONTS.kor, color: C.ink, lineHeight: 1.95, background: C.paper, WebkitFontSmoothing: 'antialiased' },

  // COVER — 고정 높이(뷰포트 의존 제거)
  cover: {
    minHeight: 560, background: C.ivory, padding: '80px 48px',
    display: 'grid', gridTemplateRows: 'auto 1fr auto', position: 'relative',
  },
  coverBorder: { position: 'absolute', top: 80, left: 48, right: 48, bottom: 80, border: `1px solid ${C.line}`, pointerEvents: 'none' },
  coverTop: { display: 'flex', justifyContent: 'space-between', padding: '24px 28px', fontFamily: FONTS.sans, fontSize: 10, letterSpacing: '0.35em', color: C.gold, textTransform: 'uppercase', position: 'relative', zIndex: 1 },
  coverCenter: { display: 'grid', placeItems: 'center', textAlign: 'center', padding: '0 28px', position: 'relative', zIndex: 1 },
  coverEyebrow: { fontFamily: FONTS.serif, fontStyle: 'italic', fontSize: 16, color: C.mid, marginBottom: 24 },
  coverRule: { width: 1, height: 56, background: C.gold, marginBottom: 24 },
  coverTitle: { fontFamily: FONTS.serif, fontWeight: 400, lineHeight: 0.9, color: C.dark, display: 'flex', flexDirection: 'column', alignItems: 'center' },
  coverFor: { fontStyle: 'italic', fontSize: 30, color: C.gold, marginBottom: 14 },
  coverName: { fontFamily: FONTS.kor, fontWeight: 700, fontSize: 68, letterSpacing: '0.04em' },
  coverVolume: { marginTop: 32, fontFamily: FONTS.sans, fontSize: 10, letterSpacing: '0.4em', color: C.mid, textTransform: 'uppercase' },
  coverBottom: { display: 'flex', justifyContent: 'space-between', padding: '24px 28px', fontFamily: FONTS.sans, fontSize: 10, letterSpacing: '0.35em', color: C.gold, textTransform: 'uppercase', position: 'relative', zIndex: 1 },
  coverDate: { fontFamily: FONTS.serif, fontWeight: 300, fontSize: 20, color: C.dark, letterSpacing: 0, textTransform: 'none' },

  // 공통 섹션
  sec: { padding: '72px 48px 64px', borderBottom: `1px solid ${C.line}` },
  secPlan: { padding: '72px 48px', background: C.ivory, borderBottom: `1px solid ${C.line}` },

  secHead: { display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 32, paddingBottom: 28, marginBottom: 40, borderBottom: `1px solid ${C.line}` },
  secHeadCenter: { maxWidth: 720, margin: '0 auto 40px' },
  secNum: { fontFamily: FONTS.serif, fontWeight: 300, fontStyle: 'italic', fontSize: 96, lineHeight: 0.82, color: C.gold, letterSpacing: '-0.04em' },
  secLabels: { textAlign: 'right', flex: 1 },
  secEn: { fontFamily: FONTS.serif, fontStyle: 'italic', fontSize: 14, color: C.mid, letterSpacing: '0.04em', marginBottom: 6 },
  secKr: { fontFamily: FONTS.kor, fontWeight: 700, fontSize: 28, color: C.ink, letterSpacing: '-0.01em' },

  // 사진 — 크롭 금지: 자연 비율 유지
  photos: { marginBottom: 40 },
  figFull: { margin: '0 -48px 24px' },
  figSolo: { margin: '0 0 24px', textAlign: 'center' },
  figCenter: { maxWidth: 480, margin: '0 auto 24px' },
  figGrid: { margin: 0 },
  grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, alignItems: 'start' },
  imgFull: { width: '100%', display: 'block' },
  imgSolo: { maxWidth: '100%', display: 'block', margin: '0 auto', borderRadius: 2 },
  imgPortrait: { maxWidth: '100%', display: 'block', margin: '0 auto', borderRadius: 2 },
  imgGrid: { width: '100%', display: 'block', borderRadius: 2 },
  figCap: { marginTop: 10, paddingTop: 8, borderTop: `1px solid ${C.gold}`, fontFamily: FONTS.serif, fontStyle: 'italic', fontSize: 13, lineHeight: 1.7, color: C.mid, textAlign: 'center', letterSpacing: '0.01em' },

  // 종합 소견
  summary: { maxWidth: 680, margin: '0 auto', paddingTop: 28, borderTop: `1px solid ${C.line}`, position: 'relative' },
  summaryMark: { position: 'absolute', top: -1, left: '50%', transform: 'translateX(-50%)', width: 72, height: 3, background: C.gold },
  summaryLabel: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, marginBottom: 22 },
  summaryEn: { fontFamily: FONTS.sans, fontWeight: 400, fontSize: 10, letterSpacing: '0.4em', color: C.gold, textTransform: 'uppercase' },
  summaryKr: { fontFamily: FONTS.kor, fontWeight: 700, fontSize: 15, color: C.ink, letterSpacing: '0.02em' },
  summaryDot: { width: 4, height: 4, background: C.gold, borderRadius: '50%' },

  // 치료 계획
  planBlock: { maxWidth: 720, margin: '0 auto', padding: '56px 0', position: 'relative' },
  planBlockDivider: { borderTop: `1px solid ${C.line}` },
  planTag: { display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 },
  planRoman: { fontFamily: FONTS.serif, fontStyle: 'italic', fontWeight: 300, fontSize: 48, lineHeight: 1, color: C.gold },
  planLabel: { fontFamily: FONTS.sans, fontWeight: 400, fontSize: 11, letterSpacing: '0.4em', color: C.gold, textTransform: 'uppercase', borderBottom: `1px solid ${C.gold}`, paddingBottom: 4 },
  planTitle: { fontFamily: FONTS.kor, fontWeight: 700, fontSize: 24, lineHeight: 1.45, color: C.ink, letterSpacing: '-0.01em', margin: '0 0 32px', maxWidth: 640 },
  planMethod: { marginBottom: 24 },
  planMethodHead: { fontFamily: FONTS.serif, fontStyle: 'italic', fontSize: 15, color: C.gold, marginBottom: 10 },
  planMethodBody: { fontSize: 15, lineHeight: 2.05, color: C.ink2 },
  planEffect: { padding: '24px 28px', background: C.dark, color: '#fff', position: 'relative' },
  planEffectHead: { fontFamily: FONTS.sans, fontSize: 10, letterSpacing: '0.4em', color: C.gold, textTransform: 'uppercase', marginBottom: 12 },
  planEffectQuote: { fontFamily: FONTS.serif, fontStyle: 'italic', fontWeight: 300, fontSize: 18, lineHeight: 1.75, color: 'rgba(255,255,255,0.92)' },
  planMeta: { marginTop: 18, paddingTop: 14, borderTop: `1px solid ${C.line}`, fontFamily: FONTS.serif, fontStyle: 'italic', fontSize: 13, color: C.mid },
  planMetaKey: { fontFamily: FONTS.sans, fontStyle: 'normal', fontWeight: 500, fontSize: 10, letterSpacing: '0.3em', color: C.gold, textTransform: 'uppercase', marginRight: 10 },
  planFallback: { maxWidth: 720, margin: '0 auto', fontSize: 15, lineHeight: 2, color: C.ink2 },

  // 맞춤 안내
  note: { padding: '96px 48px', background: C.dark, color: '#fff', textAlign: 'center', position: 'relative' },
  noteTopRule: { position: 'absolute', top: 40, left: '50%', transform: 'translateX(-50%)', width: 1, height: 64, background: `linear-gradient(to bottom, transparent, ${C.gold})` },
  noteLabel: { fontFamily: FONTS.sans, fontSize: 10, letterSpacing: '0.5em', color: C.gold, textTransform: 'uppercase', marginBottom: 36 },
  noteQuote: { fontFamily: FONTS.serif, fontWeight: 300, fontStyle: 'italic', fontSize: 22, lineHeight: 1.8, color: 'rgba(255,255,255,0.92)', maxWidth: 640, margin: '0 auto 24px', whiteSpace: 'pre-wrap' },
  noteSign: { fontFamily: FONTS.serif, fontStyle: 'italic', fontSize: 14, color: C.goldL },

  // 푸터
  footer: { padding: '48px', background: '#0e0e0c', color: '#fff', textAlign: 'center' },
  footerBrand: { fontFamily: FONTS.serif, fontSize: 26, letterSpacing: '0.1em', marginBottom: 4 },
  footerTag: { fontFamily: FONTS.sans, fontSize: 10, letterSpacing: '0.4em', color: C.gold, textTransform: 'uppercase', marginBottom: 20 },
  footerInfo: { fontFamily: FONTS.kor, fontSize: 12, lineHeight: 2, color: 'rgba(255,255,255,0.45)', marginBottom: 20 },
  cta: { display: 'flex', gap: 8, maxWidth: 420, margin: '0 auto 20px' },
  ctaBtn: { flex: 1, padding: 12, textAlign: 'center', fontFamily: FONTS.kor, fontSize: 13, fontWeight: 700 },
  copy: { fontFamily: FONTS.serif, fontStyle: 'italic', fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.15em' },
}
