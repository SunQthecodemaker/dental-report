/**
 * BrochurePreview — 프라임에스 디자인 무드 (다크+골드, 세리프)
 * mode: "preview" (에디터 우측 축소) | "view" (환자 열람, 반응형)
 *
 * content: { body: HTML, personalNote, appealPoints[] }
 * photos: [{ slot, url, caption }] — 7장 슬롯 + 추가
 */

const EN_LABEL = {
  '치성 관계': 'Dental Relationship',
  '골격 관계': 'Skeletal Relationship',
  '치료 계획': 'Treatment Plan',
  '추가 사항': 'Additional Notes',
  '맞춤 안내': 'For You',
}

const SECTION_BG_CYCLE = ['light', 'dark', 'cream', 'light']

export default function BrochurePreview({ patientName, consultDate, content, photos = [], mode = 'preview' }) {
  const v = mode === 'view'
  const s = v ? 1 : 0.85

  const C = {
    gold: '#b5976a', goldLight: '#d4b896',
    dark: '#1a1a18', dark2: '#2c2c2a', mid: '#5a5a55',
    light: '#f5f2ed', white: '#fdfcfa', cream: '#f0ece4',
  }

  const bodyHtml = content?.body || ''
  const hasBody = !!bodyHtml && bodyHtml.replace(/<[^>]+>/g, '').trim().length > 0
  const hasNote = !!content?.personalNote
  const hasAppeal = Array.isArray(content?.appealPoints) && content.appealPoints.length > 0

  if (!hasBody && !hasNote && !hasAppeal) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: '400px', color: '#9ca3af', fontSize: '14px', textAlign: 'center', padding: '40px', fontFamily: "'Nanum Myeongjo', serif" }}>
        AI 텍스트를 생성하면<br />여기에 미리보기가 표시됩니다
      </div>
    )
  }

  const font = "'Nanum Myeongjo', 'Noto Serif KR', serif"
  const fontEn = "'Cormorant Garamond', serif"

  const sections = parseBodySections(bodyHtml)

  return (
    <div style={{ fontFamily: font, color: C.dark, lineHeight: v ? '2' : '1.8', background: C.white }}>

      {/* ══ HERO ══ */}
      <div style={{
        background: `linear-gradient(160deg, #0f0f0e 0%, ${C.dark2} 40%, ${C.dark} 100%)`,
        color: '#fff', padding: v ? '48px 28px 36px' : '32px 20px 24px', textAlign: 'center',
      }}>
        <div style={{ fontFamily: fontEn, fontSize: f(11,s), letterSpacing: '0.4em', textTransform: 'uppercase', color: C.gold, marginBottom: '4px' }}>
          Prime S Dental
        </div>
        <div style={{ fontSize: f(18,s), fontWeight: 700, marginBottom: '2px' }}>프라임에스 치과교정과</div>
        <div style={{ fontSize: f(11,s), color: 'rgba(255,255,255,0.45)', marginBottom: '20px' }}>
          교정과 · 치주과 · 구강내과 전문의 협진
        </div>
        <div style={{ width: '32px', height: '1px', background: C.gold, margin: '0 auto 20px' }} />
        <div style={{ fontFamily: fontEn, fontSize: f(13,s), letterSpacing: '0.25em', textTransform: 'uppercase', color: C.goldLight, marginBottom: '8px' }}>
          Consultation Report
        </div>
        <div style={{ fontSize: f(20,s), fontWeight: 700, marginBottom: '4px' }}>
          {patientName || '○○○'}님 초진 상담 결과서
        </div>
        <div style={{ fontFamily: fontEn, fontSize: f(13,s), color: 'rgba(255,255,255,0.5)', letterSpacing: '0.1em' }}>
          {consultDate || '____. __. __'}
        </div>
      </div>

      {/* ══ 검사 자료 (Step 1 슬롯 사진) ══ */}
      {photos.length > 0 && (
        <Sec v={v} s={s} en="Clinical Records" kr="검사 자료" C={C} fontEn={fontEn} bg="light">
          {renderSlotPhotos(photos, v, s, C, fontEn)}
        </Sec>
      )}

      {/* ══ 본문 섹션들 (body 파싱 결과) ══ */}
      {sections.map((sec, i) => {
        const bg = SECTION_BG_CYCLE[i % SECTION_BG_CYCLE.length]
        const en = EN_LABEL[sec.title] || ''
        return (
          <BodySection
            key={i}
            v={v} s={s} C={C} fontEn={fontEn}
            en={en} kr={sec.title}
            html={sec.html}
            bg={bg}
          />
        )
      })}

      {/* ══ 맞춤 안내 (personalNote, 다크) ══ */}
      {hasNote && (
        <div style={{ background: C.dark, padding: v ? '36px 24px' : '24px 20px' }}>
          <SecHead v={v} s={s} en="For You" kr={`${patientName || '○○○'}님께 드리는 말씀`} C={C} fontEn={fontEn} dark />
          <div style={{
            border: '1px solid rgba(181,151,106,0.3)', borderRadius: '4px', padding: v ? '24px 20px' : '16px 14px',
          }}>
            <div style={{ fontFamily: fontEn, fontSize: f(10,s), letterSpacing: '0.25em', textTransform: 'uppercase', color: C.gold, marginBottom: '12px' }}>
              Personalized Note
            </div>
            <div style={{ fontSize: f(13,s), lineHeight: '2.3', color: 'rgba(255,255,255,0.75)', whiteSpace: 'pre-wrap' }}>
              {content.personalNote}
            </div>
          </div>
        </div>
      )}

      {/* ══ 어필 포인트 ══ */}
      {hasAppeal && (
        <Sec v={v} s={s} en="Why Prime S" kr="프라임에스에서 치료하면" C={C} fontEn={fontEn} bg="light">
          {content.appealPoints.map((ap, i) => (
            <div key={i} style={{
              display: 'flex', gap: '14px', alignItems: 'flex-start',
              padding: '14px 0', borderBottom: i < content.appealPoints.length - 1 ? `1px solid ${C.cream}` : 'none',
            }}>
              <div style={{
                width: '36px', height: '36px', background: C.dark, borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.gold, fontSize: '15px', flexShrink: 0,
              }}>✦</div>
              <div>
                <div style={{ fontSize: f(13,s), fontWeight: 700, color: C.dark, marginBottom: '2px' }}>{ap.title}</div>
                <div style={{ fontSize: f(11,s), lineHeight: '1.8', color: C.mid }}>{ap.description}</div>
              </div>
            </div>
          ))}
        </Sec>
      )}

      {/* ══ FOOTER ══ */}
      <div style={{ background: C.dark, padding: v ? '32px 24px' : '24px 20px', color: '#fff' }}>
        <div style={{ display: 'flex', gap: '14px', alignItems: 'center', marginBottom: '20px', paddingBottom: '20px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
          <div style={{
            width: '60px', height: '60px', borderRadius: '50%',
            background: `linear-gradient(135deg, ${C.gold}, ${C.goldLight})`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: fontEn, fontSize: '14px', color: C.dark, fontWeight: 600, flexShrink: 0,
          }}>Dr</div>
          <div>
            <div style={{ fontSize: f(15,s), fontWeight: 700 }}>OOO 원장</div>
            <div style={{ fontSize: f(11,s), lineHeight: '1.7', color: 'rgba(255,255,255,0.45)' }}>
              치의학 박사 · 교정과 전문의<br />대한치과교정학회 인정의
            </div>
          </div>
        </div>
        <div style={{ textAlign: 'center', fontSize: f(12,s), color: 'rgba(255,255,255,0.5)', marginBottom: '16px', lineHeight: '1.8' }}>
          인천 부평구 부평대로 · 부평역 지하상가 15번 출구 앞<br />032-123-4567
        </div>
        <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
          <div style={{ flex: 1, padding: '14px', borderRadius: '4px', textAlign: 'center', fontSize: f(13,s), fontWeight: 700, background: '#fee500', color: '#3c1e1e' }}>카카오톡 상담</div>
          <div style={{ flex: 1, padding: '14px', borderRadius: '4px', textAlign: 'center', fontSize: f(13,s), fontWeight: 700, background: '#03c75a', color: '#fff' }}>네이버 예약</div>
        </div>
        <div style={{ textAlign: 'center', fontFamily: fontEn, fontSize: f(10,s), letterSpacing: '0.15em', color: 'rgba(255,255,255,0.2)', paddingTop: '16px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          © Prime S Dental
        </div>
      </div>
    </div>
  )
}

/**
 * body HTML을 h2 기준으로 섹션 분할
 * 반환: [{ title: '치성 관계', html: '...' }, ...]
 */
function parseBodySections(html) {
  if (!html || typeof html !== 'string') return []
  try {
    const parser = new DOMParser()
    const doc = parser.parseFromString(`<div id="root">${html}</div>`, 'text/html')
    const root = doc.getElementById('root')
    if (!root) return []
    const sections = []
    let current = { title: null, html: '' }
    for (const node of Array.from(root.childNodes)) {
      if (node.nodeType === 1 && node.tagName === 'H2') {
        if (current.title || current.html.trim()) sections.push(current)
        current = { title: node.textContent.trim(), html: '' }
      } else {
        current.html += node.nodeType === 1 ? node.outerHTML : (node.textContent || '')
      }
    }
    if (current.title || current.html.trim()) sections.push(current)
    return sections.filter(s => s.title || s.html.trim())
  } catch {
    return [{ title: null, html }]
  }
}

// 본문 한 섹션 렌더링 (밝은/다크/크림 bg 교차)
function BodySection({ v, s, C, fontEn, en, kr, html, bg }) {
  const isDark = bg === 'dark'
  const bgColor = bg === 'dark' ? C.dark : bg === 'cream' ? C.light : C.white
  const textColor = isDark ? 'rgba(255,255,255,0.85)' : C.mid
  const imgBorder = isDark ? 'rgba(255,255,255,0.15)' : C.cream

  return (
    <div style={{ background: bgColor, padding: v ? '36px 24px' : '24px 20px' }}>
      {kr && <SecHead v={v} s={s} en={en} kr={kr} C={C} fontEn={fontEn} dark={isDark} />}
      <div
        className={`brochure-body ${isDark ? 'brochure-body-dark' : ''}`}
        style={{
          fontSize: f(13, s),
          lineHeight: v ? '2.1' : '1.9',
          color: textColor,
          letterSpacing: '0.01em',
        }}
        dangerouslySetInnerHTML={{ __html: decorateImages(html, imgBorder) }}
      />
    </div>
  )
}

// html 내 <img> 태그에 디자인 스타일 적용 (inline style 병합)
function decorateImages(html, border) {
  if (!html) return ''
  return html.replace(/<img\b([^>]*)>/gi, (m, attrs) => {
    // 기존 style 추출/병합
    const styleMatch = attrs.match(/style=["']([^"']*)["']/i)
    const existing = styleMatch ? styleMatch[1] : ''
    const newStyle = `${existing};max-width:100%;height:auto;display:block;border-radius:6px;margin:14px auto;box-shadow:0 6px 20px rgba(0,0,0,0.15);border:1px solid ${border};`
    const cleaned = attrs.replace(/style=["'][^"']*["']/i, '')
    return `<img${cleaned} style="${newStyle}">`
  })
}

// 검사자료 슬롯 사진 (구내5 + 파노 + 셉 + extras)
function renderSlotPhotos(photos, v, s, C, fontEn) {
  const intraoral = photos.filter(p => ['front', 'left', 'right', 'upper', 'lower'].includes(p.slot))
  const pano = photos.find(p => p.slot === 'panorama')
  const ceph = photos.find(p => p.slot === 'cephalogram')
  const extras = photos.filter(p => p.slot === 'extra')

  return (
    <>
      {intraoral.length > 0 && (
        <>
          <Label s={s} fontEn={fontEn}>Intraoral Photos</Label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '3px', borderRadius: '4px', overflow: 'hidden', marginBottom: '12px' }}>
            {intraoral.map((p, i) => (
              <div key={i} style={{ position: 'relative', aspectRatio: i === 0 ? 'auto' : '4/3', ...(i === 0 ? { gridColumn: '1/3', gridRow: '1/3' } : {}) }}>
                <img src={p.url || p.preview} alt={p.caption || p.slot} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                <span style={{ position: 'absolute', bottom: '3px', left: '5px', fontSize: '9px', color: '#fff', background: 'rgba(0,0,0,0.45)', padding: '1px 5px', borderRadius: '2px' }}>
                  {p.caption || p.slot}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
      {pano && (
        <>
          <Label s={s} fontEn={fontEn}>Panoramic Radiograph</Label>
          <img src={pano.url || pano.preview} alt="파노라마" style={{ width: '100%', borderRadius: '4px', marginBottom: '12px' }} />
        </>
      )}
      {ceph && (
        <>
          <Label s={s} fontEn={fontEn}>Lateral Cephalogram</Label>
          <img src={ceph.url || ceph.preview} alt="측모두부방사선" style={{ width: '45%', borderRadius: '4px', marginBottom: '12px' }} />
        </>
      )}
      {extras.map((p, i) => (
        <div key={i} style={{ borderRadius: '4px', overflow: 'hidden', border: `1px solid ${C.cream}`, marginBottom: '10px' }}>
          <img src={p.url || p.preview} alt={p.caption || '추가 사진'} style={{ width: '100%', display: 'block' }} />
          {p.caption && (
            <div style={{ padding: '10px 14px', fontSize: f(12,s), lineHeight: '1.8', color: C.mid, background: C.light, borderTop: `2px solid ${C.gold}` }}>
              {p.caption}
            </div>
          )}
        </div>
      ))}
    </>
  )
}

function Label({ s, fontEn, children }) {
  return (
    <div style={{ fontFamily: fontEn, fontSize: f(10,s), letterSpacing: '0.2em', textTransform: 'uppercase', color: '#b5976a', marginBottom: '8px', marginTop: '12px' }}>
      {children}
    </div>
  )
}

function SecHead({ v, s, en, kr, C, fontEn, dark }) {
  return (
    <div style={{ paddingBottom: '12px', marginBottom: '12px' }}>
      {en && (
        <div style={{ fontFamily: fontEn, fontSize: f(10,s), letterSpacing: '0.3em', textTransform: 'uppercase', color: C.gold, marginBottom: '4px' }}>{en}</div>
      )}
      <div style={{ fontSize: f(17,s), fontWeight: 700, color: dark ? '#fff' : C.dark }}>{kr}</div>
      <div style={{ width: '100%', height: '1px', background: `linear-gradient(to right, ${C.gold}, transparent)`, marginTop: '10px' }} />
    </div>
  )
}

function Sec({ v, s, en, kr, C, fontEn, bg, children }) {
  const bgColor = bg === 'dark' ? C.dark : bg === 'cream' ? C.light : C.white
  const dark = bg === 'dark'
  return (
    <div style={{ background: bgColor, padding: v ? '32px 24px' : '24px 20px' }}>
      <SecHead v={v} s={s} en={en} kr={kr} C={C} fontEn={fontEn} dark={dark} />
      {children}
    </div>
  )
}

function f(base, scale) {
  return `${Math.round(base * scale)}px`
}
