import { useCallback } from 'react'

export default function PhotoUploader({ photos, onChange }) {
  // Ctrl+V 또는 드래그 앤 드롭으로 사진 추가
  const handlePaste = useCallback(
    (e) => {
      const items = e.clipboardData?.items
      if (!items) return

      for (const item of items) {
        if (item.type.startsWith('image/')) {
          e.preventDefault()
          const file = item.getAsFile()
          addPhoto(file)
        }
      }
    },
    [photos]
  )

  const handleDrop = useCallback(
    (e) => {
      e.preventDefault()
      const files = e.dataTransfer?.files
      if (!files) return

      for (const file of files) {
        if (file.type.startsWith('image/')) {
          addPhoto(file)
        }
      }
    },
    [photos]
  )

  const addPhoto = (file) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const img = new Image()
      img.onload = () => {
        const ratio = img.naturalWidth / img.naturalHeight
        const ratioLabel =
          ratio > 1.8 ? '파노라마(가로형)' :
          ratio > 1.2 ? '가로형' :
          ratio < 0.8 ? '세로형' : '정사각'

        onChange((prev) => [
          ...prev,
          {
            file,
            preview: e.target.result,
            memo: '',
            ratio,
            ratioLabel,
            width: img.naturalWidth,
            height: img.naturalHeight,
          },
        ])
      }
      img.src = e.target.result
    }
    reader.readAsDataURL(file)
  }

  const handleFileSelect = (e) => {
    const files = e.target.files
    for (const file of files) {
      if (file.type.startsWith('image/')) {
        addPhoto(file)
      }
    }
    e.target.value = ''
  }

  const updateMemo = (index, memo) => {
    onChange((prev) =>
      prev.map((p, i) => (i === index ? { ...p, memo } : p))
    )
  }

  const removePhoto = (index) => {
    onChange((prev) => prev.filter((_, i) => i !== index))
  }

  return (
    <div
      onPaste={handlePaste}
      onDrop={handleDrop}
      onDragOver={(e) => e.preventDefault()}
      tabIndex={0}
      style={{
        border: '2px dashed #d1d5db',
        borderRadius: '12px',
        padding: '16px',
        background: '#fff',
        outline: 'none',
      }}
    >
      {photos.length === 0 && (
        <div style={{
          textAlign: 'center',
          padding: '32px',
          color: '#9ca3af',
        }}>
          <div style={{ fontSize: '32px', marginBottom: '8px' }}>📋</div>
          <div style={{ fontSize: '14px' }}>
            Ctrl+V로 사진 붙여넣기 또는 드래그 앤 드롭
          </div>
          <label style={{
            display: 'inline-block',
            marginTop: '12px',
            padding: '8px 16px',
            background: '#f3f4f6',
            borderRadius: '8px',
            fontSize: '13px',
            cursor: 'pointer',
            color: '#374151',
          }}>
            파일 선택
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={handleFileSelect}
              style={{ display: 'none' }}
            />
          </label>
        </div>
      )}

      {photos.map((photo, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            gap: '12px',
            alignItems: 'flex-start',
            marginBottom: '12px',
            padding: '12px',
            background: '#f9fafb',
            borderRadius: '8px',
          }}
        >
          <div style={{ position: 'relative' }}>
            <img
              src={photo.preview}
              alt={`사진 ${i + 1}`}
              style={{
                width: '120px',
                height: '90px',
                objectFit: 'cover',
                borderRadius: '8px',
              }}
            />
            <button
              onClick={() => removePhoto(i)}
              style={{
                position: 'absolute',
                top: '-6px',
                right: '-6px',
                width: '22px',
                height: '22px',
                borderRadius: '50%',
                background: '#ef4444',
                color: '#fff',
                border: 'none',
                fontSize: '12px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              ×
            </button>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{
              fontSize: '12px',
              color: '#9ca3af',
              marginBottom: '6px',
            }}>
              사진 {i + 1} · {photo.ratioLabel} ({photo.width}×{photo.height})
            </div>
            <input
              type="text"
              placeholder="이 사진으로 보여주고 싶은 내용을 한 줄로 입력"
              value={photo.memo}
              onChange={(e) => updateMemo(i, e.target.value)}
              style={{
                width: '100%',
                padding: '8px 10px',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '13px',
              }}
            />
          </div>
        </div>
      ))}

      {photos.length > 0 && (
        <label style={{
          display: 'inline-block',
          marginTop: '8px',
          padding: '6px 14px',
          background: '#f3f4f6',
          borderRadius: '6px',
          fontSize: '12px',
          cursor: 'pointer',
          color: '#6b7280',
        }}>
          + 사진 추가
          <input
            type="file"
            accept="image/*"
            multiple
            onChange={handleFileSelect}
            style={{ display: 'none' }}
          />
        </label>
      )}
    </div>
  )
}
