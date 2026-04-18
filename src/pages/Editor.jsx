import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import StaffForm from '../components/StaffForm'
import ClinicalForm, { getEmptyClinicalForm } from '../components/ClinicalForm'
import ContentEditor from '../components/ContentEditor'
import BrochurePreview from '../components/BrochurePreview'
import { generateDraft, refineContent, saveCorrections } from '../lib/gemini'
import { supabase } from '../lib/supabase'
import { getByChartNumber, updateReport, acquireLock, releaseLock, isOtherPcEditing, PROGRESS_STAGES, STEP_TO_STAGE } from '../lib/reports'
import { getSessionId, getPcLabel } from '../lib/session'

const INITIAL_STAFF_FORM = {
  personality: [], anxiety: [], costReaction: [],
  willingness: 3, understanding: 3, interests: [], memo: '',
}

const STEP_LABELS = [
  { num: 1, label: '의사 입력' },
  { num: 2, label: '내용 편집' },
  { num: 3, label: '톤 변환' },
  { num: 4, label: '브로셔' },
]

export default function Editor() {
  const { chartNumber } = useParams()
  const navigate = useNavigate()

  const [report, setReport] = useState(null)
  const [loadError, setLoadError] = useState('')

  const [clinicalForm, setClinicalForm] = useState(getEmptyClinicalForm())
  const [clinicalPage, setClinicalPage] = useState(1)
  const [staffForm, setStaffForm] = useState(INITIAL_STAFF_FORM)
  const [draftContent, setDraftContent] = useState(null)
  const [editedContent, setEditedContent] = useState(null)
  const [refinedContent, setRefinedContent] = useState(null)
  const [photos, setPhotos] = useState([])
  const [step, setStep] = useState(1)

  const [isGenerating, setIsGenerating] = useState(false)
  const [isRefining, setIsRefining] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [savedLink, setSavedLink] = useState(null)

  const hydratedRef = useRef(false)
  const saveTimerRef = useRef(null)
  const skipNextAutosave = useRef(false)

  useEffect(() => {
    let mounted = true
    setLoadError('')
    getByChartNumber(chartNumber).then(data => {
      if (!mounted) return
      if (!data) { setLoadError(`차트번호 "${chartNumber}" 환자를 찾을 수 없습니다.`); return }
      setReport(data)
      setClinicalForm(data.clinical_form || getEmptyClinicalForm())
      setStaffForm(data.staff_form || INITIAL_STAFF_FORM)
      if (data.sections && Object.keys(data.sections).length > 0) {
        setRefinedContent(data.sections)
        setEditedContent(data.sections)
        setDraftContent(data.sections)
      }
      setPhotos(data.photos || [])
      hydratedRef.current = true
    }).catch(err => { if (mounted) setLoadError(err.message) })
    return () => { mounted = false }
  }, [chartNumber])

  useEffect(() => {
    if (!report?.id) return
    acquireLock(report.id, `step${step}`).catch(() => {})
    const heartbeat = setInterval(() => {
      acquireLock(report.id, `step${step}`).catch(() => {})
    }, 60 * 1000)
    const onUnload = () => {
      const body = JSON.stringify({ locked_by: null, locked_at: null, current_step: null })
      try {
        navigator.sendBeacon?.(
          `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/dental_reports?id=eq.${report.id}`,
          new Blob([body], { type: 'application/json' })
        )
      } catch {}
    }
    window.addEventListener('beforeunload', onUnload)
    return () => {
      clearInterval(heartbeat)
      window.removeEventListener('beforeunload', onUnload)
      releaseLock(report.id).catch(() => {})
    }
  }, [report?.id, step])

  useEffect(() => {
    if (!report?.id) return
    const channel = supabase
      .channel(`dental_report_${report.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'dental_reports', filter: `id=eq.${report.id}` }, (payload) => {
        const next = payload.new
        if (!next) return
        setReport(prev => ({ ...prev, locked_by: next.locked_by, locked_at: next.locked_at, current_step: next.current_step, progress_stage: next.progress_stage, updated_at: next.updated_at }))
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [report?.id])

  useEffect(() => {
    if (!hydratedRef.current || !report?.id) return
    if (skipNextAutosave.current) { skipNextAutosave.current = false; return }
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      const progress = STEP_TO_STAGE[step] || report.progress_stage || 'diagnosis'
      const patch = {
        clinical_form: clinicalForm,
        staff_form: staffForm,
        progress_stage: report.progress_stage === 'done' ? 'done' : progress,
      }
      if (editedContent) patch.sections = refinedContent || editedContent
      updateReport(report.id, patch).catch(err => console.error('autosave failed', err))
    }, 1500)
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current) }
  }, [clinicalForm, staffForm, editedContent, refinedContent, step, report?.id])

  const otherPcEditing = useMemo(() => isOtherPcEditing(report, `step${step}`), [report, step])

  const handleGenerateDraft = async () => {
    const ct = (clinicalForm?.chartingText || '').trim()
    if (!ct) {
      const anyChecked = Object.values(clinicalForm?.skeletal || {}).some(v => v && typeof v === 'object')
        || Object.values(clinicalForm?.dental || {}).some(v => v && typeof v === 'object')
      if (!anyChecked) { alert('차팅 또는 진단 항목을 입력해주세요.'); return }
    }
    setIsGenerating(true)
    try {
      const result = await generateDraft({ chartingText: ct, clinicalForm })
      setDraftContent(result)
      setEditedContent(JSON.parse(JSON.stringify(result)))
      setStep(2)
    } catch (err) {
      alert('AI 생성 실패: ' + err.message)
    } finally { setIsGenerating(false) }
  }

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

  const handleMakeBrochure = () => {
    if (draftContent && refinedContent) {
      saveCorrections(draftContent.skeletalRelationship, refinedContent.skeletalRelationship).catch(() => {})
      saveCorrections(draftContent.dentalRelationship, refinedContent.dentalRelationship).catch(() => {})
    }
    setStep(4)
  }

  const handleSave = async () => {
    if (!report?.id) return
    setIsSaving(true)
    try {
      const uploadedPhotos = []
      for (const photo of photos) {
        if (photo?.file) {
          const fileName = `${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`
          const { error } = await supabase.storage.from('dental-reports').upload(fileName, photo.file, { contentType: photo.file.type })
          if (error) throw error
          const { data: urlData } = supabase.storage.from('dental-reports').getPublicUrl(fileName)
          uploadedPhotos.push({ ...photo, file: undefined, preview: undefined, url: urlData.publicUrl })
        } else {
          uploadedPhotos.push({ ...photo, file: undefined, preview: undefined })
        }
      }
      const expiresAt = new Date(); expiresAt.setDate(expiresAt.getDate() + 90)
      await updateReport(report.id, {
        sections: refinedContent || editedContent,
        photos: uploadedPhotos,
        clinical_form: clinicalForm,
        staff_form: staffForm,
        expires_at: expiresAt.toISOString(),
        progress_stage: 'done',
      })
      const link = `${window.location.origin}/dental-report/report/${report.id}`
      setSavedLink(link)
      alert('저장 완료! 링크가 생성되었습니다.')
    } catch (err) {
      alert('저장 실패: ' + err.message)
    } finally { setIsSaving(false) }
  }

  const handleCopyLink = () => {
    if (savedLink) { navigator.clipboard.writeText(savedLink); alert('링크가 복사되었습니다.') }
  }

  if (loadError) {
    return (
      <div style={loadErrS.wrap}>
        <div style={loadErrS.card}>
          <h2 style={{ margin: 0 }}>⚠️ {loadError}</h2>
          <button onClick={() => navigate('/')} style={loadErrS.btn}>대시보드로 돌아가기</button>
        </div>
      </div>
    )
  }

  if (!report) return <div style={loadErrS.wrap}>불러오는 중…</div>

  const displayContent = step >= 3 ? (refinedContent || editedContent) : editedContent
  const stage = PROGRESS_STAGES[report.progress_stage] || PROGRESS_STAGES.registered

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', fontFamily: "'Pretendard', sans-serif" }}>
      {otherPcEditing && (
        <div style={bannerS.other}>
          ⚠️ 다른 PC에서도 같은 단계({report.current_step})를 열고 있습니다. (편집은 가능하나 덮어쓰기 충돌 주의)
        </div>
      )}

      <div style={headerS.bar}>
        <div style={headerS.left}>
          <button onClick={() => navigate('/')} style={{ ...btnStyle('#6b7280'), fontSize: '13px' }}>← 목록</button>
          <span style={{ fontSize: '14px', fontWeight: 600, color: '#1f2937' }}>
            {report.patient_name}
            <span style={{ color: '#9ca3af', fontWeight: 400, marginLeft: '6px' }}>· {report.chart_number}</span>
          </span>
          <span style={{ padding: '2px 8px', borderRadius: '10px', background: stage.color, color: '#fff', fontSize: '11px', fontWeight: 600 }}>
            {stage.label}
          </span>
        </div>

        <div style={headerS.steps}>
          {STEP_LABELS.map(({ num, label }) => (
            <div key={num} onClick={() => setStep(num)} style={{ display: 'flex', alignItems: 'center', gap: '6px', opacity: num === step ? 1 : 0.5, cursor: 'pointer' }}>
              <div style={{
                width: '22px', height: '22px', borderRadius: '50%',
                background: num === step ? '#b5976a' : num < step ? '#6a9b7a' : '#d1d5db',
                color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700,
              }}>{num < step ? '✓' : num}</div>
              <span style={{ fontSize: '13px', fontWeight: num === step ? 600 : 400, color: num === step ? '#1a1a18' : '#9ca3af' }}>{label}</span>
              {num < 4 && <span style={{ color: '#d1d5db', margin: '0 2px' }}>→</span>}
            </div>
          ))}
        </div>

        <div style={headerS.right}>
          <span style={{ fontSize: '12px', color: '#9ca3af' }}>{getPcLabel()}</span>
          <button onClick={() => navigate('/settings')} style={{ ...btnStyle('#374151'), fontSize: '13px', padding: '8px 14px' }}>AI 설정</button>
          {step === 4 && savedLink && <button onClick={handleCopyLink} style={btnStyle('#6a9b7a')}>링크 복사</button>}
          {step === 4 && <button onClick={handleSave} disabled={isSaving} style={btnStyle('#b5976a')}>{isSaving ? '저장 중...' : '저장 + 링크 생성'}</button>}
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', background: step === 4 ? '#1a1a18' : '#fafafa' }}>

        {step === 1 && (
          <div style={{ maxWidth: '860px', margin: '0 auto', padding: '24px' }}>
            <ClinicalForm
              value={clinicalForm}
              onChange={setClinicalForm}
              page={clinicalPage}
              onPageChange={setClinicalPage}
            />
            {clinicalPage === 2 && (
              <button onClick={handleGenerateDraft} disabled={isGenerating} style={{ ...btnStyle('#b5976a'), width: '100%', padding: '14px', fontSize: '16px', marginTop: '24px' }}>
                {isGenerating ? 'AI 초안 생성 중...' : 'AI 초안 생성 →'}
              </button>
            )}
          </div>
        )}

        {step === 2 && draftContent && editedContent && (
          <div style={{ padding: '16px 24px', height: 'calc(100vh - 120px)' }}>
            <div style={infoBoxS.amber}>
              ✎ 좌측 초안을 참조하면서 우측에서 내용을 수정하세요. 말투/톤은 다음 단계에서 AI가 조절합니다.
            </div>
            <ContentEditor original={draftContent} edited={editedContent} onChange={setEditedContent} />
            <div style={{ padding: '12px 16px', background: '#f9fafb', borderRadius: '8px', marginTop: '12px' }}>
              <h4 style={{ margin: '0 0 8px 0', fontSize: '14px' }}>상담자 입력 (환자 성향)</h4>
              <StaffForm value={staffForm} onChange={setStaffForm} />
            </div>
            <button onClick={handleRefine} disabled={isRefining} style={{ ...btnStyle('#b5976a'), width: '100%', padding: '16px', fontSize: '16px', fontWeight: 700, marginTop: '12px' }}>
              {isRefining ? 'AI 톤 변환 중...' : 'AI 톤 변환 (환자 맞춤)'}
            </button>
          </div>
        )}

        {step === 3 && displayContent && (
          <div style={{ display: 'flex', height: 'calc(100vh - 60px)' }}>
            <div style={{ flex: 1, overflow: 'auto', padding: '24px', borderRight: '1px solid #e5e7eb' }}>
              <div style={infoBoxS.green}>
                환자 성향이 반영된 톤으로 변환되었습니다. 내용을 최종 확인하세요.
              </div>
              <ContentEditor original={editedContent} edited={refinedContent} onChange={setRefinedContent} />
              <button onClick={handleMakeBrochure} style={{ ...btnStyle('#c45c5c'), width: '100%', padding: '16px', fontSize: '18px', fontWeight: 700, marginTop: '16px' }}>
                브로셔 만들기
              </button>
            </div>
            <div style={{ width: '420px', background: '#1a1a18', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '24px', overflow: 'auto', flexShrink: 0 }}>
              <div style={{ width: '375px', minHeight: '667px', background: '#fff', borderRadius: '24px', overflow: 'hidden', boxShadow: '0 25px 50px rgba(0,0,0,0.3)' }}>
                <BrochurePreview
                  patientName={report.patient_name}
                  consultDate={report.consult_date}
                  content={refinedContent}
                  photos={photos}
                  mode="preview"
                />
              </div>
            </div>
          </div>
        )}

        {step === 4 && displayContent && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '20px 0' }}>
            <div style={{ width: '100%', maxWidth: '800px', background: '#fff', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
              <BrochurePreview
                patientName={report.patient_name}
                consultDate={report.consult_date}
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

const btnStyle = (color) => ({
  padding: '10px 20px', background: color, color: '#fff', border: 'none', borderRadius: '8px',
  fontSize: '14px', fontWeight: 600, cursor: 'pointer',
})

const headerS = {
  bar: { display: 'flex', alignItems: 'center', padding: '10px 20px', background: '#fff', borderBottom: '1px solid #e5e7eb', gap: '16px', flexShrink: 0, zIndex: 10 },
  left: { display: 'flex', gap: '10px', alignItems: 'center' },
  steps: { display: 'flex', alignItems: 'center', gap: '4px', flex: 1, justifyContent: 'center' },
  right: { display: 'flex', gap: '8px', alignItems: 'center' },
}

const bannerS = {
  other: { padding: '8px 20px', background: '#fef3c7', color: '#92400e', borderBottom: '1px solid #fbbf24', fontSize: '13px', textAlign: 'center' },
}

const infoBoxS = {
  amber: { background: '#f5f2ed', border: '1px solid #d4c8b4', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', color: '#5a5a55', marginBottom: '12px' },
  green: { background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', color: '#065f46', marginBottom: '16px' },
}

const loadErrS = {
  wrap: { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: "'Pretendard', sans-serif" },
  card: { padding: '40px', background: '#fff', borderRadius: '12px', textAlign: 'center', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' },
  btn: { marginTop: '20px', padding: '10px 24px', background: '#b5976a', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: 600, cursor: 'pointer' },
}
