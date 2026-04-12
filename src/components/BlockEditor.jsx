import { useCallback, useRef } from 'react'

// AI 결과 → 블록 배열 변환
export function contentToBlocks(content) {
  const blocks = []
  const id = () => crypto.randomUUID()

  if (content.diagnosis) {
    blocks.push({ id: id(), type: 'section-title', content: '오늘의 진단' })
    blocks.push({ id: id(), type: 'text', content: content.diagnosis })
  }

  if (content.treatmentOptions?.length > 0) {
    blocks.push({ id: id(), type: 'section-title', content: '치료 옵션' })
    for (const opt of content.treatmentOptions) {
      blocks.push({ id: id(), type: 'option', ...opt })
    }
  }

  if (content.additionalNotes) {
    blocks.push({ id: id(), type: 'section-title', content: '함께 알아두실 사항' })
    blocks.push({ id: id(), type: 'text', content: content.additionalNotes })
  }

  return blocks
}

// 블록 배열 → 저장용 구조
export function blocksToContent(blocks) {
  const result = { diagnosis: '', treatmentOptions: [], additionalNotes: '' }
  let currentSection = ''

  for (const block of blocks) {
    if (block.type === 'section-title') {
      if (block.content.includes('진단')) currentSection = 'diagnosis'
      else if (block.content.includes('옵션')) currentSection = 'options'
      else if (block.content.includes('알아두')) currentSection = 'notes'
    } else if (block.type === 'text') {
      if (currentSection === 'diagnosis') result.diagnosis += (result.diagnosis ? '\n' : '') + block.content
      else if (currentSection === 'notes') result.additionalNotes += (result.additionalNotes ? '\n' : '') + block.content
    } else if (block.type === 'option') {
      result.treatmentOptions.push({
        name: block.name, description: block.description,
        duration: block.duration, note: block.note,
      })
    }
  }
  return result
}

export default function BlockEditor({ blocks, onChange }) {
  const fileInputRef = useRef(null)
  const activeTextRef = useRef(null) // 현재 포커스된 텍스트 블록 index
  const cursorPosRef = useRef(null) // 커서 위치

  const updateBlock = (blockId, updates) => {
    onChange(blocks.map((b) => (b.id === blockId ? { ...b, ...updates } : b)))
  }

  const removeBlock = (blockId) => {
    onChange(blocks.filter((b) => b.id !== blockId))
  }

  // 텍스트 블록을 커서 위치에서 분할하고 사진 삽입
  const insertPhotoAtCursor = useCallback((file) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const img = new Image()
      img.onload = () => {
        const ratio = img.naturalWidth / img.naturalHeight
        const ratioLabel = ratio > 1.8 ? '파노라마' : ratio > 1.2 ? '가로형' : ratio < 0.8 ? '세로형' : '정사각'

        const photoBlock = {
          id: crypto.randomUUID(),
          type: 'photo',
          file,
          preview: e.target.result,
          memo: '',
          ratio, ratioLabel,
          width: img.naturalWidth,
          height: img.naturalHeight,
        }

        const idx = activeTextRef.current
        const cursor = cursorPosRef.current

        // 텍스트 블록 안에서 커서 위치가 있으면 분할
        if (idx != null && cursor != null && blocks[idx]?.type === 'text') {
          const block = blocks[idx]
          const before = block.content.slice(0, cursor)
          const after = block.content.slice(cursor)

          const newBlocks = [...blocks]
          const insertItems = []

          if (before.trim()) {
            insertItems.push({ ...block, content: before })
          }
          insertItems.push(photoBlock)
          if (after.trim()) {
            insertItems.push({ id: crypto.randomUUID(), type: 'text', content: after })
          } else if (!before.trim()) {
            // 빈 텍스트면 그냥 사진만
          }

          newBlocks.splice(idx, 1, ...insertItems)
          onChange(newBlocks)
        } else {
          // 커서 위치 없으면 맨 끝에 추가
          onChange([...blocks, photoBlock])
        }

        activeTextRef.current = null
        cursorPosRef.current = null
      }
      img.src = e.target.result
    }
    reader.readAsDataURL(file)
  }, [blocks, onChange])

  // Ctrl+V 사진 붙여넣기 (텍스트 영역에서)
  const handlePaste = useCallback((e, blockIndex) => {
    const items = e.clipboardData?.items
    if (!items) return
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault()
        // 커서 위치 캡처
        activeTextRef.current = blockIndex
        cursorPosRef.current = e.target.selectionStart
        insertPhotoAtCursor(item.getAsFile())
        return
      }
    }
  }, [insertPhotoAtCursor])

  // 파일 선택기로 사진 삽입
  const handleToolbarPhoto = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = (e) => {
    for (const file of e.target.files) {
      if (file.type.startsWith('image/')) {
        insertPhotoAtCursor(file)
      }
    }
    e.target.value = ''
  }

  // 텍스트 영역 포커스/클릭 시 커서 위치 추적
  const trackCursor = (e, blockIndex) => {
    activeTextRef.current = blockIndex
    cursorPosRef.current = e.target.selectionStart
  }

  return (
    <div style={docStyles.wrapper}>
      {/* 상단 툴바 */}
      <div style={docStyles.toolbar}>
        <button onClick={handleToolbarPhoto} style={docStyles.toolbarBtn}>
          사진 삽입
        </button>
        <span style={docStyles.toolbarHint}>
          텍스트에 커서를 놓고 버튼 클릭 또는 Ctrl+V
        </span>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />

      {/* 문서 영역 */}
      <div style={docStyles.document}>
        {blocks.map((block, index) => {
          if (block.type === 'section-title') {
            return (
              <div key={block.id} style={docStyles.sectionTitle}>
                {block.content}
              </div>
            )
          }

          if (block.type === 'text') {
            return (
              <textarea
                key={block.id}
                value={block.content}
                onChange={(e) => updateBlock(block.id, { content: e.target.value })}
                onPaste={(e) => handlePaste(e, index)}
                onClick={(e) => trackCursor(e, index)}
                onKeyUp={(e) => trackCursor(e, index)}
                style={docStyles.textBlock}
                rows={Math.max(2, block.content.split('\n').length + 1)}
              />
            )
          }

          if (block.type === 'option') {
            return (
              <div key={block.id} style={docStyles.optionBlock}>
                <input
                  value={block.name}
                  onChange={(e) => updateBlock(block.id, { name: e.target.value })}
                  style={docStyles.optionName}
                  placeholder="옵션명"
                />
                <textarea
                  value={block.description}
                  onChange={(e) => updateBlock(block.id, { description: e.target.value })}
                  onPaste={(e) => handlePaste(e, index)}
                  onClick={(e) => trackCursor(e, index)}
                  onKeyUp={(e) => trackCursor(e, index)}
                  style={{ ...docStyles.textBlock, minHeight: '50px' }}
                  placeholder="설명"
                />
                <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                  <input
                    value={block.duration || ''}
                    onChange={(e) => updateBlock(block.id, { duration: e.target.value })}
                    style={docStyles.smallInput}
                    placeholder="예상 기간"
                  />
                  <input
                    value={block.note || ''}
                    onChange={(e) => updateBlock(block.id, { note: e.target.value })}
                    style={{ ...docStyles.smallInput, flex: 2 }}
                    placeholder="참고사항"
                  />
                </div>
              </div>
            )
          }

          if (block.type === 'photo') {
            return (
              <div key={block.id} style={docStyles.photoInline}>
                <div style={{ position: 'relative', display: 'inline-block' }}>
                  <img
                    src={block.preview || block.url}
                    alt={block.memo || '사진'}
                    style={docStyles.photoImg}
                  />
                  <button onClick={() => removeBlock(block.id)} style={docStyles.removeBtn}>
                    ×
                  </button>
                </div>
                <input
                  value={block.memo}
                  onChange={(e) => updateBlock(block.id, { memo: e.target.value })}
                  placeholder="사진 설명 입력"
                  style={docStyles.captionInput}
                />
              </div>
            )
          }

          return null
        })}
      </div>
    </div>
  )
}

const docStyles = {
  wrapper: {
    border: '1px solid #d1d5db',
    borderRadius: '8px',
    overflow: 'hidden',
    background: '#fff',
  },
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '8px 12px',
    background: '#f3f4f6',
    borderBottom: '1px solid #d1d5db',
  },
  toolbarBtn: {
    padding: '6px 14px',
    background: '#7c3aed',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    fontSize: '13px',
    fontWeight: '600',
    cursor: 'pointer',
  },
  toolbarHint: {
    fontSize: '12px',
    color: '#9ca3af',
  },
  document: {
    padding: '24px 28px',
    minHeight: '400px',
    lineHeight: '1.8',
    fontSize: '14px',
  },
  sectionTitle: {
    fontSize: '16px',
    fontWeight: '700',
    color: '#1e3a5f',
    borderBottom: '2px solid #1e3a5f',
    paddingBottom: '4px',
    marginTop: '20px',
    marginBottom: '10px',
  },
  textBlock: {
    width: '100%',
    border: 'none',
    outline: 'none',
    fontSize: '14px',
    lineHeight: '1.8',
    resize: 'none',
    padding: '4px 0',
    fontFamily: 'inherit',
    color: '#374151',
    background: 'transparent',
    overflow: 'hidden',
    boxSizing: 'border-box',
  },
  optionBlock: {
    padding: '12px 16px',
    margin: '8px 0',
    background: '#f0f7ff',
    borderRadius: '8px',
    borderLeft: '3px solid #3b82f6',
  },
  optionName: {
    width: '100%',
    border: 'none',
    outline: 'none',
    fontSize: '15px',
    fontWeight: '700',
    color: '#1e3a5f',
    background: 'transparent',
    padding: '2px 0',
    marginBottom: '4px',
    boxSizing: 'border-box',
  },
  smallInput: {
    flex: 1,
    padding: '4px 8px',
    border: '1px solid #bfdbfe',
    borderRadius: '4px',
    fontSize: '12px',
    background: '#fff',
  },
  photoInline: {
    margin: '12px 0',
    textAlign: 'center',
  },
  photoImg: {
    maxWidth: '100%',
    maxHeight: '250px',
    borderRadius: '6px',
    objectFit: 'contain',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
  },
  removeBtn: {
    position: 'absolute',
    top: '-8px',
    right: '-8px',
    width: '24px',
    height: '24px',
    borderRadius: '50%',
    background: '#ef4444',
    color: '#fff',
    border: 'none',
    fontSize: '14px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  captionInput: {
    display: 'block',
    margin: '6px auto 0',
    padding: '4px 10px',
    border: 'none',
    borderBottom: '1px solid #d1d5db',
    fontSize: '12px',
    color: '#6b7280',
    textAlign: 'center',
    background: 'transparent',
    outline: 'none',
    width: '80%',
    fontStyle: 'italic',
  },
}
