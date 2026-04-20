/**
 * MarkingOverlay — 사진 위에 화살표/원 마킹을 렌더링하는 SVG 오버레이.
 *
 * 좌표는 0~1 정규화 (viewBox 0 0 1 1). 이미지 표시 크기 무관.
 * 부모는 position:relative, 이미지는 width:100%이어야 정확히 겹침.
 *
 * props:
 *   markings: Array<{ id, type:'arrow'|'circle', ...coords, color? }>
 *   editable: 편집기에서 호버/선택 효과
 *   selectedId: 선택된 shape
 *   onPickShape: (id) => void  (편집기 선택 지원)
 */

const DEFAULT_COLOR = '#ef4444'
const STROKE = 0.008  // 이미지 폭 대비 0.8%
const HEAD_LEN = 0.035
const HEAD_HALF = 0.018

export function Arrow({ m, selected, onPick }) {
  const { x1, y1, x2, y2, color = DEFAULT_COLOR } = m
  const angle = Math.atan2(y2 - y1, x2 - x1)
  // 화살촉 좌우 꼭지점
  const hx1 = x2 - HEAD_LEN * Math.cos(angle) + HEAD_HALF * Math.sin(angle)
  const hy1 = y2 - HEAD_LEN * Math.sin(angle) - HEAD_HALF * Math.cos(angle)
  const hx2 = x2 - HEAD_LEN * Math.cos(angle) - HEAD_HALF * Math.sin(angle)
  const hy2 = y2 - HEAD_LEN * Math.sin(angle) + HEAD_HALF * Math.cos(angle)
  // 선은 화살촉 직전까지만 그려서 촉이 깨끗하게 닫힘
  const tipCut = HEAD_LEN * 0.85
  const lx2 = x2 - tipCut * Math.cos(angle)
  const ly2 = y2 - tipCut * Math.sin(angle)

  const onClick = onPick ? (e) => { e.stopPropagation(); onPick(m.id) } : undefined
  const hit = selected ? STROKE * 2 : STROKE
  return (
    <g onMouseDown={onClick} style={{ cursor: onPick ? 'pointer' : 'default' }}>
      {/* 보이지 않는 hit 영역 */}
      {onPick && (
        <line x1={x1} y1={y1} x2={x2} y2={y2}
              stroke="transparent" strokeWidth={STROKE * 4}
              strokeLinecap="round" />
      )}
      <line x1={x1} y1={y1} x2={lx2} y2={ly2}
            stroke={color} strokeWidth={hit}
            strokeLinecap="round" />
      <polygon points={`${x2},${y2} ${hx1},${hy1} ${hx2},${hy2}`} fill={color} />
      {selected && (
        <>
          <circle cx={x1} cy={y1} r={STROKE * 1.5} fill="#fff" stroke={color} strokeWidth={STROKE * 0.5} />
          <circle cx={x2} cy={y2} r={STROKE * 1.5} fill="#fff" stroke={color} strokeWidth={STROKE * 0.5} />
        </>
      )}
    </g>
  )
}

export function CircleMark({ m, selected, onPick }) {
  const { cx, cy, rx, ry, color = DEFAULT_COLOR } = m
  const onClick = onPick ? (e) => { e.stopPropagation(); onPick(m.id) } : undefined
  const hit = selected ? STROKE * 2 : STROKE
  return (
    <g onMouseDown={onClick} style={{ cursor: onPick ? 'pointer' : 'default' }}>
      {onPick && (
        <ellipse cx={cx} cy={cy} rx={rx} ry={ry}
                 stroke="transparent" strokeWidth={STROKE * 4} fill="none" />
      )}
      <ellipse cx={cx} cy={cy} rx={rx} ry={ry}
               stroke={color} strokeWidth={hit} fill="none" />
    </g>
  )
}

export default function MarkingOverlay({ markings, editable = false, selectedId = null, onPickShape, children }) {
  const list = Array.isArray(markings) ? markings : []
  if (list.length === 0 && !children) return null
  return (
    <svg
      viewBox="0 0 1 1"
      preserveAspectRatio="none"
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: editable ? 'auto' : 'none',
        overflow: 'visible',
      }}
    >
      {list.map(m => {
        const common = { key: m.id, m, selected: selectedId === m.id, onPick: editable ? onPickShape : null }
        if (m.type === 'arrow') return <Arrow {...common} />
        if (m.type === 'circle') return <CircleMark {...common} />
        return null
      })}
      {children}
    </svg>
  )
}

