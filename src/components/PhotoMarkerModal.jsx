import { useEffect, useRef, useState } from 'react'
import { Arrow, CircleMark } from './MarkingOverlay'

/**
 * PhotoMarkerModal — 사진 위에 화살표/원을 그리는 모달 편집기.
 *
 * props:
 *   src: 이미지 URL
 *   initialMarkings: Array (기존 마킹)
 *   onSave(markings): 저장 콜백
 *   onClose(): 닫기 콜백
 */

const TOOLS = [
  { id: 'select', label: '선택', icon: '↖' },
  { id: 'arrow',  label: '화살표', icon: '↘' },
  { id: 'circle', label: '원',    icon: '○' },
]

const MIN_DRAG = 0.01  // 1% 미만이면 클릭으로 보고 무시

export default function PhotoMarkerModal({ src, initialMarkings = [], onSave, onClose }) {
  const [markings, setMarkings] = useState(() =>
    Array.isArray(initialMarkings) ? initialMarkings.map(m => ({ ...m })) : []
  )
  const [tool, setTool] = useState('arrow')
  const [selectedId, setSelectedId] = useState(null)
  const [drawing, setDrawing] = useState(null) // { type, startX, startY, curX, curY }
  const [dragging, setDragging] = useState(null) // { id, start:{x,y}, orig:{...shape} }

  const svgRef = useRef(null)

  // 키보드: Delete/Backspace → 선택 삭제, Esc → 닫기
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') { onClose?.(); return }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
        e.preventDefault()
        setMarkings(ms => ms.filter(m => m.id !== selectedId))
        setSelectedId(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedId, onClose])

  const pointFromEvent = (e) => {
    const rect = svgRef.current.getBoundingClientRect()
    const x = (e.clientX - rect.left) / rect.width
    const y = (e.clientY - rect.top) / rect.height
    return { x: clamp01(x), y: clamp01(y) }
  }

  // shape mousedown → 드래그 이동 시작 (툴 무관, 기존 shape 위에서는 항상 이동 가능)
  const onShapeMouseDown = (e, shape) => {
    if (drawing) return
    const { x, y } = pointFromEvent(e)
    setSelectedId(shape.id)
    setDragging({ id: shape.id, start: { x, y }, orig: { ...shape } })
  }

  const onMouseDown = (e) => {
    // 빈 곳 클릭
    if (tool === 'select') {
      if (e.target === svgRef.current) setSelectedId(null)
      return
    }
    // 그리기 도구 (arrow/circle): 빈 곳에서 드래그 시작
    if (e.target !== svgRef.current) return  // shape hit은 shape 핸들러가 처리
    const { x, y } = pointFromEvent(e)
    setDrawing({ type: tool, startX: x, startY: y, curX: x, curY: y })
    setSelectedId(null)
  }

  const onMouseMove = (e) => {
    // 드래그 이동
    if (dragging) {
      const { x, y } = pointFromEvent(e)
      const rawDx = x - dragging.start.x
      const rawDy = y - dragging.start.y
      const { dx, dy } = clampDelta(dragging.orig, rawDx, rawDy)
      setMarkings(ms => ms.map(m => {
        if (m.id !== dragging.id) return m
        const o = dragging.orig
        if (o.type === 'arrow') {
          return { ...m, x1: o.x1 + dx, y1: o.y1 + dy, x2: o.x2 + dx, y2: o.y2 + dy }
        }
        if (o.type === 'circle') {
          return { ...m, cx: o.cx + dx, cy: o.cy + dy }
        }
        return m
      }))
      return
    }
    if (!drawing) return
    const { x, y } = pointFromEvent(e)
    setDrawing(d => d ? { ...d, curX: x, curY: y } : d)
  }

  const onMouseUp = () => {
    if (dragging) { setDragging(null); return }
    if (!drawing) return
    const { type, startX, startY, curX, curY } = drawing
    const dx = Math.abs(curX - startX)
    const dy = Math.abs(curY - startY)
    if (dx < MIN_DRAG && dy < MIN_DRAG) { setDrawing(null); return }

    let newMark
    if (type === 'arrow') {
      newMark = { id: uid(), type: 'arrow', x1: startX, y1: startY, x2: curX, y2: curY }
    } else if (type === 'circle') {
      newMark = {
        id: uid(), type: 'circle',
        cx: (startX + curX) / 2, cy: (startY + curY) / 2,
        rx: dx / 2, ry: dy / 2,
      }
    }
    if (newMark) {
      setMarkings(ms => [...ms, newMark])
      setSelectedId(newMark.id)
    }
    setDrawing(null)
  }

  const removeSelected = () => {
    if (!selectedId) return
    setMarkings(ms => ms.filter(m => m.id !== selectedId))
    setSelectedId(null)
  }

  const clearAll = () => {
    if (!markings.length) return
    if (!confirm('모든 마킹을 삭제할까요?')) return
    setMarkings([])
    setSelectedId(null)
  }

  const handleSave = () => {
    onSave?.(markings)
    onClose?.()
  }

  // 그리는 중 미리보기 shape
  const previewShape = drawing ? buildPreviewShape(drawing) : null

  return (
    <div style={S.backdrop} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.() }}>
      <div style={S.modal} onMouseDown={(e) => e.stopPropagation()}>
        {/* ── 툴바 ── */}
        <div style={S.toolbar}>
          <div style={S.toolGroup}>
            {TOOLS.map(t => (
              <button
                key={t.id}
                onClick={() => setTool(t.id)}
                style={{ ...S.toolBtn, ...(tool === t.id ? S.toolBtnActive : {}) }}
                title={t.label}
              >
                <span style={S.toolIcon}>{t.icon}</span>
                <span>{t.label}</span>
              </button>
            ))}
          </div>

          <div style={S.hint}>
            {tool === 'select' && '마킹 드래그하여 이동 · 선택 후 Delete 삭제'}
            {tool === 'arrow' && '빈 곳 드래그 → 화살표 · 기존 마킹 드래그 → 이동'}
            {tool === 'circle' && '빈 곳 드래그 → 원 · 기존 마킹 드래그 → 이동'}
          </div>

          <div style={S.toolGroup}>
            <button onClick={removeSelected} disabled={!selectedId} style={S.secondaryBtn}>
              선택 삭제
            </button>
            <button onClick={clearAll} disabled={!markings.length} style={S.secondaryBtn}>
              모두 지우기
            </button>
            <button onClick={onClose} style={S.cancelBtn}>취소</button>
            <button onClick={handleSave} style={S.saveBtn}>저장</button>
          </div>
        </div>

        {/* ── 캔버스 ── */}
        <div style={S.canvasWrap}>
          <div style={S.canvas}>
            <img src={src} alt="" style={S.img} draggable={false} />
            <svg
              ref={svgRef}
              viewBox="0 0 1 1"
              preserveAspectRatio="none"
              style={{
                ...S.svg,
                cursor: tool === 'select' ? 'default' : 'crosshair',
              }}
              onMouseDown={onMouseDown}
              onMouseMove={onMouseMove}
              onMouseUp={onMouseUp}
              onMouseLeave={onMouseUp}
            >
              {markings.map(m => {
                const selected = selectedId === m.id
                if (m.type === 'arrow') return <Arrow key={m.id} m={m} selected={selected} onPick={onShapeMouseDown} />
                if (m.type === 'circle') return <CircleMark key={m.id} m={m} selected={selected} onPick={onShapeMouseDown} />
                return null
              })}
              {previewShape}
            </svg>
          </div>
        </div>

        <div style={S.footer}>
          총 {markings.length}개 마킹 · 기존 마킹은 드래그로 이동 · Esc 닫기 · Delete 선택 삭제
        </div>
      </div>
    </div>
  )
}

function buildPreviewShape({ type, startX, startY, curX, curY }) {
  if (type === 'arrow') {
    return <Arrow m={{ id: '_preview', type: 'arrow', x1: startX, y1: startY, x2: curX, y2: curY }} />
  }
  if (type === 'circle') {
    const cx = (startX + curX) / 2
    const cy = (startY + curY) / 2
    const rx = Math.abs(curX - startX) / 2
    const ry = Math.abs(curY - startY) / 2
    return <CircleMark m={{ id: '_preview', type: 'circle', cx, cy, rx, ry }} />
  }
  return null
}

function uid() {
  return (crypto.randomUUID?.() || `m_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`)
}

function clamp01(v) { return Math.max(0, Math.min(1, v)) }

/** 드래그 이동 시 shape의 모든 좌표가 0~1 범위를 벗어나지 않도록 delta 제한 */
function clampDelta(orig, dx, dy) {
  if (orig.type === 'arrow') {
    const minX = Math.min(orig.x1, orig.x2)
    const maxX = Math.max(orig.x1, orig.x2)
    const minY = Math.min(orig.y1, orig.y2)
    const maxY = Math.max(orig.y1, orig.y2)
    dx = Math.max(dx, -minX)
    dx = Math.min(dx, 1 - maxX)
    dy = Math.max(dy, -minY)
    dy = Math.min(dy, 1 - maxY)
    return { dx, dy }
  }
  if (orig.type === 'circle') {
    // 중심 기준으로만 클램프 (rx/ry는 사진 밖으로 약간 삐져나가도 시각적으로 OK)
    dx = Math.max(dx, -orig.cx)
    dx = Math.min(dx, 1 - orig.cx)
    dy = Math.max(dy, -orig.cy)
    dy = Math.min(dy, 1 - orig.cy)
    return { dx, dy }
  }
  return { dx, dy }
}

const S = {
  backdrop: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.78)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999,
  },
  modal: {
    background: '#1a1a18', borderRadius: '12px',
    width: 'min(1100px, 96vw)', maxHeight: '94vh',
    display: 'flex', flexDirection: 'column', overflow: 'hidden',
    boxShadow: '0 30px 80px rgba(0,0,0,0.5)',
  },
  toolbar: {
    display: 'flex', alignItems: 'center', gap: 14,
    padding: '10px 16px', background: '#26261f',
    borderBottom: '1px solid #3a3a32', flexWrap: 'wrap',
  },
  toolGroup: { display: 'flex', gap: 6, alignItems: 'center' },
  toolBtn: {
    display: 'flex', alignItems: 'center', gap: 6,
    padding: '6px 12px', background: '#1a1a18', color: '#d4c8b4',
    border: '1px solid #3a3a32', borderRadius: 6,
    fontSize: 12, fontWeight: 600, cursor: 'pointer',
  },
  toolBtnActive: { background: '#b5976a', color: '#1a1a18', borderColor: '#b5976a' },
  toolIcon: { fontSize: 14, lineHeight: 1 },
  hint: { flex: 1, textAlign: 'center', fontSize: 12, color: '#9ca3af' },
  secondaryBtn: {
    padding: '6px 12px', background: '#1a1a18', color: '#9ca3af',
    border: '1px solid #3a3a32', borderRadius: 6,
    fontSize: 12, fontWeight: 500, cursor: 'pointer',
  },
  cancelBtn: {
    padding: '6px 14px', background: 'transparent', color: '#9ca3af',
    border: '1px solid #3a3a32', borderRadius: 6,
    fontSize: 12, fontWeight: 600, cursor: 'pointer',
  },
  saveBtn: {
    padding: '6px 16px', background: '#b5976a', color: '#1a1a18',
    border: 'none', borderRadius: 6,
    fontSize: 12, fontWeight: 700, cursor: 'pointer',
  },
  canvasWrap: {
    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: 24, background: '#0e0e0c', overflow: 'auto',
  },
  canvas: {
    position: 'relative', display: 'inline-block',
    maxWidth: '100%', maxHeight: '76vh',
    boxShadow: '0 10px 30px rgba(0,0,0,0.4)',
  },
  img: {
    display: 'block', maxWidth: '100%', maxHeight: '76vh',
    userSelect: 'none', pointerEvents: 'none',
  },
  svg: {
    position: 'absolute', inset: 0, width: '100%', height: '100%',
    overflow: 'visible',
  },
  footer: {
    padding: '8px 16px', background: '#26261f',
    borderTop: '1px solid #3a3a32',
    fontSize: 11, color: '#6b6a60', textAlign: 'center',
  },
}
