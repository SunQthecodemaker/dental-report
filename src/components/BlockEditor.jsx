import { useCallback, useRef } from 'react'

// 블록 타입: heading, text, option, photo
// AI 생성 결과를 블록 배열로 변환
export function contentToBlocks(content) {
  const blocks = []
  const id = () => crypto.randomUUID()

  blocks.push({ id: id(), type: 'heading', content: '오늘의 진단' })
  blocks.push({ id: id(), type: 'text', content: content.diagnosis || '' })

  if (content.treatmentOptions?.length > 0) {
    blocks.push({ id: id(), type: 'heading', content: '치료 옵션' })
    for (const opt of content.treatmentOptions) {
      blocks.push({ id: id(), type: 'option', ...opt })
    }
  }

  if (content.additionalNotes) {
    blocks.push({ id: id(), type: 'heading', content: '함께 알아두실 사항' })
    blocks.push({ id: id(), type: 'text', content: content.additionalNotes })
  }

  return blocks
}

// 블록 배열을 저장용 구조로 변환
export function blocksToContent(blocks) {
  const result = { diagnosis: '', treatmentOptions: [], additionalNotes: '' }
  let currentSection = ''

  for (const block of blocks) {
    if (block.type === 'heading') {
      if (block.content.includes('진단')) currentSection = 'diagnosis'
      else if (block.content.includes('옵션')) currentSection = 'options'
      else if (block.content.includes('알아두')) currentSection = 'notes'
    } else if (block.type === 'text') {
      if (currentSection === 'diagnosis') result.diagnosis = block.content
      else if (currentSection === 'notes') result.additionalNotes = block.content
    } else if (block.type === 'option') {
      result.treatmentOptions.push({
        name: block.name,
        description: block.description,
        duration: block.duration,
        note: block.note,
      })
    }
  }

  return result
}

export default function BlockEditor({ blocks, onChange }) {
  const fileInputRef = useRef(null)
  const insertIndexRef = useRef(null)

  const updateBlock = (blockId, updates) => {
    onChange(blocks.map((b) => (b.id === blockId ? { ...b, ...updates } : b)))
  }

  const removeBlock = (blockId) => {
    onChange(blocks.filter((b) => b.id !== blockId))
  }

  const insertPhotoAt = (index) => {
    insertIndexRef.current = index
    fileInputRef.current?.click()
  }

  const addPhotoFromFile = useCallback(
    (file, insertIndex) => {
      const reader = new FileReader()
      reader.onload = (e) => {
        const img = new Image()
        img.onload = () => {
          const ratio = img.naturalWidth / img.naturalHeight
          const ratioLabel =
            ratio > 1.8 ? '파노라마' : ratio > 1.2 ? '가로형' : ratio < 0.8 ? '세로형' : '정사각'

          const photoBlock = {
            id: crypto.randomUUID(),
            type: 'photo',
            file,
            preview: e.target.result,
            memo: '',
            ratio,
            ratioLabel,
            width: img.naturalWidth,
            height: img.naturalHeight,
          }

          const newBlocks = [...blocks]
          newBlocks.splice(insertIndex, 0, photoBlock)
          onChange(newBlocks)
        }
        img.src = e.target.result
      }
      reader.readAsDataURL(file)
    },
    [blocks, onChange]
  )

  const handleFileChange = (e) => {
    const files = e.target.files
    const idx = insertIndexRef.current ?? blocks.length
    for (let i = 0; i < files.length; i++) {
      if (files[i].type.startsWith('image/')) {
        addPhotoFromFile(files[i], idx + i)
      }
    }
    e.target.value = ''
  }

  // 블록 영역에서 Ctrl+V로 사진 붙여넣기
  const handlePaste = useCallback(
    (e, afterIndex) => {
      const items = e.clipboardData?.items
      if (!items) return
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          e.preventDefault()
          addPhotoFromFile(item.getAsFile(), afterIndex)
          return
        }
      }
    },
    [addPhotoFromFile]
  )

  return (
    <div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />

      {blocks.map((block, index) => (
        <div key={block.id}>
          {/* 사진 삽입 버튼 (각 블록 위) */}
          <InsertBar
            onInsertPhoto={() => insertPhotoAt(index)}
            onPaste={(e) => handlePaste(e, index)}
          />

          {/* 블록 렌더링 */}
          {block.type === 'heading' && (
            <div style={styles.heading}>{block.content}</div>
          )}

          {block.type === 'text' && (
            <textarea
              value={block.content}
              onChange={(e) => updateBlock(block.id, { content: e.target.value })}
              onPaste={(e) => handlePaste(e, index + 1)}
              style={styles.textarea}
              rows={Math.max(3, block.content.split('\n').length + 1)}
            />
          )}

          {block.type === 'option' && (
            <div style={styles.optionCard}>
              <input
                value={block.name}
                onChange={(e) => updateBlock(block.id, { name: e.target.value })}
                style={styles.optionName}
                placeholder="옵션명"
              />
              <textarea
                value={block.description}
                onChange={(e) => updateBlock(block.id, { description: e.target.value })}
                style={{ ...styles.textarea, minHeight: '60px' }}
                placeholder="설명"
              />
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  value={block.duration || ''}
                  onChange={(e) => updateBlock(block.id, { duration: e.target.value })}
                  style={styles.smallInput}
                  placeholder="예상 기간"
                />
                <input
                  value={block.note || ''}
                  onChange={(e) => updateBlock(block.id, { note: e.target.value })}
                  style={{ ...styles.smallInput, flex: 2 }}
                  placeholder="참고사항"
                />
              </div>
            </div>
          )}

          {block.type === 'photo' && (
            <div style={styles.photoBlock}>
              <div style={{ position: 'relative', display: 'inline-block' }}>
                <img
                  src={block.preview || block.url}
                  alt={block.memo || '사진'}
                  style={styles.photoImg}
                />
                <button
                  onClick={() => removeBlock(block.id)}
                  style={styles.removeBtn}
                >
                  ×
                </button>
              </div>
              <input
                value={block.memo}
                onChange={(e) => updateBlock(block.id, { memo: e.target.value })}
                placeholder="사진 설명 (브로셔에 캡션으로 표시됩니다)"
                style={styles.memoInput}
              />
              <div style={styles.photoMeta}>
                {block.ratioLabel} · {block.width}×{block.height}
              </div>
            </div>
          )}
        </div>
      ))}

      {/* 마지막 블록 뒤에도 삽입 버튼 */}
      {blocks.length > 0 && (
        <InsertBar
          onInsertPhoto={() => insertPhotoAt(blocks.length)}
          onPaste={(e) => handlePaste(e, blocks.length)}
        />
      )}
    </div>
  )
}

function InsertBar({ onInsertPhoto, onPaste }) {
  return (
    <div
      style={styles.insertBar}
      onPaste={onPaste}
      tabIndex={-1}
    >
      <div style={styles.insertLine} />
      <button onClick={onInsertPhoto} style={styles.insertBtn} title="사진 삽입">
        + 사진
      </button>
      <div style={styles.insertLine} />
    </div>
  )
}

const styles = {
  heading: {
    fontSize: '15px',
    fontWeight: '700',
    color: '#1e3a5f',
    padding: '8px 0 4px',
    borderBottom: '2px solid #e5e7eb',
    marginBottom: '8px',
  },
  textarea: {
    width: '100%',
    padding: '10px 12px',
    border: '1px solid #e5e7eb',
    borderRadius: '8px',
    fontSize: '14px',
    lineHeight: '1.7',
    resize: 'vertical',
    fontFamily: 'inherit',
    background: '#fff',
    boxSizing: 'border-box',
  },
  optionCard: {
    padding: '12px',
    border: '1px solid #bfdbfe',
    borderRadius: '10px',
    background: '#f0f7ff',
    marginBottom: '4px',
  },
  optionName: {
    width: '100%',
    padding: '6px 10px',
    border: '1px solid #bfdbfe',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: '600',
    color: '#1e3a5f',
    marginBottom: '8px',
    boxSizing: 'border-box',
  },
  smallInput: {
    flex: 1,
    padding: '6px 10px',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    fontSize: '13px',
  },
  photoBlock: {
    padding: '12px',
    background: '#f9fafb',
    borderRadius: '10px',
    border: '1px solid #e5e7eb',
    textAlign: 'center',
  },
  photoImg: {
    maxWidth: '100%',
    maxHeight: '200px',
    borderRadius: '8px',
    objectFit: 'contain',
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
  memoInput: {
    width: '100%',
    padding: '8px 10px',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    fontSize: '13px',
    marginTop: '8px',
    textAlign: 'center',
    boxSizing: 'border-box',
  },
  photoMeta: {
    fontSize: '11px',
    color: '#9ca3af',
    marginTop: '4px',
  },
  insertBar: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '4px 0',
    opacity: 0.4,
    transition: 'opacity 0.2s',
    outline: 'none',
  },
  insertLine: {
    flex: 1,
    height: '1px',
    background: '#d1d5db',
  },
  insertBtn: {
    padding: '2px 10px',
    fontSize: '11px',
    color: '#7c3aed',
    background: '#f3f0ff',
    border: '1px solid #ddd6fe',
    borderRadius: '12px',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    fontWeight: '600',
  },
}
