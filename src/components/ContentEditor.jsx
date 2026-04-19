import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { generateImageCaption } from '../lib/gemini'

/**
 * ContentEditor — AI 작성 단계: 하나의 워드 문서형 편집기
 * 좌측: AI 초안 (읽기전용, 참조)
 * 우측: contentEditable 편집 영역 (이미지 붙여넣기 지원 → Supabase Storage 업로드)
 *
 * 데이터: { body: HTML, personalNote, appealPoints }
 */
// AI Vision 캡션 접두어로 사진 타입 판정
function detectPhotoType(caption) {
  if (!caption) return ''
  const c = caption.trim()
  if (/^파노라마/.test(c)) return 'panorama'
  if (/^측모두부|^측모 두부|^세팔로|^cephalo/i.test(c)) return 'cephalogram'
  if (/^구내/.test(c)) return 'intraoral'
  if (/^전치부|^근접/.test(c)) return 'intraoral'
  if (/^얼굴/.test(c)) return 'face'
  return 'other'
}

export default function ContentEditor({ original, edited, onChange, onUploadingChange }) {
  const editorRef = useRef(null)
  const inputTimerRef = useRef(null)
  const [uploading, setUploading] = useState(false)
  const [noteDraft, setNoteDraft] = useState(edited?.personalNote || '')
  const bodyInitialized = useRef(false)

  // 업로드 상태를 상위(Editor)에 전파 → 단계 전환 잠금에 사용
  useEffect(() => {
    onUploadingChange?.(uploading)
  }, [uploading, onUploadingChange])

  // 최초 1회만 innerHTML 설정 (이후에는 cursor 점프 방지 위해 React가 건드리지 않음)
  useEffect(() => {
    if (!editorRef.current || bodyInitialized.current) return
    editorRef.current.innerHTML = edited?.body || ''
    bodyInitialized.current = true
  }, [edited])

  useEffect(() => {
    setNoteDraft(edited?.personalNote || '')
  }, [edited?.personalNote])

  const commitBody = () => {
    if (!editorRef.current) return
    const html = editorRef.current.innerHTML
    onChange({ ...edited, body: html })
  }

  const handleInput = () => {
    if (inputTimerRef.current) clearTimeout(inputTimerRef.current)
    inputTimerRef.current = setTimeout(commitBody, 300)
  }

  const revertToDraft = () => {
    if (!editorRef.current) return
    if (!confirm('편집 내용을 AI 초안으로 되돌립니다. 계속하시겠어요?')) return
    editorRef.current.innerHTML = original?.body || ''
    commitBody()
  }

  // 이미지 업로드: Supabase Storage "dental-reports/content/" 경로
  const uploadImage = async (file) => {
    const ext = (file.type.split('/')[1] || 'png').toLowerCase().replace('jpeg', 'jpg')
    const name = `content/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`
    const { error } = await supabase.storage.from('dental-reports').upload(name, file, {
      contentType: file.type, cacheControl: '3600', upsert: false,
    })
    if (error) throw error
    const { data } = supabase.storage.from('dental-reports').getPublicUrl(name)
    return data.publicUrl
  }

  // 이미지 종횡비로 orient 결정 (portrait / landscape / wide)
  const detectOrient = (url) => new Promise((resolve) => {
    const probe = new Image()
    probe.onload = () => {
      const r = probe.naturalWidth / probe.naturalHeight
      if (r > 2) resolve('wide')
      else if (r > 1.2) resolve('landscape')
      else if (r < 0.85) resolve('portrait')
      else resolve('square')
    }
    probe.onerror = () => resolve('landscape')
    probe.src = url
  })

  // figure + img + figcaption 묶음 삽입 (AI Vision 자동 캡션 + 타입 포함)
  const insertImageAtCaret = async (url, initialCaption = '') => {
    const orient = await detectOrient(url)
    const phototype = detectPhotoType(initialCaption)

    const fig = document.createElement('figure')
    fig.setAttribute('data-orient', orient)
    if (phototype) fig.setAttribute('data-phototype', phototype)

    const img = document.createElement('img')
    img.src = url
    img.setAttribute('data-orient', orient)
    if (phototype) img.setAttribute('data-phototype', phototype)
    fig.appendChild(img)

    const cap = document.createElement('figcaption')
    if (initialCaption) {
      cap.textContent = initialCaption
    } else {
      cap.setAttribute('data-placeholder', '사진 설명 입력...')
    }
    fig.appendChild(cap)

    const sel = window.getSelection()
    if (sel && sel.rangeCount > 0 && editorRef.current?.contains(sel.anchorNode)) {
      const range = sel.getRangeAt(0)
      range.deleteContents()
      range.insertNode(fig)
      range.selectNodeContents(cap)
      range.collapse(initialCaption ? false : true) // 캡션 있으면 끝으로, 없으면 앞으로
      sel.removeAllRanges()
      sel.addRange(range)
    } else {
      editorRef.current.appendChild(fig)
    }
    commitBody()
  }

  const handlePaste = async (e) => {
    const items = e.clipboardData?.items || []
    const imageItems = Array.from(items).filter(it => it.type?.startsWith('image/'))

    if (imageItems.length > 0) {
      e.preventDefault()
      setUploading(true)
      try {
        for (const item of imageItems) {
          const file = item.getAsFile()
          if (!file) continue
          const [url, caption] = await Promise.all([
            uploadImage(file),
            generateImageCaption(file),
          ])
          await insertImageAtCaret(url, caption)
        }
      } catch (err) {
        alert('이미지 업로드 실패: ' + err.message)
      } finally {
        setUploading(false)
      }
      return
    }

    // 텍스트 붙여넣기는 서식 제거 (plain text)
    const text = e.clipboardData?.getData('text/plain')
    if (text) {
      e.preventDefault()
      document.execCommand('insertText', false, text)
    }
  }

  // drag&drop 이미지도 지원
  const handleDrop = async (e) => {
    const files = Array.from(e.dataTransfer?.files || []).filter(f => f.type.startsWith('image/'))
    if (files.length === 0) return
    e.preventDefault()
    setUploading(true)
    try {
      for (const file of files) {
        const [url, caption] = await Promise.all([
          uploadImage(file),
          generateImageCaption(file),
        ])
        await insertImageAtCaret(url, caption)
      }
    } catch (err) {
      alert('이미지 업로드 실패: ' + err.message)
    } finally {
      setUploading(false)
    }
  }

  // 헤딩 삽입 단축 버튼
  const insertHeading = (text) => {
    if (!editorRef.current) return
    editorRef.current.focus()
    document.execCommand('insertHTML', false, `<h2>${text}</h2><p></p>`)
    commitBody()
  }

  return (
    <div style={S.container}>
      {/* ── 좌측: AI 초안 (읽기전용) ── */}
      <div style={S.left}>
        <div style={S.panelHead}>
          <span style={S.badge}>AI 초안</span>
          <span style={S.hint}>참조용 (수정 불가)</span>
        </div>
        <div className="ro-draft" style={S.roBody} dangerouslySetInnerHTML={{ __html: original?.body || '<p style="color:#9ca3af">초안이 비어있습니다.</p>' }} />
      </div>

      {/* ── 우측: 편집 ── */}
      <div style={S.right}>
        <div style={S.panelHead}>
          <span style={{ ...S.badge, background: '#7c3aed', color: '#fff' }}>내용 편집</span>
          <span style={S.hint}>워드 문서처럼 자유 편집 · 사진 붙여넣기 가능</span>
          <div style={{ flex: 1 }} />
          <button onClick={revertToDraft} style={S.revertBtn} title="AI 초안으로 되돌리기">↺ 초안</button>
        </div>

        {/* 툴바 */}
        <div style={S.toolbar}>
          <span style={S.toolLabel}>소제목 추가:</span>
          <button style={S.toolBtn} onClick={() => insertHeading('치성 관계')}>치성 관계</button>
          <button style={S.toolBtn} onClick={() => insertHeading('골격 관계')}>골격 관계</button>
          <button style={S.toolBtn} onClick={() => insertHeading('치료 계획')}>치료 계획</button>
          <button style={S.toolBtn} onClick={() => insertHeading('추가 사항')}>추가 사항</button>
          {uploading && <span style={S.uploading}>📤 업로드 중...</span>}
        </div>

        {/* 편집 영역 */}
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          onInput={handleInput}
          onBlur={commitBody}
          onPaste={handlePaste}
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          style={S.editor}
          data-placeholder="여기에 내용을 작성하거나 사진을 붙여넣으세요..."
        />

        {/* 맞춤 안내 (personalNote) */}
        <div style={{ marginTop: '20px' }}>
          <div style={S.subSecTitle}>맞춤 안내 <span style={S.subSecHint}>(환자에게 드리는 개인화 메시지)</span></div>
          <textarea
            value={noteDraft}
            onChange={(e) => setNoteDraft(e.target.value)}
            onBlur={() => onChange({ ...edited, personalNote: noteDraft })}
            style={S.noteTa}
            rows={4}
            placeholder="환자 성향을 반영한 맞춤 메시지..."
          />
        </div>
      </div>
    </div>
  )
}

const S = {
  container: { display: 'flex', gap: 0, minHeight: '520px', border: '1px solid #e5e7eb', borderRadius: '12px', overflow: 'hidden', background: '#fff' },

  left: { flex: '0 0 36%', overflow: 'auto', padding: '20px', background: '#f8f9fa', borderRight: '1px solid #e5e7eb', maxHeight: 'calc(100vh - 200px)' },
  right: { flex: 1, overflow: 'auto', padding: '20px', display: 'flex', flexDirection: 'column' },

  panelHead: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px', paddingBottom: '12px', borderBottom: '1px solid #e5e7eb' },
  badge: { padding: '4px 12px', borderRadius: '20px', fontSize: '13px', fontWeight: '600', background: '#e5e7eb', color: '#374151' },
  hint: { fontSize: '12px', color: '#9ca3af' },

  // 읽기전용 본문 스타일
  roBody: {
    fontSize: '13px', lineHeight: '1.9', color: '#4b5563',
  },

  // 편집기
  toolbar: {
    display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 10px',
    background: '#f5f2ed', border: '1px solid #e5e0d5', borderRadius: '8px 8px 0 0',
    borderBottom: 'none', flexWrap: 'wrap',
  },
  toolLabel: { fontSize: '11px', color: '#6b7280', marginRight: '4px' },
  toolBtn: {
    padding: '4px 10px', background: '#fff', color: '#b5976a',
    border: '1px solid #d4c8b4', borderRadius: '6px',
    fontSize: '12px', fontWeight: 600, cursor: 'pointer',
  },
  uploading: { marginLeft: 'auto', fontSize: '12px', color: '#b5976a', fontWeight: 600 },

  editor: {
    minHeight: '360px',
    padding: '20px 24px',
    border: '1px solid #d4c8b4',
    borderRadius: '0 0 8px 8px',
    fontSize: '15px',
    lineHeight: '1.9',
    color: '#1f2937',
    background: '#fff',
    outline: 'none',
    fontFamily: "'Pretendard', 'Noto Sans KR', sans-serif",
    overflow: 'auto',
  },

  subSecTitle: { fontSize: '13px', fontWeight: 700, color: '#1a1a18', marginBottom: '6px' },
  subSecHint: { fontSize: '11px', color: '#9ca3af', fontWeight: 400, marginLeft: '4px' },
  noteTa: {
    width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '8px',
    fontSize: '14px', lineHeight: '1.7', resize: 'vertical', fontFamily: 'inherit',
    color: '#1f2937', boxSizing: 'border-box', outline: 'none',
  },

  revertBtn: { padding: '4px 10px', background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a', borderRadius: '6px', fontSize: '11px', cursor: 'pointer', fontWeight: 600 },
}
