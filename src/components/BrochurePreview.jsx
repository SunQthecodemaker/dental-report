/**
 * BrochurePreview — 프라임에스 디자인 무드 (다크+골드, 세리프)
 * mode: "preview" (에디터 우측 축소) | "view" (환자 열람, 반응형)
 *
 * content: 새 형식 데이터 (skeletalRelationship, dentalRelationship, problemList, ...)
 * photos: [{ slot, url, caption }] — 기본 7장 + 추가
 */
export default function BrochurePreview({ patientName, consultDate, content, photos = [], mode = 'preview' }) {
  const v = mode === 'view'
  const s = v ? 1 : 0.85 // scale factor for font sizes

  const C = {
    gold: '#b5976a', goldLight: '#d4b896',
    dark: '#1a1a18', dark2: '#2c2c2a', mid: '#5a5a55',
    light: '#f5f2ed', white: '#fdfcfa', cream: '#f0ece4',
    red: '#c45c5c', green: '#6a9b7a',
  }

  if (!content || (!content.skeletalRelationship && !content.dentalRelationship && (!content.problemList || content.problemList.length === 0))) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: '400px', color: '#9ca3af', fontSize: '14px', textAlign: 'center', padding: '40px', fontFamily: "'Nanum Myeongjo', serif" }}>
        AI 텍스트를 생성하면<br />여기에 미리보기가 표시됩니다
      </div>
    )
  }

  const font = "'Nanum Myeongjo', 'Noto Serif KR', serif"
  const fontEn = "'Cormorant Garamond', serif"

  // 사진 헬퍼
  const getPhoto = (slot) => photos.find(p => p.slot === slot)
  const extraPhotos = photos.filter(p => p.slot === 'extra')

  return (
    <div style={{ fontFamily: font, color: C.dark, lineHeight: v ? '2' : '1.8', background: C.white }}>

      {/* ══ HERO ══ */}
      <div style={{
        background: `linear-gradient(160deg, #0f0f0e 0%, ${C.dark2} 40%, ${C.dark} 100%)`,
        color: '#fff', padding: v ? '48px 28px 36px' : '32px 20px 24px', textAlign: 'center', position: 'relative',
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

      {/* ══ 검사 자료 ══ */}
      {photos.length > 0 && (
        <Sec v={v} s={s} en="Clinical Records" kr="검사 자료" C={C} fontEn={fontEn}>
          {renderPhotos(photos, v, s, C, fontEn)}
        </Sec>
      )}

      {/* ══ 골격 관계 (다크) ══ */}
      {content.skeletalRelationship && (
        <div style={{ background: C.dark, padding: v ? '32px 24px' : '24px 20px' }}>
          <SecHead v={v} s={s} en="Skeletal Relationship" kr="골격 관계" C={C} fontEn={fontEn} dark />
          <div style={{ ...textStyle(v, s), color: 'rgba(255,255,255,0.6)' }}>
            {content.skeletalRelationship}
          </div>
        </div>
      )}

      {/* ══ 치성 관계 ══ */}
      {content.dentalRelationship && (
        <Sec v={v} s={s} en="Dental Relationship" kr="치성 관계" C={C} fontEn={fontEn}>
          <div style={textStyle(v, s)}>{content.dentalRelationship}</div>
        </Sec>
      )}

      {/* ══ 문제 목록 (다크) ══ */}
      {content.problemList?.length > 0 && (
        <div style={{ background: C.dark, padding: v ? '32px 24px' : '24px 20px' }}>
          <SecHead v={v} s={s} en="Problem List" kr="문제 목록" C={C} fontEn={fontEn} dark />
          {content.problemList.map((p, i) => (
            <div key={i} style={{
              display: 'flex', gap: '10px', alignItems: 'flex-start',
              padding: '10px 0', borderBottom: i < content.problemList.length - 1 ? '1px solid rgba(255,255,255,0.08)' : 'none',
            }}>
              <div style={{
                width: '24px', height: '24px', borderRadius: '50%',
                background: p.severity === 'high' ? C.red : C.gold,
                color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: f(11,s), fontWeight: 700, flexShrink: 0, marginTop: '2px',
              }}>{i + 1}</div>
              <div>
                <div style={{ fontSize: f(13,s), color: 'rgba(255,255,255,0.8)', lineHeight: '1.7' }}>{p.text}</div>
                <span style={{
                  fontSize: f(10,s), fontWeight: 700, padding: '1px 8px', borderRadius: '2px', marginTop: '2px', display: 'inline-block',
                  background: p.severity === 'high' ? 'rgba(196,92,92,0.2)' : 'rgba(181,151,106,0.2)',
                  color: p.severity === 'high' ? '#fca5a5' : C.goldLight,
                }}>{p.severity === 'high' ? '주요' : '보조'}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ══ 치료 목표 & 계획 ══ */}
      {(content.treatmentGoals?.length > 0 || content.treatmentOptions?.length > 0) && (
        <div style={{ background: C.light, padding: v ? '32px 24px' : '24px 20px' }}>
          <SecHead v={v} s={s} en="Treatment Goals & Plan" kr="치료 목표 & 계획" C={C} fontEn={fontEn} />

          {/* 목표 */}
          {content.treatmentGoals?.map((g, i) => (
            <div key={i} style={{
              display: 'flex', gap: 0, marginBottom: '6px', borderRadius: '4px', overflow: 'hidden', border: `1px solid ${C.cream}`,
            }}>
              <div style={{
                width: '28px', background: C.green, display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff', fontSize: f(11,s), fontWeight: 700, flexShrink: 0,
              }}>{g.problemRef}</div>
              <div style={{ flex: 1, padding: '10px 12px', background: C.white }}>
                <div style={{ fontSize: f(11,s), color: C.red }}>
                  문제 #{g.problemRef} {content.problemList?.[g.problemRef - 1]?.text ? `— ${content.problemList[g.problemRef - 1].text.slice(0, 20)}...` : ''}
                </div>
                <div style={{ fontSize: f(13,s), fontWeight: 700, color: C.dark }}>{g.goal}</div>
                {g.detail && <div style={{ fontSize: f(11,s), color: C.mid }}>{g.detail}</div>}
              </div>
            </div>
          ))}

          {/* 치료 계획 구분선 */}
          {content.treatmentOptions?.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: '20px 0 14px' }}>
              <span style={{ fontFamily: fontEn, fontSize: f(10,s), letterSpacing: '0.3em', textTransform: 'uppercase', color: C.gold, whiteSpace: 'nowrap' }}>Treatment Plan</span>
              <div style={{ flex: 1, height: '1px', background: C.cream }} />
            </div>
          )}

          {/* 옵션 카드 */}
          {content.treatmentOptions?.map((opt, i) => (
            <div key={i} style={{
              padding: v ? '20px' : '14px', background: C.white, borderRadius: '4px',
              border: `1px solid ${C.cream}`, marginBottom: '10px',
            }}>
              <div style={{
                display: 'inline-block', fontFamily: fontEn, fontSize: f(10,s), letterSpacing: '0.2em', textTransform: 'uppercase',
                color: C.gold, border: `1px solid ${C.gold}`, padding: '3px 12px', borderRadius: '2px', marginBottom: '10px',
              }}>Option {String.fromCharCode(65 + i)}</div>
              <div style={{ fontSize: f(15,s), fontWeight: 700, color: C.dark, marginBottom: '8px' }}>{opt.name}</div>
              <div style={{ fontSize: f(12,s), lineHeight: '2', color: C.mid, marginBottom: '10px' }}>{opt.description}</div>
              {opt.expectedEffect && (
                <div style={{
                  padding: '10px 14px', background: C.light, borderRadius: '4px', borderLeft: `3px solid ${C.gold}`,
                  fontSize: f(12,s), lineHeight: '1.8', color: C.dark, marginBottom: '10px',
                }}>
                  <strong style={{ color: C.gold }}>기대 효과</strong><br />{opt.expectedEffect}
                </div>
              )}
              <div style={{ display: 'flex', gap: '16px', fontSize: f(11,s), color: C.mid }}>
                {opt.duration && <span>예상 {opt.duration}</span>}
                {opt.appliance && <span>{opt.appliance}</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ══ 맞춤 안내 (다크) ══ */}
      {content.personalNote && (
        <div style={{ background: C.dark, padding: v ? '32px 24px' : '24px 20px' }}>
          <SecHead v={v} s={s} en="For You" kr={`${patientName || '○○○'}님께 드리는 말씀`} C={C} fontEn={fontEn} dark />
          <div style={{
            border: '1px solid rgba(181,151,106,0.3)', borderRadius: '4px', padding: v ? '24px 20px' : '16px 14px',
          }}>
            <div style={{ fontFamily: fontEn, fontSize: f(10,s), letterSpacing: '0.25em', textTransform: 'uppercase', color: C.gold, marginBottom: '12px' }}>
              Personalized Note
            </div>
            <div style={{ fontSize: f(13,s), lineHeight: '2.3', color: 'rgba(255,255,255,0.65)', whiteSpace: 'pre-wrap' }}>
              {content.personalNote}
            </div>
          </div>
        </div>
      )}

      {/* ══ 어필 포인트 ══ */}
      {content.appealPoints?.length > 0 && (
        <Sec v={v} s={s} en="Why Prime S" kr="프라임에스에서 치료하면" C={C} fontEn={fontEn}>
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

      {/* ══ 추가 사항 ══ */}
      {content.additionalNotes && (
        <Sec v={v} s={s} en="Additional Notes" kr="추가 안내" C={C} fontEn={fontEn}>
          <div style={textStyle(v, s)}>{content.additionalNotes}</div>
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

// 사진 렌더링
function renderPhotos(photos, v, s, C, fontEn) {
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
    <div style={{ paddingBottom: '12px' }}>
      <div style={{ fontFamily: fontEn, fontSize: f(10,s), letterSpacing: '0.3em', textTransform: 'uppercase', color: C.gold, marginBottom: '4px' }}>{en}</div>
      <div style={{ fontSize: f(17,s), fontWeight: 700, color: dark ? '#fff' : C.dark }}>{kr}</div>
      <div style={{ width: '100%', height: '1px', background: `linear-gradient(to right, ${C.gold}, transparent)`, marginTop: '12px' }} />
    </div>
  )
}

function Sec({ v, s, en, kr, C, fontEn, children }) {
  return (
    <div style={{ padding: v ? '0 24px 32px' : '0 20px 24px' }}>
      <div style={{ paddingTop: v ? '32px' : '24px' }}>
        <SecHead v={v} s={s} en={en} kr={kr} C={C} fontEn={fontEn} />
      </div>
      {children}
    </div>
  )
}

function textStyle(v, s) {
  return { fontSize: f(13,s), lineHeight: '2.2', color: '#5a5a55', letterSpacing: '0.01em', whiteSpace: 'pre-wrap' }
}

function f(base, scale) {
  return `${Math.round(base * scale)}px`
}
