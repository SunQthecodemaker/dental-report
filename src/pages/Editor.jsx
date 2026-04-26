import { useEffect, useRef, useState, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import StaffForm from '../components/StaffForm'
import ClinicalForm, { getEmptyClinicalForm, buildAutoSummary, buildCombinedSummary } from '../components/ClinicalForm'
import ContentEditor from '../components/ContentEditor'
import BrochurePreview from '../components/BrochurePreview'
import PhotoMarkerModal from '../components/PhotoMarkerModal'
import { serializeMarkings } from '../lib/markings'
import { loadTreatmentCases, loadStrengthCards, normalizeTags } from '../lib/library'
import CaseStrengthSelector from '../components/CaseStrengthSelector'
import { composeReport, saveCorrections, migrateToNewFormat, extractImagesBySection, reinsertImagesBySection, suggestTags } from '../lib/gemini'
import { supabase } from '../lib/supabase'
import { loadClinicalFormConfig } from '../lib/formConfig'
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
  { num: 3, label: '초안' },
  { num: 4, label: '케이스 · 어필포인트' },
  { num: 5, label: '진단서 디자이너' },
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

  // 라이브러리(전체) + 선택된 id
  const [allCases, setAllCases] = useState([])
  const [allStrengths, setAllStrengths] = useState([])
  const [selectedCaseIds, setSelectedCaseIds] = useState([])
  const [selectedStrengthIds, setSelectedStrengthIds] = useState([])
  const [selectedCaseTags, setSelectedCaseTags] = useState([])
  const [selectedStrengthTags, setSelectedStrengthTags] = useState([])
  const [tagSuggestions, setTagSuggestions] = useState(null)  // { caseTags: [...], strengthTags: [...], at: ISO }
  const [isSuggestingTags, setIsSuggestingTags] = useState(false)

  const [isComposing, setIsComposing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false)
  const [savedLink, setSavedLink] = useState(null)
  const [designerKey, setDesignerKey] = useState(0)  // 디자인하기 누를 때마다 증가 → 브로셔 강제 remount
  const [markerTarget, setMarkerTarget] = useState(null)  // { src, markings } or null
  const editorCommitRef = useRef(null)

  const [saveState, setSaveState] = useState('idle')
  const [lastSavedAt, setLastSavedAt] = useState(null)

  // 진단/치료계획 폼 항목 설정 (Settings 에서 편집 가능)
  const [formConfig, setFormConfig] = useState(null)

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
        const migrated = migrateToNewFormat(data.sections)
        setRefinedContent(migrated)
        setEditedContent(JSON.parse(JSON.stringify(migrated)))
      }
      setPhotos(data.photos || [])
      setSelectedCaseIds(Array.isArray(data.selected_case_ids) ? data.selected_case_ids : [])
      setSelectedStrengthIds(Array.isArray(data.selected_strength_ids) ? data.selected_strength_ids : [])
      setSelectedCaseTags(Array.isArray(data.selected_case_tags) ? data.selected_case_tags : [])
      setSelectedStrengthTags(Array.isArray(data.selected_strength_tags) ? data.selected_strength_tags : [])
      setTagSuggestions(data.tag_suggestions || null)
      hydratedRef.current = true
    }).catch(err => { if (mounted) setLoadError(err.message) })
    // 라이브러리 + 폼 설정 병렬 로드
    Promise.all([loadTreatmentCases(), loadStrengthCards()])
      .then(([c, s]) => { if (mounted) { setAllCases(c); setAllStrengths(s) } })
      .catch(() => {})
    loadClinicalFormConfig()
      .then((cfg) => { if (mounted) setFormConfig(cfg) })
      .catch(() => {})
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
        selected_case_ids: selectedCaseIds,
        selected_strength_ids: selectedStrengthIds,
        selected_case_tags: selectedCaseTags,
        selected_strength_tags: selectedStrengthTags,
        progress_stage: report.progress_stage === 'done' ? 'done' : progress,
      }
      if (editedContent) patch.sections = editedContent
      if (tagSuggestions) patch.tag_suggestions = tagSuggestions
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
  }, [clinicalForm, staffForm, editedContent, selectedCaseIds, selectedStrengthIds, selectedCaseTags, selectedStrengthTags, tagSuggestions, step, report?.id])

  const otherPcEditing = useMemo(() => isOtherPcEditing(report, `step${step}`), [report, step])

  // 선택된 id → 실제 객체 배열 (순서 유지)
  const selectedCases = useMemo(() => {
    const map = new Map(allCases.map(c => [c.id, c]))
    return selectedCaseIds.map(id => map.get(id)).filter(Boolean)
  }, [allCases, selectedCaseIds])
  const selectedStrengths = useMemo(() => {
    const map = new Map(allStrengths.map(s => [s.id, s]))
    return selectedStrengthIds.map(id => map.get(id)).filter(Boolean)
  }, [allStrengths, selectedStrengthIds])

  const summary = useMemo(() => {
    const auto = buildAutoSummary(clinicalForm, formConfig?.diagnosis)
    const saved = clinicalForm.summary || {}
    const combined = (saved.combined && saved.combined.length > 0)
      ? saved.combined
      : buildCombinedSummary(clinicalForm, formConfig?.diagnosis)
    return {
      combined,
      // 하위호환: 구 코드 경로/브로셔 등이 섹션별 필드 참조할 수 있어 유지
      skeletal: saved.skeletal !== undefined && saved.skeletal !== '' ? saved.skeletal : auto.skeletal,
      dental:   saved.dental   !== undefined && saved.dental   !== '' ? saved.dental   : auto.dental,
      etc:      saved.etc      !== undefined && saved.etc      !== '' ? saved.etc      : auto.etc,
      treatmentPlans: (clinicalForm.treatmentPlans || []).map((_, i) =>
        (saved.treatmentPlans && saved.treatmentPlans[i]) || auto.treatmentPlans[i] || ''
      ),
      overall: saved.overall !== undefined && saved.overall !== '' ? saved.overall : auto.overall,
    }
  }, [clinicalForm, formConfig])

  const handleComposeAndNext = async () => {
    setIsComposing(true)
    try {
      // 기존 body에 삽입된 사진을 섹션별로 보존 (AI 재호출 시 분실 방지)
      const preservedImages = extractImagesBySection(editedContent?.body || '')

      const result = await composeReport({ summary, staffForm })

      // 새 body에 이전 섹션별 사진 재삽입
      const mergedBody = reinsertImagesBySection(result.body || '', preservedImages)
      const merged = { ...result, body: mergedBody }

      setRefinedContent(merged)
      setEditedContent(JSON.parse(JSON.stringify(merged)))
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
        saveCorrections(refinedContent.body, editedContent.body).catch(() => {})
      }
      const expiresAt = new Date(); expiresAt.setDate(expiresAt.getDate() + 90)
      await updateReport(report.id, {
        sections: editedContent,
        photos: uploadedPhotos,
        clinical_form: clinicalForm,
        staff_form: staffForm,
        selected_case_ids: selectedCaseIds,
        selected_strength_ids: selectedStrengthIds,
        selected_case_tags: selectedCaseTags,
        selected_strength_tags: selectedStrengthTags,
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

  // 라이브러리에서 사용 중인 태그 풀
  const casePool = useMemo(() => {
    const m = new Map()
    for (const c of allCases) for (const t of (c.tags || [])) {
      const lc = String(t).toLowerCase(); if (!m.has(lc)) m.set(lc, t)
    }
    return [...m.values()]
  }, [allCases])
  const strengthPool = useMemo(() => {
    const m = new Map()
    for (const s of allStrengths) for (const t of (s.tags || [])) {
      const lc = String(t).toLowerCase(); if (!m.has(lc)) m.set(lc, t)
    }
    return [...m.values()]
  }, [allStrengths])

  // AI 태그 추천 호출 (수동 + 자동)
  const runSuggestTags = async () => {
    if (isSuggestingTags) return
    if (casePool.length === 0 && strengthPool.length === 0) return
    setIsSuggestingTags(true)
    try {
      const result = await suggestTags({ summary, staffForm, casePool, strengthPool })
      const next = { caseTags: normalizeTags(result.caseTags), strengthTags: normalizeTags(result.strengthTags), at: new Date().toISOString() }
      setTagSuggestions(next)
      setSelectedCaseTags(next.caseTags)
      setSelectedStrengthTags(next.strengthTags)
    } catch (err) {
      console.error('suggestTags failed', err)
      alert('AI 태그 추천 실패: ' + err.message)
    } finally {
      setIsSuggestingTags(false)
    }
  }

  // Step 4 첫 진입 시 자동 추천 1회 (캐시 없을 때만)
  useEffect(() => {
    if (step !== 4) return
    if (!hydratedRef.current) return
    if (tagSuggestions) return
    if (casePool.length === 0 && strengthPool.length === 0) return
    runSuggestTags()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, hydratedRef.current, casePool.length, strengthPool.length, tagSuggestions])

  // 진단서 디자이너에서 figcaption 편집 시 body HTML에 반영
  const handleUpdateCaption = (imgSrc, newCaption) => {
    if (!editedContent?.body || !imgSrc) return
    try {
      const parser = new DOMParser()
      const doc = parser.parseFromString(`<div id="root">${editedContent.body}</div>`, 'text/html')
      const root = doc.getElementById('root')
      if (!root) return
      const targets = root.querySelectorAll(`img[src="${imgSrc}"]`)
      let changed = false
      targets.forEach(img => {
        let fig = img.closest('figure')
        if (!fig) {
          fig = document.createElement('figure')
          img.parentNode.insertBefore(fig, img)
          fig.appendChild(img)
        }
        let cap = fig.querySelector('figcaption')
        if (!cap) {
          cap = document.createElement('figcaption')
          fig.appendChild(cap)
        }
        if (cap.textContent !== newCaption) {
          cap.textContent = newCaption
          changed = true
        }
      })
      if (changed) setEditedContent({ ...editedContent, body: root.innerHTML })
    } catch (err) { console.warn('caption update failed', err) }
  }

  // 진단서 디자이너에서 맞춤 안내 편집
  const handleUpdateNote = (newNote) => {
    if (newNote === editedContent?.personalNote) return
    setEditedContent({ ...editedContent, personalNote: newNote })
  }

  // "디자인하기" 버튼 (step 4) — AI 재호출해서 레이아웃 새로 생성.
  // 기존 body의 섹션별 사진은 보존, 텍스트와 섹션 구조는 새로 생성.
  // 헤더 탭 클릭은 그냥 changeStep(5)로 이동만 (재생성 없음).
  const handleRedesign = async () => {
    setIsComposing(true)
    try {
      const preservedImages = extractImagesBySection(editedContent?.body || '')
      const result = await composeReport({ summary, staffForm })
      const mergedBody = reinsertImagesBySection(result.body || '', preservedImages)
      const merged = { ...result, body: mergedBody }
      setRefinedContent(merged)
      setEditedContent(JSON.parse(JSON.stringify(merged)))
      setDesignerKey(k => k + 1)
      setStep(5)
    } catch (err) {
      alert('디자인 재생성 실패: ' + err.message)
    } finally { setIsComposing(false) }
  }

  // 📍 마킹 모달 열기 (이미지 src + 현재 마킹 전달)
  const handleOpenMarker = (src, markings) => {
    if (!src) return
    setMarkerTarget({ src, markings: Array.isArray(markings) ? markings : [] })
  }

  // 📍 마킹 저장: body HTML에서 해당 img 찾아 data-markings 속성 갱신
  const handleSaveMarkings = (markings) => {
    const target = markerTarget
    if (!target || !editedContent?.body) { setMarkerTarget(null); return }
    try {
      const parser = new DOMParser()
      const doc = parser.parseFromString(`<div id="root">${editedContent.body}</div>`, 'text/html')
      const root = doc.getElementById('root')
      if (!root) { setMarkerTarget(null); return }
      const imgs = root.querySelectorAll(`img[src="${target.src}"]`)
      const serialized = serializeMarkings(markings)
      let changed = false
      imgs.forEach(img => {
        if (serialized) img.setAttribute('data-markings', serialized)
        else img.removeAttribute('data-markings')
        changed = true
      })
      if (changed) {
        setEditedContent({ ...editedContent, body: root.innerHTML })
        setDesignerKey(k => k + 1)  // 브로셔 강제 remount (parseSections 재실행)
      }
    } catch (err) { console.warn('markings update failed', err) }
    setMarkerTarget(null)
  }

  // 단계 전환 핸들러: 업로드 중 차단 + 편집 flush
  const changeStep = (num) => {
    if (num === step) return
    if (isUploadingPhoto) {
      alert('사진 업로드 중입니다. 완료 후 이동해주세요.')
      return
    }
    // 활성 포커스 flush — ContentEditor/figcaption onBlur → commit 보장
    if (document.activeElement instanceof HTMLElement) {
      try { document.activeElement.blur() } catch { /* noop */ }
    }
    // ContentEditor의 최신 innerHTML을 강제로 state에 밀어넣음
    if (editorCommitRef.current) {
      try { editorCommitRef.current() } catch { /* noop */ }
    }
    // 디자이너(→5)로 이동이면 브로셔 강제 remount
    if (num === 5) {
      setDesignerKey(k => k + 1)
    }
    // 약간의 지연 후 setStep (commit이 동기 setState를 스케줄할 시간 부여)
    setTimeout(() => setStep(num), 0)
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
          <ConsultDateButton
            value={report.consult_date}
            onChange={(v) => {
              setReport(r => ({ ...r, consult_date: v }))
              if (report.id) updateReport(report.id, { consult_date: v }).catch(() => {})
            }}
          />
          <span style={{ padding: '2px 8px', borderRadius: '10px', background: stage.color, color: '#fff', fontSize: '11px', fontWeight: 600 }}>
            {stage.label}
          </span>
          <SaveBadge state={saveState} at={lastSavedAt} />
        </div>

        <div style={headerS.steps}>
          {STEP_LABELS.map(({ num, label }) => (
            <div key={num} onClick={() => changeStep(num)} style={{ display: 'flex', alignItems: 'center', gap: '6px', opacity: num === step ? 1 : 0.5, cursor: isUploadingPhoto ? 'not-allowed' : 'pointer' }}>
              <div style={{
                width: '22px', height: '22px', borderRadius: '50%',
                background: num === step ? '#b5976a' : num < step ? '#6a9b7a' : '#d1d5db',
                color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700,
              }}>{num < step ? '✓' : num}</div>
              <span style={{ fontSize: '13px', fontWeight: num === step ? 600 : 400, color: num === step ? '#1a1a18' : '#9ca3af' }}>{label}</span>
              {num < STEP_LABELS.length && <span style={{ color: '#d1d5db', margin: '0 2px' }}>→</span>}
            </div>
          ))}
        </div>

        <div style={headerS.right}>
          <span style={{ fontSize: '12px', color: '#9ca3af' }}>{getPcLabel()}</span>
          <button onClick={() => navigate('/settings')} style={{ ...btnStyle('#374151'), fontSize: '13px', padding: '8px 14px' }}>AI 설정</button>
          {step === 5 && savedLink && <button onClick={handleCopyLink} style={btnStyle('#6a9b7a')}>링크 복사</button>}
          {step === 5 && <button onClick={handleSave} disabled={isSaving} style={btnStyle('#b5976a')}>{isSaving ? '저장 중...' : '저장 + 링크 생성'}</button>}
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', background: step === 5 ? '#1a1a18' : '#fafafa' }}>

        {step === 1 && (
          <div style={{ maxWidth: '860px', margin: '0 auto', padding: '24px' }}>
            <ClinicalForm
              value={clinicalForm}
              onChange={setClinicalForm}
              page={clinicalPage}
              onPageChange={setClinicalPage}
              diagnosisConfig={formConfig?.diagnosis}
              treatmentConfig={formConfig?.treatment}
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
              <ContentEditor original={refinedContent} edited={editedContent} onChange={setEditedContent} onUploadingChange={setIsUploadingPhoto} commitRef={editorCommitRef} />
              <button
                onClick={() => changeStep(4)}
                disabled={isUploadingPhoto}
                style={{
                  ...btnStyle('#c45c5c'),
                  width: '100%', padding: '16px', fontSize: '18px', fontWeight: 700, marginTop: '16px',
                  opacity: isUploadingPhoto ? 0.55 : 1,
                  cursor: isUploadingPhoto ? 'not-allowed' : 'pointer',
                }}
              >
                {isUploadingPhoto ? '📤 사진 업로드 중... 완료 후 이동됩니다' : '다음: 케이스 · 어필포인트 →'}
              </button>
            </div>
            <div style={{ width: '420px', background: '#1a1a18', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '24px', overflow: 'auto', flexShrink: 0 }}>
              <div style={{ width: '375px', minHeight: '667px', background: '#fff', borderRadius: '24px', overflow: 'hidden', boxShadow: '0 25px 50px rgba(0,0,0,0.3)' }}>
                <BrochurePreview
                  patientName={report.patient_name}
                  consultDate={report.consult_date}
                  content={editedContent}
                  photos={photos}
                  cases={selectedCases}
                  strengths={selectedStrengths}
                  mode="preview"
                />
              </div>
            </div>
          </div>
        )}

        {step === 4 && (
          <div style={{ display: 'flex', height: 'calc(100vh - 60px)' }}>
            <div style={{ flex: 1, overflow: 'auto', padding: '24px', borderRight: '1px solid #e5e7eb' }}>
              <div style={infoBoxS.amber}>
                💡 이 환자의 진단서에 포함할 <strong>유사 치료 사례</strong>와 <strong>어필포인트</strong>를 선택하세요. (복수 선택 / 선택 안 함 모두 가능)
              </div>
              <CaseStrengthSelector
                cases={allCases}
                strengths={allStrengths}
                selectedCaseIds={selectedCaseIds}
                selectedStrengthIds={selectedStrengthIds}
                onChangeCases={setSelectedCaseIds}
                onChangeStrengths={setSelectedStrengthIds}
                caseTags={selectedCaseTags}
                strengthTags={selectedStrengthTags}
                onChangeCaseTags={setSelectedCaseTags}
                onChangeStrengthTags={setSelectedStrengthTags}
                onSuggestTags={runSuggestTags}
                isSuggesting={isSuggestingTags}
              />
              <button
                onClick={handleRedesign}
                disabled={isComposing}
                style={{
                  ...btnStyle('#c45c5c'),
                  width: '100%', padding: '16px', fontSize: '18px', fontWeight: 700, marginTop: '16px',
                  opacity: isComposing ? 0.6 : 1,
                  cursor: isComposing ? 'not-allowed' : 'pointer',
                }}
              >
                {isComposing ? '🤖 AI가 디자인 재생성 중…' : '디자인하기 🪄 (AI 재생성)'}
              </button>
              <div style={{ fontSize: 12, color: '#9ca3af', textAlign: 'center', marginTop: 8 }}>
                버튼 클릭 시 AI가 누락된 섹션 확인하고 레이아웃 새로 생성. 기존 삽입 사진은 섹션별로 보존.<br />
                이미 디자인된 결과를 다시 보려면 위 헤더의 <strong>"진단서 디자이너"</strong> 탭을 클릭하세요.
              </div>
            </div>
            <div style={{ width: '420px', background: '#1a1a18', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '24px', overflow: 'auto', flexShrink: 0 }}>
              <div style={{ width: '375px', minHeight: '667px', background: '#fff', borderRadius: '24px', overflow: 'hidden', boxShadow: '0 25px 50px rgba(0,0,0,0.3)' }}>
                <BrochurePreview
                  patientName={report.patient_name}
                  consultDate={report.consult_date}
                  content={editedContent}
                  photos={photos}
                  cases={selectedCases}
                  strengths={selectedStrengths}
                  mode="preview"
                />
              </div>
            </div>
          </div>
        )}

        {step === 5 && editedContent && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '20px 0' }}>
            <div style={{ width: '100%', maxWidth: '800px', background: '#fff', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
              <BrochurePreview
                key={designerKey}
                patientName={report.patient_name}
                consultDate={report.consult_date}
                content={editedContent}
                photos={photos}
                cases={selectedCases}
                strengths={selectedStrengths}
                mode="design"
                onUpdateCaption={handleUpdateCaption}
                onUpdateNote={handleUpdateNote}
                onOpenMarker={handleOpenMarker}
              />
            </div>
          </div>
        )}
      </div>

      {markerTarget && (
        <PhotoMarkerModal
          src={markerTarget.src}
          initialMarkings={markerTarget.markings}
          onSave={handleSaveMarkings}
          onClose={() => setMarkerTarget(null)}
        />
      )}
    </div>
  )
}

function ConsultDateButton({ value, onChange }) {
  const inputRef = useRef(null)
  const open = () => {
    const el = inputRef.current
    if (!el) return
    if (typeof el.showPicker === 'function') {
      try { el.showPicker(); return } catch { /* fallthrough */ }
    }
    el.click()
  }
  const display = value || '날짜 선택'
  return (
    <span style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        type="button"
        onClick={open}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '4px 10px',
          background: '#fff',
          border: '1px solid #d1d5db',
          borderRadius: 6,
          fontSize: 12,
          fontWeight: 500,
          color: value ? '#1f2937' : '#9ca3af',
          cursor: 'pointer',
          fontFamily: 'inherit',
          lineHeight: 1.6,
        }}
        title="상담 날짜 선택"
      >
        <span style={{ fontSize: 13 }}>📅</span>
        <span style={{ color: '#6b7280', fontSize: 11 }}>상담일</span>
        <span>{display}</span>
      </button>
      <input
        ref={inputRef}
        type="date"
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, pointerEvents: 'none' }}
        tabIndex={-1}
        aria-hidden
      />
    </span>
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
  bar: {
    display: 'grid',
    gridTemplateColumns: '1fr auto 1fr',
    alignItems: 'center',
    padding: '10px 20px',
    background: '#fff',
    borderBottom: '1px solid #e5e7eb',
    gap: '16px',
    flexShrink: 0,
    zIndex: 10,
  },
  left: { display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', justifySelf: 'start', minWidth: 0 },
  steps: { display: 'flex', alignItems: 'center', gap: '4px', justifySelf: 'center', whiteSpace: 'nowrap' },
  right: { display: 'flex', gap: '8px', alignItems: 'center', justifySelf: 'end', minWidth: 0 },
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
