import { useEffect, useRef, useState, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import StaffForm from '../components/StaffForm'
import ClinicalForm, { getEmptyClinicalForm, buildAutoSummary } from '../components/ClinicalForm'
import ContentEditor from '../components/ContentEditor'
import BrochurePreview from '../components/BrochurePreview'
import { composeReport, saveCorrections } from '../lib/gemini'
import { supabase } from '../lib/supabase'
import { getByChartNumber, updateReport, acquireLock, releaseLock, isOtherPcEditing, PROGRESS_STAGES, STEP_TO_STAGE } from '../lib/reports'
import { getPcLabel } from '../lib/session'

const INITIAL_STAFF_FORM = {
  personality: [], anxiety: [], costReaction: [], interests: [],
  willingness: 3, understanding: 3,
  specialCircumstances: '', memo: '',
}

const STEP_LABELS = [
  { num: 1, label: '진단 & 치료 계획' },
  { num: 2, label: '상담 관리' },
  { num: 3, label: 'AI 작성' },
  { num: 4, label: '모바일진단서' },
]

function timeAgo(date) {
  if (!date) return ''
  const diff = Math.floor((Date.now() - date.getTime()) / 1000)
  if (diff < 5) return '방금'
  if (diff < 60) return `${diff}초 전`
  const m = Math.floor(diff / 60)
  if (m < 60) return `${m}분 전`
  return `${Math.floor(m / 60)}시간 전`
}

export default function Editor() {
  const { chartNumber } = useParams()
  const navigate = useNavigate()

  const [report, setReport] = useState(null)
  const [loadError, setLoadError] = useState('')

  const [clinicalForm, setClinicalForm] = useState(getEmptyClinicalForm())
  const [clinicalPage, setClinicalPage] = useState(1)
  const [staffForm, setStaffForm] = useState(INITIAL_STAFF_FORM)
  const [refinedContent, setRefinedContent] = useState(null)
  const [editedContent, setEditedContent] = useState(null)
  const [photos, setPhotos] = useState([])
  const [step, setStep] = useState(1)

  const [isComposing, setIsComposing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [savedLink, setSavedLink] = useState(null)

  const [saveState, setSaveState] = useState('idle')
  const [lastSavedAt, setLastSavedAt] = useState(null)

  const hydratedRef = useRef(false)
  const saveTimerRef = useRef(null)

  useEffect(() => {
    let mounted = true
    setLoadError('')
    getByChartNumber(chartNumber).then(data => {
      if (!mounted) return
      if (!data) { setLoadError(`차트번호 "${chartNumber}" 환자를 찾을 수 없습니다.`); return }
      setReport(data)
      setClinicalForm(data.clinical_form || getEmptyClinicalForm())
      setStaffForm({ ...INITIAL_STAFF_FORM, ...(data.staff_form || {}) })
      if (data.sections && Object.keys(data.sections).length > 0) {
        setRefinedContent(data.sections)
        setEditedContent(data.sections)
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
    return () => {
      clearInterval(heartbeat)
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
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    setSaveState('pending')
    saveTimerRef.current = setTimeout(async () => {
      const progress = STEP_TO_STAGE[step] || report.progress_stage || 'diagnosis'
      const patch = {
        clinical_form: clinicalForm,
        staff_form: staffForm,
        progress_stage: report.progress_stage === 'done' ? 'done' : progress,
      }
      if (editedContent) patch.sections = editedContent
      setSaveState('saving')
      try {
        await updateReport(report.id, patch)
        setLastSavedAt(new Date())
        setSaveState('saved')
      } catch (err) {
        console.error('autosave failed', err)
        setSaveState('idle')
      }
    }, 1500)
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current) }
  }, [clinicalForm, staffForm, editedContent, step, report?.id])

  const otherPcEditing = useMemo(() => isOtherPcEditing(report, `step${step}`), [report, step])

  const summary = useMemo(() => {
    const auto = buildAutoSummary(clinicalForm)
    const saved = clinicalForm.summary || {}
    return {
      skeletal: saved.skeletal !== undefined && saved.skeletal !== '' ? saved.skeletal : auto.skeletal,
      dental:   saved.dental   !== undefined && saved.dental   !== '' ? saved.dental   : auto.dental,
      etc:      saved.etc      !== undefined && saved.etc      !== '' ? saved.etc      : auto.etc,
      treatmentPlans: (clinicalForm.treatmentPlans || []).map((_, i) =>
        (saved.treatmentPlans && saved.treatmentPlans[i]) || auto.treatmentPlans[i] || ''
      ),
      overall: saved.overall !== undefined && saved.overall !== '' ? saved.overall : auto.overall,
    }
  }, [clinicalForm])

  const handleComposeAndNext = async () => {
    setIsComposing(true)
    try {
      const result = await composeReport({ summary, staffForm })
      setRefinedContent(result)
      setEditedContent(JSON.parse(JSON.stringify(result)))
      setStep(3)
    } catch (err) {
      alert('AI 작성 실패: ' + err.message)
    } finally { setIsComposing(false) }
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
      if (refinedContent && editedContent) {
        saveCorrections(refinedContent.skeletalRelationship, editedContent.skeletalRelationship).catch(() => {})
        saveCorrections(refinedContent.dentalRelationship, editedContent.dentalRelationship).catch(() => {})
      }
      const expiresAt = new Date(); expiresAt.setDate(expiresAt.getDate() + 90)
      await updateReport(report.id, {
        sections: editedContent,
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

  const stage = PROGRESS_STAGES[report.progress_stage] || PROGRESS_STAGES.registered

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', fontFamily: "'Pretendard', sans-serif" }}>
      {otherPcEditing && (
        <div style={bannerS.other}>
          ⚠️ 다른 PC에서도 같은 단계를 열고 있습니다. (편집은 가능하나 덮어쓰기 충돌 주의)
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
          <SaveBadge state={saveState} at={lastSavedAt} />
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
            {clinicalPage === 3 && (
              <button onClick={() => setStep(2)} style={{ ...btnStyle('#b5976a'), width: '100%', padding: '14px', fontSize: '16px', marginTop: '16px' }}>
                다음: 상담 관리 →
              </button>
            )}
          </div>
        )}

        {step === 2 && (
          <div style={{ maxWidth: '860px', margin: '0 auto', padding: '24px' }}>
            <div style={infoBoxS.amber}>
              💡 환자 성향·의지·특이 상황이 AI 작성의 <strong>문체</strong>를 결정합니다. 내용은 이전 단계의 정리를 그대로 사용합니다.
            </div>
            <div style={{ background: '#fff', borderRadius: '12px', padding: '24px', border: '1px solid #e5e7eb' }}>
              <StaffForm value={staffForm} onChange={setStaffForm} />
            </div>
            <button onClick={handleComposeAndNext} disabled={isComposing} style={{ ...btnStyle('#b5976a'), width: '100%', padding: '16px', fontSize: '16px', fontWeight: 700, marginTop: '16px' }}>
              {isComposing ? 'AI 작성 중...' : '다음: AI 작성 →'}
            </button>
          </div>
        )}

        {step === 3 && editedContent && (
          <div style={{ display: 'flex', height: 'calc(100vh - 60px)' }}>
            <div style={{ flex: 1, overflow: 'auto', padding: '24px', borderRight: '1px solid #e5e7eb' }}>
              <div style={infoBoxS.green}>
                ✨ AI가 정리 소스와 환자 성향을 반영해 작성했습니다. 내용을 최종 확인·수정하세요.
              </div>
              <ContentEditor original={refinedContent} edited={editedContent} onChange={setEditedContent} />
              <button onClick={() => setStep(4)} style={{ ...btnStyle('#c45c5c'), width: '100%', padding: '16px', fontSize: '18px', fontWeight: 700, marginTop: '16px' }}>
                다음: 모바일 진단서 →
              </button>
            </div>
            <div style={{ width: '420px', background: '#1a1a18', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '24px', overflow: 'auto', flexShrink: 0 }}>
              <div style={{ width: '375px', minHeight: '667px', background: '#fff', borderRadius: '24px', overflow: 'hidden', boxShadow: '0 25px 50px rgba(0,0,0,0.3)' }}>
                <BrochurePreview
                  patientName={report.patient_name}
                  consultDate={report.consult_date}
                  content={editedContent}
                  photos={photos}
                  mode="preview"
                />
              </div>
            </div>
          </div>
        )}

        {step === 4 && editedContent && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '20px 0' }}>
            <div style={{ width: '100%', maxWidth: '800px', background: '#fff', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
              <BrochurePreview
                patientName={report.patient_name}
                consultDate={report.consult_date}
                content={editedContent}
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

function SaveBadge({ state, at }) {
  const label =
    state === 'saving' ? '💾 저장 중…' :
    state === 'pending' ? '✏️ 입력 중…' :
    state === 'saved' && at ? `💾 자동 저장됨 · ${timeAgo(at)}` :
    ''
  if (!label) return null
  return (
    <span style={{
      fontSize: '11px',
      color: state === 'saving' ? '#b5976a' : '#6b7280',
      background: '#f3f4f6',
      padding: '3px 8px',
      borderRadius: '6px',
    }}>{label}</span>
  )
}

const btnStyle = (color) => ({
  padding: '10px 20px', background: color, color: '#fff', border: 'none', borderRadius: '8px',
  fontSize: '14px', fontWeight: 600, cursor: 'pointer',
})

const headerS = {
  bar: { display: 'flex', alignItems: 'center', padding: '10px 20px', background: '#fff', borderBottom: '1px solid #e5e7eb', gap: '16px', flexShrink: 0, zIndex: 10 },
  left: { display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' },
  steps: { display: 'flex', alignItems: 'center', gap: '4px', flex: 1, justifyContent: 'center' },
  right: { display: 'flex', gap: '8px', alignItems: 'center' },
}

const bannerS = {
  other: { padding: '8px 20px', background: '#fef3c7', color: '#92400e', borderBottom: '1px solid #fbbf24', fontSize: '13px', textAlign: 'center' },
}

const infoBoxS = {
  amber: { background: '#f5f2ed', border: '1px solid #d4c8b4', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', color: '#5a5a55', marginBottom: '16px' },
  green: { background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', color: '#065f46', marginBottom: '16px' },
}

const loadErrS = {
  wrap: { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: "'Pretendard', sans-serif" },
  card: { padding: '40px', background: '#fff', borderRadius: '12px', textAlign: 'center', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' },
  btn: { marginTop: '20px', padding: '10px 24px', background: '#b5976a', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: 600, cursor: 'pointer' },
}
