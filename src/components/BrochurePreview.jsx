// mode: "preview" (에디터 우측 모바일 미리보기) | "view" (환자 열람, 반응형)
export default function BrochurePreview({ patientName, consultDate, blocks, modules, mode = 'preview' }) {
  const isView = mode === 'view'

  if (!blocks || blocks.length === 0) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        minHeight: '667px',
        color: '#9ca3af',
        fontSize: '14px',
        textAlign: 'center',
        padding: '40px',
      }}>
        AI 텍스트를 생성하면<br />여기에 미리보기가 표시됩니다
      </div>
    )
  }

  return (
    <div style={{
      fontSize: isView ? '16px' : '14px',
      lineHeight: isView ? '1.9' : '1.7',
      color: '#1f2937',
    }}>
      {/* 헤더 */}
      <div style={{
        background: 'linear-gradient(135deg, #1e3a5f 0%, #2d5a87 100%)',
        color: '#fff',
        padding: isView ? '40px 32px' : '28px 20px',
        textAlign: 'center',
      }}>
        <div style={{
          fontSize: isView ? '13px' : '11px',
          letterSpacing: '3px',
          opacity: 0.8,
          marginBottom: '4px',
        }}>
          PRIME S DENTAL
        </div>
        <div style={{
          fontSize: isView ? '22px' : '18px',
          fontWeight: '700',
          marginBottom: '4px',
        }}>
          프라임S치과교정과
        </div>
        <div style={{ fontSize: isView ? '13px' : '11px', opacity: 0.7 }}>
          교정과 · 치주과 · 구강내과 전문의 협진
        </div>
        <div style={{
          marginTop: '16px',
          padding: isView ? '16px' : '12px',
          background: 'rgba(255,255,255,0.1)',
          borderRadius: '8px',
          maxWidth: isView ? '500px' : 'none',
          margin: isView ? '16px auto 0' : '16px 0 0',
        }}>
          <div style={{ fontSize: isView ? '18px' : '15px', fontWeight: '600' }}>
            {patientName || '○○○'}님 초진 상담 결과서
          </div>
          <div style={{ fontSize: isView ? '14px' : '12px', opacity: 0.8, marginTop: '2px' }}>
            상담일 {consultDate || '____-__-__'}
          </div>
        </div>
      </div>

      {/* 본문 */}
      <div style={{
        padding: isView ? '32px' : '20px',
        maxWidth: isView ? '800px' : 'none',
        margin: isView ? '0 auto' : '0',
      }}>
        {blocks.map((block) => {
          if (block.type === 'heading' || block.type === 'section-title') {
            return (
              <div key={block.id} style={{
                fontSize: isView ? '18px' : '15px',
                fontWeight: '700',
                color: '#1e3a5f',
                marginTop: isView ? '28px' : '16px',
                marginBottom: isView ? '12px' : '8px',
                paddingBottom: isView ? '8px' : '0',
                borderBottom: isView ? '2px solid #e5e7eb' : 'none',
              }}>
                {block.content}
              </div>
            )
          }

          if (block.type === 'text') {
            return (
              <div key={block.id} style={{
                padding: isView ? '18px 22px' : '14px 16px',
                background: '#fff',
                borderRadius: isView ? '12px' : '10px',
                border: '1px solid #e5e7eb',
                fontSize: isView ? '15px' : '13px',
                color: '#374151',
                lineHeight: isView ? '2' : '1.8',
                marginBottom: isView ? '12px' : '8px',
                whiteSpace: 'pre-wrap',
              }}>
                {block.content}
              </div>
            )
          }

          if (block.type === 'option') {
            return (
              <div key={block.id} style={{
                padding: isView ? '18px 22px' : '12px',
                background: '#eff6ff',
                borderRadius: isView ? '12px' : '8px',
                marginBottom: isView ? '12px' : '8px',
                border: '1px solid #bfdbfe',
              }}>
                <div style={{
                  fontSize: isView ? '17px' : '14px',
                  fontWeight: '600',
                  color: '#1e3a5f',
                  marginBottom: '6px',
                }}>
                  {block.name}
                </div>
                <div style={{ fontSize: isView ? '15px' : '13px', color: '#4b5563' }}>
                  {block.description}
                </div>
                {block.duration && (
                  <div style={{
                    fontSize: isView ? '14px' : '12px',
                    color: '#6b7280',
                    marginTop: '6px',
                  }}>
                    예상 기간: {block.duration}
                  </div>
                )}
              </div>
            )
          }

          if (block.type === 'photo') {
            const src = block.preview || block.url
            if (!src) return null
            return (
              <div key={block.id} style={{
                marginBottom: isView ? '16px' : '10px',
                textAlign: 'center',
              }}>
                <img
                  src={src}
                  alt={block.memo || '진료 사진'}
                  style={{
                    maxWidth: '100%',
                    borderRadius: isView ? '12px' : '8px',
                    maxHeight: isView ? '500px' : (block.ratio > 1.5 ? '160px' : '220px'),
                    objectFit: 'contain',
                    boxShadow: isView ? '0 4px 16px rgba(0,0,0,0.1)' : 'none',
                  }}
                />
                {block.memo && (
                  <div style={{
                    fontSize: isView ? '14px' : '12px',
                    color: '#6b7280',
                    marginTop: '8px',
                    fontStyle: 'italic',
                  }}>
                    {block.memo}
                  </div>
                )}
              </div>
            )
          }

          return null
        })}
      </div>

      {/* 푸터 */}
      <div style={{
        background: '#f8fafc',
        padding: isView ? '32px' : '20px',
        borderTop: '1px solid #e5e7eb',
      }}>
        <div style={{
          maxWidth: isView ? '600px' : 'none',
          margin: isView ? '0 auto' : '0',
        }}>
          <div style={{
            display: 'flex',
            gap: '12px',
            alignItems: 'center',
            marginBottom: '16px',
          }}>
            <div style={{
              width: isView ? '68px' : '56px',
              height: isView ? '68px' : '56px',
              borderRadius: '50%',
              background: '#1e3a5f',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              fontSize: isView ? '22px' : '20px',
              fontWeight: '700',
              flexShrink: 0,
            }}>
              Dr
            </div>
            <div>
              <div style={{
                fontSize: isView ? '16px' : '14px',
                fontWeight: '700',
                color: '#1e3a5f',
              }}>
                원장명
              </div>
              <div style={{
                fontSize: isView ? '13px' : '11px',
                color: '#6b7280',
                lineHeight: '1.5',
              }}>
                대한치과교정학회<br />
                세계교정학회<br />
                오스템 마스터코스 강사
              </div>
            </div>
          </div>

          <div style={{
            fontSize: isView ? '14px' : '12px',
            color: '#6b7280',
            textAlign: 'center',
            padding: isView ? '16px' : '12px',
            background: '#fff',
            borderRadius: '8px',
            border: '1px solid #e5e7eb',
          }}>
            부평역 지하상가 15번 출구 앞
          </div>

          <div style={{
            display: 'flex',
            gap: '8px',
            marginTop: '12px',
            maxWidth: isView ? '400px' : 'none',
            margin: isView ? '12px auto 0' : '12px 0 0',
          }}>
            <ActionButton label="카카오톡 상담" color="#fee500" textColor="#3c1e1e" size={isView ? 'large' : 'small'} />
            <ActionButton label="네이버 예약" color="#03c75a" textColor="#fff" size={isView ? 'large' : 'small'} />
          </div>
        </div>
      </div>
    </div>
  )
}

function ActionButton({ label, color, textColor, size }) {
  return (
    <div style={{
      flex: 1,
      padding: size === 'large' ? '14px' : '10px',
      background: color,
      borderRadius: '8px',
      textAlign: 'center',
      fontSize: size === 'large' ? '15px' : '13px',
      fontWeight: '600',
      color: textColor,
      cursor: 'pointer',
    }}>
      {label}
    </div>
  )
}
