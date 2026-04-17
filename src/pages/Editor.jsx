import { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import StaffForm from '../components/StaffForm'
import ClinicalForm, { getEmptyClinicalForm } from '../components/ClinicalForm'
import ContentEditor from '../components/ContentEditor'
import BrochurePreview from '../components/BrochurePreview'
import { generateDraft, refineContent, saveCorrections, getEmptyDraft } from '../lib/gemini'
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
  } catch { return null }
}

function clearDraft() {
  localStorage.removeItem(DRAFT_KEY)
}

const STEP_LABELS = [
  { num: 1, label: '입력' },
  { num: 2, label: '내용 편집' },
  { num: 3, label: '톤 변환' },
  { num: 4, label: '브로셔' },
]

export default function Editor() {
  const draft = useRef(loadDraft()).current

  const [patientName, setPatientName] = useState(draft?.patientName || '')
  const [consultDate, setConsultDate] = useState(
    draft?.consultDate || new Date().toISOString().split('T')[0]
  )
  const [chartingText, setChartingText] = useState(draft?.chartingText || '')
  const [clinicalForm, setClinicalForm] = useState(draft?.clinicalForm || getEmptyClinicalForm())
  const [staffForm, setStaffForm] = useState(draft?.staffForm || INITIAL_STAFF_FORM)
  const [isGenerating, setIsGenerating] = useState(false)
  const [isRefining, setIsRefining] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [savedLink, setSavedLink] = useState(null)
  const [step, setStep] = useState(draft?.step || 1)

  // 초안 원본 + 편집본 (새 형식)
  const [draftContent, setDraftContent] = useState(draft?.draftContent || null)
  const [editedContent, setEditedContent] = useState(draft?.editedContent || null)
  // 톤 변환 결과 (personalNote, appealPoints 포함)
  const [refinedContent, setRefinedContent] = useState(draft?.refinedContent || null)
  // 사진 (기본 7슬롯 + 추가)
  const [photos, setPhotos] = useState(draft?.photos || [])

  const navigate = useNavigate()

  // 자동 임시저장
  const saveDraft = useCallback(() => {
    const data = {
      patientName, consultDate, chartingText, clinicalForm, staffForm, step,
      draftContent, editedContent, refinedContent,
      photos: photos.map(p => ({ ...p, file: undefined, preview: undefined })),
    }
    localStorage.setItem(DRAFT_KEY, JSON.stringify(data))
  }, [patientName, consultDate, chartingText, clinicalForm, staffForm, step, draftContent, editedContent, refinedContent, photos])

  useEffect(() => {
    const timer = setTimeout(saveDraft, 2000)
    return () => clearTimeout(timer)
  }, [saveDraft])

  // Step 1 → 2: AI 초안 생성
  const handleGenerateDraft = async () => {
    if (!chartingText.trim()) { alert('차팅 내용을 입력해주세요.'); return }
    setIsGenerating(true)
    try {
      const result = await generateDraft({ chartingText })
      setDraftContent(result)
      setEditedContent(JSON.parse(JSON.stringify(result)))
      setStep(2)
    } catch (err) {
      alert('AI 생성 실패: ' + err.message)
    } finally { setIsGenerating(false) }
  }

  // Step 2 → 3: AI 톤 변환
  const handleRefine = async () => {
    if (!editedContent) return
    setIsRefining(true)
    try {
      const refined = await refineContent({ content: editedContent, staffForm })
      setRefinedContent(refined)
      setStep(3)
    } catch (err) {
      alert('AI 톤 변환 실패: ' + err.message)
    } finally { setIsRefining(false) }
  }

  // Step 3 → 4: 브로셔 확정
  const handleMakeBrochure = () => {
    // 교정 사례 저장 (비동기, 실패해도 진행)
    if (draftContent && refinedContent) {
      saveCorrections(draftContent.skeletalRelationship, refinedContent.skeletalRelationship).catch(() => {})
      saveCorrections(draftContent.dentalRelationship, refinedContent.dentalRelationship).catch(() => {})
    }
    setStep(4)
  }

  // 저장 + 링크 생성
  const handleSave = async () => {
    if (!patientName.trim()) { alert('환자명을 입력해주세요.'); return }
    setIsSaving(true)
    try {
      // 사진 업로드
      const uploadedPhotos = []
      for (const photo of photos) {
        if (photo.file) {
          const fileName = `${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`
          const { error } = await supabase.storage
            .from('dental-reports')
            .upload(fileName, photo.file, { contentType: photo.file.type })
          if (error) throw error
          const { data: urlData } = supabase.storage.from('dental-reports').getPublicUrl(fileName)
          uploadedPhotos.push({ ...photo, file: undefined, preview: undefined, url: urlData.publicUrl })
        } else {
          uploadedPhotos.push({ ...photo, file: undefined, preview: undefined })
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
        sections: refinedContent || editedContent,
        photos: uploadedPhotos,
        modules: [],
      })
      if (error) throw error

      const link = `${window.location.origin}/dental-report/report/${reportId}`
      setSavedLink(link)
      clearDraft()
      alert('저장 완료! 링크가 생성되었습니다.')
    } catch (err) {
      alert('저장 실패: ' + err.message)
    } finally { setIsSaving(false) }
  }

  const handleCopyLink = () => {
    if (savedLink) { navigator.clipboard.writeText(savedLink); alert('링크가 복사되었습니다.') }
  }

  // 현재 보여줄 content
  const displayContent = step >= 3 ? (refinedContent || editedContent) : editedContent

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', fontFamily: "'Pretendard', sans-serif" }}>
      {/* 상단 바 */}
      <div style={headerS.bar}>
        <div style={headerS.left}>
          {step < 4 && (
            <>
              <input type="text" placeholder="환자명" value={patientName} onChange={e => setPatientName(e.target.value)} style={inputStyle} />
              <input type="date" value={consultDate} onChange={e => setConsultDate(e.target.value)} style={inputStyle} />
            </>
          )}
        </div>

        <div style={headerS.steps}>
          {STEP_LABELS.map(({ num, label }) => (
            <div key={num} style={{ display: 'flex', alignItems: 'center', gap: '6px', opacity: num === step ? 1 : 0.4 }}>
              <div style={{
                width: '24px', height: '24px', borderRadius: '50%',
                background: num === step ? '#b5976a' : num < step ? '#6a9b7a' : '#d1d5db',
                color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 700,
              }}>{num < step ? '✓' : num}</div>
              <span style={{ fontSize: '13px', fontWeight: num === step ? 600 : 400, color: num === step ? '#1a1a18' : '#9ca3af' }}>{label}</span>
              {num < 4 && <span style={{ color: '#d1d5db', margin: '0 4px' }}>→</span>}
            </div>
          ))}
        </div>

        <div style={headerS.right}>
          <button onClick={() => navigate('/settings')} style={{ ...btnStyle('#374151'), fontSize: '13px', padding: '8px 14px' }}>AI 설정</button>
          {step > 1 && <button onClick={() => setStep(step - 1)} style={btnStyle('#6b7280')}>← 이전</button>}
          {step === 4 && savedLink && <button onClick={handleCopyLink} style={btnStyle('#6a9b7a')}>링크 복사</button>}
          {step === 4 && <button onClick={handleSave} disabled={isSaving} style={btnStyle('#b5976a')}>{isSaving ? '저장 중...' : '저장 + 링크 생성'}</button>}
        </div>
      </div>

      {/* 메인 */}
      <div style={{ flex: 1, overflow: 'auto', background: step === 4 ? '#1a1a18' : '#fafafa' }}>

        {/* Step 1: 의사 입력 (문제목록) */}
        {step === 1 && (
          <div style={{ maxWidth: '860px', margin: '0 auto', padding: '24px' }}>
            <ClinicalForm value={clinicalForm} onChange={setClinicalForm} />
            <button onClick={handleGenerateDraft} disabled={isGenerating} style={{ ...btnStyle('#b5976a'), width: '100%', padding: '14px', fontSize: '16px', marginTop: '24px' }}>
              {isGenerating ? 'AI 초안 생성 중...' : 'AI 초안 생성 →'}
            </button>
          </div>
        )}

        {/* Step 2: 내용 편집 */}
        {step === 2 && draftContent && editedContent && (
          <div style={{ padding: '16px 24px', height: 'calc(100vh - 120px)' }}>
            <div style={{ background: '#f5f2ed', border: '1px solid #d4c8b4', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', color: '#5a5a55', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '16px' }}>&#9998;</span>
              좌측 초안을 참조하면서 우측에서 내용을 수정하세요. 말투/톤은 다음 단계에서 AI가 조절합니다.
            </div>
            <ContentEditor original={draftContent} edited={editedContent} onChange={setEditedContent} />
            <button onClick={handleRefine} disabled={isRefining} style={{ ...btnStyle('#b5976a'), width: '100%', padding: '16px', fontSize: '16px', fontWeight: 700, marginTop: '12px' }}>
              {isRefining ? 'AI 톤 변환 중...' : 'AI 톤 변환 (환자 맞춤)'}
            </button>
          </div>
        )}

        {/* Step 3: 톤 변환 결과 + 미리보기 */}
        {step === 3 && displayContent && (
          <div style={{ display: 'flex', height: 'calc(100vh - 60px)' }}>
            {/* 좌측: 편집 가능 */}
            <div style={{ flex: 1, overflow: 'auto', padding: '24px', borderRight: '1px solid #e5e7eb' }}>
              <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', color: '#065f46', marginBottom: '16px' }}>
                환자 성향이 반영된 톤으로 변환되었습니다. 내용을 최종 확인하세요.
              </div>
              <ContentEditor
                original={editedContent}
                edited={refinedContent}
                onChange={setRefinedContent}
              />
              <button onClick={handleMakeBrochure} style={{ ...btnStyle('#c45c5c'), width: '100%', padding: '16px', fontSize: '18px', fontWeight: 700, marginTop: '16px' }}>
                브로셔 만들기
              </button>
            </div>

            {/* 우측: 모바일 미리보기 */}
            <div style={{ width: '420px', background: '#1a1a18', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '24px', overflow: 'auto', flexShrink: 0 }}>
              <div style={{ width: '375px', minHeight: '667px', background: '#fff', borderRadius: '24px', overflow: 'hidden', boxShadow: '0 25px 50px rgba(0,0,0,0.3)' }}>
                <BrochurePreview
                  patientName={patientName}
                  consultDate={consultDate}
                  content={refinedContent}
                  photos={photos}
                  mode="preview"
                />
              </div>
            </div>
          </div>
        )}

        {/* Step 4: 브로셔 완성 */}
        {step === 4 && displayContent && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '20px 0' }}>
            <div style={{ width: '100%', maxWidth: '800px', background: '#fff', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
              <BrochurePreview
                patientName={patientName}
                consultDate={consultDate}
                content={refinedContent || editedContent}
                photos={photos}
                mode="view"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: '24px' }}>
      <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#374151', marginBottom: '12px' }}>{title}</h3>
      {children}
    </div>
  )
}

const inputStyle = { padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '15px' }

const btnStyle = (color) => ({
  padding: '10px 20px', background: color, color: '#fff', border: 'none', borderRadius: '8px',
  fontSize: '14px', fontWeight: 600, cursor: 'pointer',
})

const headerS = {
  bar: { display: 'flex', alignItems: 'center', padding: '10px 20px', background: '#fff', borderBottom: '1px solid #e5e7eb', gap: '16px', flexShrink: 0, zIndex: 10 },
  left: { display: 'flex', gap: '8px', alignItems: 'center' },
  steps: { display: 'flex', alignItems: 'center', gap: '4px', flex: 1, justifyContent: 'center' },
  right: { display: 'flex', gap: '8px', alignItems: 'center' },
}
