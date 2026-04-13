import { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import StaffForm from '../components/StaffForm'
import BlockEditor, { contentToBlocks, blocksToContent } from '../components/BlockEditor'
import BrochurePreview from '../components/BrochurePreview'
import { generatePatientText, saveCorrections } from '../lib/gemini'
import { supabase } from '../lib/supabase'

const INITIAL_STAFF_FORM = {
  personality: [],
  anxiety: [],
  costReaction: [],
  willingness: 3,
  understanding: 3,
  interests: [],
  memo: '',
}

const DRAFT_KEY = 'dental-report-draft'

function loadDraft() {
  try {
    const raw = localStorage.getItem(DRAFT_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function clearDraft() {
  localStorage.removeItem(DRAFT_KEY)
}

export default function Editor() {
  const draft = useRef(loadDraft()).current

  const [patientName, setPatientName] = useState(draft?.patientName || '')
  const [consultDate, setConsultDate] = useState(
    draft?.consultDate || new Date().toISOString().split('T')[0]
  )
  const [chartingText, setChartingText] = useState(draft?.chartingText || '')
  const [staffForm, setStaffForm] = useState(draft?.staffForm || INITIAL_STAFF_FORM)
  const [blocks, setBlocks] = useState(draft?.blocks || [])
  const [selectedModules, setSelectedModules] = useState(draft?.selectedModules || [])
  const [isGenerating, setIsGenerating] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [savedLink, setSavedLink] = useState(null)
  const [step, setStep] = useState(draft?.step || 1)

  const navigate = useNavigate()
  const originalContentRef = useRef(null)

  // 자동 임시저장 (2초 디바운스)
  const saveDraft = useCallback(() => {
    const data = {
      patientName, consultDate, chartingText, staffForm,
      blocks: blocks.map(b => ({ ...b, file: undefined, preview: undefined })),
      selectedModules, step,
    }
    localStorage.setItem(DRAFT_KEY, JSON.stringify(data))
  }, [patientName, consultDate, chartingText, staffForm, blocks, selectedModules, step])

  useEffect(() => {
    const timer = setTimeout(saveDraft, 2000)
    return () => clearTimeout(timer)
  }, [saveDraft])

  // Step 1 → 2: AI 텍스트 생성
  const handleGenerate = async () => {
    if (!chartingText.trim()) {
      alert('차팅 내용을 입력해주세요.')
      return
    }
    setIsGenerating(true)
    try {
      const result = await generatePatientText({ chartingText, staffForm })
      originalContentRef.current = result
      setBlocks(contentToBlocks(result))
      setStep(2)
    } catch (err) {
      alert('AI 생성 실패: ' + err.message)
    } finally {
      setIsGenerating(false)
    }
  }

  // Step 2 → 3: 브로셔 변환 + 교정 사례 저장
  const handleMakeBrochure = async () => {
    if (originalContentRef.current) {
      const edited = blocksToContent(blocks)
      const orig = originalContentRef.current
      await saveCorrections(orig.diagnosis, edited.diagnosis)
      await saveCorrections(orig.additionalNotes, edited.additionalNotes)
      for (let i = 0; i < Math.min(orig.treatmentOptions?.length || 0, edited.treatmentOptions?.length || 0); i++) {
        await saveCorrections(orig.treatmentOptions[i].description, edited.treatmentOptions[i].description)
      }
    }
    setStep(3)
  }

  // 저장 + 링크 생성
  const handleSave = async () => {
    if (!patientName.trim()) {
      alert('환자명을 입력해주세요.')
      return
    }
    setIsSaving(true)
    try {
      const uploadedBlocks = []
      for (const block of blocks) {
        if (block.type === 'photo' && block.file) {
          const fileName = `${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`
          const { error } = await supabase.storage
            .from('dental-reports')
            .upload(fileName, block.file, { contentType: block.file.type })
          if (error) throw error
          const { data: urlData } = supabase.storage
            .from('dental-reports')
            .getPublicUrl(fileName)
          uploadedBlocks.push({ ...block, file: undefined, preview: undefined, url: urlData.publicUrl })
        } else {
          uploadedBlocks.push({ ...block, file: undefined, preview: undefined })
        }
      }

      const reportId = crypto.randomUUID()
      const expiresAt = new Date()
      expiresAt.setDate(expiresAt.getDate() + 90)

      const { error } = await supabase.from('dental_reports').insert({
        id: reportId,
        patient_name: patientName,
        consult_date: consultDate,
        expires_at: expiresAt.toISOString(),
        sections: { blocks: uploadedBlocks },
        photos: uploadedBlocks.filter((b) => b.type === 'photo').map((b) => ({
          url: b.url, memo: b.memo, ratio: b.ratio,
        })),
        modules: selectedModules,
      })
      if (error) throw error

      const link = `${window.location.origin}/dental-report/report/${reportId}`
      setSavedLink(link)
      clearDraft()
      alert('저장 완료! 링크가 생성되었습니다.')
    } catch (err) {
      alert('저장 실패: ' + err.message)
    } finally {
      setIsSaving(false)
    }
  }

  const handleCopyLink = () => {
    if (savedLink) {
      navigator.clipboard.writeText(savedLink)
      alert('링크가 복사되었습니다.')
    }
  }

  return (
    <div style={{ display: 'flex', height: '100vh', fontFamily: "'Pretendard', sans-serif" }}>
      {/* 좌측 (Step 1,2: 편집 / Step 3: 브로셔 확인) */}
      <div style={{
        flex: 1,
        overflow: 'auto',
        padding: '24px',
        background: step === 3 ? '#1f2937' : '#fafafa',
        ...(step === 2 ? {} : { borderRight: '1px solid #e5e7eb' }),
      }}>
        {/* 상단 바 */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          marginBottom: '24px',
          flexWrap: 'wrap',
        }}>
          {step < 3 && (
            <>
              <input
                type="text"
                placeholder="환자명"
                value={patientName}
                onChange={(e) => setPatientName(e.target.value)}
                style={inputStyle}
              />
              <input
                type="date"
                value={consultDate}
                onChange={(e) => setConsultDate(e.target.value)}
                style={inputStyle}
              />
            </>
          )}
          <div style={{ flex: 1 }} />
          <button onClick={() => navigate('/settings')} style={{ ...btnStyle('#374151'), fontSize: '13px', padding: '8px 14px' }}>
            AI 설정
          </button>
          {step > 1 && (
            <button onClick={() => setStep(step - 1)} style={btnStyle('#6b7280')}>
              ← 이전
            </button>
          )}
          {step === 3 && savedLink && (
            <button onClick={handleCopyLink} style={btnStyle('#10b981')}>
              링크 복사
            </button>
          )}
          {step === 3 && (
            <button onClick={handleSave} disabled={isSaving} style={btnStyle('#2563eb')}>
              {isSaving ? '저장 중...' : '저장 + 링크 생성'}
            </button>
          )}
        </div>

        {/* Step 1: 입력 */}
        {step === 1 && (
          <>
            <Section title="1. 차팅 입력 (EMR 복사붙여넣기)">
              <textarea
                placeholder="EMR에서 차팅 내용을 복사해서 붙여넣으세요..."
                value={chartingText}
                onChange={(e) => setChartingText(e.target.value)}
                style={{
                  width: '100%', minHeight: '150px', padding: '12px',
                  border: '1px solid #d1d5db', borderRadius: '8px',
                  fontSize: '14px', resize: 'vertical', fontFamily: 'inherit',
                  boxSizing: 'border-box',
                }}
              />
            </Section>
            <Section title="2. 상담 정보 입력 (실장/팀장)">
              <StaffForm value={staffForm} onChange={setStaffForm} />
            </Section>
            <button
              onClick={handleGenerate}
              disabled={isGenerating}
              style={{ ...btnStyle('#7c3aed'), width: '100%', padding: '14px', fontSize: '16px' }}
            >
              {isGenerating ? 'AI 생성 중...' : 'AI 텍스트 생성'}
            </button>
          </>
        )}

        {/* Step 2: 워드형 편집 (전체 너비) */}
        {step === 2 && (
          <>
            <div style={{
              background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px',
              padding: '10px 14px', fontSize: '13px', color: '#92400e', marginBottom: '16px',
            }}>
              텍스트를 수정하고, 원하는 위치에 사진을 삽입하세요. (커서 놓고 Ctrl+V 또는 상단 버튼)
            </div>
            <BlockEditor blocks={blocks} onChange={setBlocks} />
            <button
              onClick={handleMakeBrochure}
              style={{
                ...btnStyle('#dc2626'), width: '100%', padding: '16px',
                fontSize: '18px', fontWeight: '700', marginTop: '16px',
              }}
            >
              브로셔 만들기
            </button>
          </>
        )}

        {/* Step 3: 브로셔 완성 미리보기 (환자에게 보이는 그대로) */}
        {step === 3 && (
          <div style={{
            display: 'flex',
            justifyContent: 'center',
            padding: '20px 0',
          }}>
            <div style={{
              width: '100%',
              maxWidth: '800px',
              background: '#fff',
              borderRadius: '16px',
              overflow: 'hidden',
              boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
            }}>
              <BrochurePreview
                patientName={patientName}
                consultDate={consultDate}
                blocks={blocks}
                modules={selectedModules}
                mode="view"
              />
            </div>
          </div>
        )}
      </div>

      {/* 우측: Step 1에서만 안내, Step 2에서 간단 미리보기, Step 3에서는 숨김 */}
      {step < 3 && (
        <div style={{
          width: '420px',
          background: '#1f2937',
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'center',
          padding: '24px',
          overflow: 'auto',
          flexShrink: 0,
        }}>
          <div style={{
            width: '375px',
            minHeight: '667px',
            background: '#fff',
            borderRadius: '24px',
            overflow: 'hidden',
            boxShadow: '0 25px 50px rgba(0,0,0,0.3)',
          }}>
            <BrochurePreview
              patientName={patientName}
              consultDate={consultDate}
              blocks={blocks}
              modules={selectedModules}
              mode="preview"
            />
          </div>
        </div>
      )}
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: '24px' }}>
      <h3 style={{ fontSize: '15px', fontWeight: '600', color: '#374151', marginBottom: '12px' }}>
        {title}
      </h3>
      {children}
    </div>
  )
}

const inputStyle = {
  padding: '8px 12px',
  border: '1px solid #d1d5db',
  borderRadius: '8px',
  fontSize: '15px',
}

const btnStyle = (color) => ({
  padding: '10px 20px',
  background: color,
  color: '#fff',
  border: 'none',
  borderRadius: '8px',
  fontSize: '14px',
  fontWeight: '600',
  cursor: 'pointer',
})
