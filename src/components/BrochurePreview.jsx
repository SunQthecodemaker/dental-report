export default function BrochurePreview({ patientName, consultDate, blocks, modules }) {
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
    <div style={{ fontSize: '14px', lineHeight: '1.7', color: '#1f2937' }}>
      {/* 헤더 */}
      <div style={{
        background: 'linear-gradient(135deg, #1e3a5f 0%, #2d5a87 100%)',
        color: '#fff',
        padding: '28px 20px',
        textAlign: 'center',
      }}>
        <div style={{ fontSize: '11px', letterSpacing: '3px', opacity: 0.8, marginBottom: '4px' }}>
          PRIME S DENTAL
        </div>
        <div style={{ fontSize: '18px', fontWeight: '700', marginBottom: '4px' }}>
          프라임S치과교정과
        </div>
        <div style={{ fontSize: '11px', opacity: 0.7 }}>
          교정과 · 치주과 · 구강내과 전문의 협진
        </div>
        <div style={{
          marginTop: '16px',
          padding: '12px',
          background: 'rgba(255,255,255,0.1)',
          borderRadius: '8px',
        }}>
          <div style={{ fontSize: '15px', fontWeight: '600' }}>
            {patientName || '○○○'}님 초진 상담 결과서
          </div>
          <div style={{ fontSize: '12px', opacity: 0.8, marginTop: '2px' }}>
            상담일 {consultDate || '____-__-__'}
          </div>
        </div>
      </div>

      {/* 본문: 블록 순서대로 렌더링 */}
      <div style={{ padding: '20px' }}>
        {blocks.map((block) => {
          if (block.type === 'heading') {
            const icon = block.content.includes('진단') ? '🔍' :
              block.content.includes('옵션') ? '💊' : '📋'
            return (
              <div key={block.id} style={{
                fontSize: '15px',
                fontWeight: '700',
                color: '#1e3a5f',
                marginTop: '16px',
                marginBottom: '8px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}>
                <span>{icon}</span> {block.content}
              </div>
            )
          }

          if (block.type === 'text') {
            return (
              <div key={block.id} style={{
                padding: '14px 16px',
                background: '#fff',
                borderRadius: '10px',
                border: '1px solid #e5e7eb',
                fontSize: '13px',
                color: '#374151',
                lineHeight: '1.8',
                marginBottom: '8px',
                whiteSpace: 'pre-wrap',
              }}>
                {block.content}
              </div>
            )
          }

          if (block.type === 'option') {
            return (
              <div key={block.id} style={{
                padding: '12px',
                background: '#eff6ff',
                borderRadius: '8px',
                marginBottom: '8px',
                border: '1px solid #bfdbfe',
              }}>
                <div style={{ fontSize: '14px', fontWeight: '600', color: '#1e3a5f', marginBottom: '4px' }}>
                  {block.name}
                </div>
                <div style={{ fontSize: '13px', color: '#4b5563' }}>
                  {block.description}
                </div>
                {block.duration && (
                  <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
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
              <div key={block.id} style={{ marginBottom: '10px', textAlign: 'center' }}>
                <img
                  src={src}
                  alt={block.memo || '진료 사진'}
                  style={{
                    width: '100%',
                    borderRadius: '8px',
                    maxHeight: block.ratio > 1.5 ? '160px' : '220px',
                    objectFit: 'cover',
                  }}
                />
                {block.memo && (
                  <div style={{
                    fontSize: '12px',
                    color: '#6b7280',
                    marginTop: '6px',
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
        padding: '20px',
        borderTop: '1px solid #e5e7eb',
      }}>
        <div style={{
          display: 'flex',
          gap: '12px',
          alignItems: 'center',
          marginBottom: '16px',
        }}>
          <div style={{
            width: '56px',
            height: '56px',
            borderRadius: '50%',
            background: '#1e3a5f',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            fontSize: '20px',
            fontWeight: '700',
            flexShrink: 0,
          }}>
            Dr
          </div>
          <div>
            <div style={{ fontSize: '14px', fontWeight: '700', color: '#1e3a5f' }}>
              원장명
            </div>
            <div style={{ fontSize: '11px', color: '#6b7280', lineHeight: '1.5' }}>
              대한치과교정학회<br />
              세계교정학회<br />
              오스템 마스터코스 강사
            </div>
          </div>
        </div>

        <div style={{
          fontSize: '12px',
          color: '#6b7280',
          textAlign: 'center',
          padding: '12px',
          background: '#fff',
          borderRadius: '8px',
          border: '1px solid #e5e7eb',
        }}>
          부평역 지하상가 15번 출구 앞
        </div>

        <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
          <ActionButton label="카카오톡 상담" color="#fee500" textColor="#3c1e1e" />
          <ActionButton label="네이버 예약" color="#03c75a" textColor="#fff" />
        </div>
      </div>
    </div>
  )
}

function ActionButton({ label, color, textColor }) {
  return (
    <div style={{
      flex: 1,
      padding: '10px',
      background: color,
      borderRadius: '8px',
      textAlign: 'center',
      fontSize: '13px',
      fontWeight: '600',
      color: textColor,
      cursor: 'pointer',
    }}>
      {label}
    </div>
  )
}
