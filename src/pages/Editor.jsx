import { useState, useCallback } from 'react'
import StaffForm from '../components/StaffForm'
import PhotoUploader from '../components/PhotoUploader'
import BrochurePreview from '../components/BrochurePreview'
import { generatePatientText } from '../lib/minimax'
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

export default function Editor() {
  const [patientName, setPatientName] = useState('')
  const [consultDate, setConsultDate] = useState(
    new Date().toISOString().split('T')[0]
  )
  const [chartingText, setChartingText] = useState('')
  const [staffForm, setStaffForm] = useState(INITIAL_STAFF_FORM)
  const [photos, setPhotos] = useState([]) // [{ file, preview, memo, ratio }]
  const [generatedContent, setGeneratedContent] = useState(null)
  const [selectedModules, setSelectedModules] = useState([])
  const [isGenerating, setIsGenerating] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [savedLink, setSavedLink] = useState(null)
  const [step, setStep] = useState(1) // 1: 초안 작성, 2: 브로셔 미리보기

  // AI 텍스트 생성
  const handleGenerate = async () => {
    if (!chartingText.trim()) {
      alert('차팅 내용을 입력해주세요.')
      return
    }
    setIsGenerating(true)
    try {
      const result = await generatePatientText({ chartingText, staffForm })
      setGeneratedContent(result)
    } catch (err) {
      alert('AI 생성 실패: ' + err.message)
    } finally {
      setIsGenerating(false)
    }
  }

  // 브로셔 만들기
  const handleMakeBrochure = () => {
    if (!generatedContent) {
      alert('먼저 AI 텍스트를 생성해주세요.')
      return
    }
    setStep(2)
  }

  // 저장 + 링크 생성
  const handleSave = async () => {
    if (!patientName.trim()) {
      alert('환자명을 입력해주세요.')
      return
    }
    setIsSaving(true)
    try {
      // 사진 업로드
      const photoUrls = []
      for (const photo of photos) {
        const fileName = `${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`
        const { data, error } = await supabase.storage
          .from('dental-reports')
          .upload(fileName, photo.file, { contentType: photo.file.type })
        if (error) throw error
        const { data: urlData } = supabase.storage
          .from('dental-reports')
          .getPublicUrl(fileName)
        photoUrls.push({
          url: urlData.publicUrl,
          memo: photo.memo,
          ratio: photo.ratio,
        })
      }

      // 리포트 저장
      const reportId = crypto.randomUUID()
      const expiresAt = new Date()
      expiresAt.setDate(expiresAt.getDate() + 90)

      const { error } = await supabase.from('dental_reports').insert({
        id: reportId,
        patient_name: patientName,
        consult_date: consultDate,
        expires_at: expiresAt.toISOString(),
        sections: generatedContent,
        photos: photoUrls,
        modules: selectedModules,
      })

      if (error) throw error

      const link = `${window.location.origin}/report/${reportId}`
      setSavedLink(link)
      alert('저장 완료! 링크가 생성되었습니다.')
    } catch (err) {
      alert('저장 실패: ' + err.message)
    } finally {
      setIsSaving(false)
    }
  }

  // 링크 복사
  const handleCopyLink = () => {
    if (savedLink) {
      navigator.clipboard.writeText(savedLink)
      alert('링크가 복사되었습니다.')
    }
  }

  return (
    <div style={{ display: 'flex', height: '100vh', fontFamily: "'Pretendard', sans-serif" }}>
      {/* 좌측: 편집 패널 */}
      <div style={{
        flex: 1,
        overflow: 'auto',
        padding: '24px',
        borderRight: '1px solid #e5e7eb',
        background: '#fafafa',
      }}>
        {/* 상단 바 */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          marginBottom: '24px',
          flexWrap: 'wrap',
        }}>
          <input
            type="text"
            placeholder="환자명"
            value={patientName}
            onChange={(e) => setPatientName(e.target.value)}
            style={{
              padding: '8px 12px',
              border: '1px solid #d1d5db',
              borderRadius: '8px',
              fontSize: '15px',
              width: '120px',
            }}
          />
          <input
            type="date"
            value={consultDate}
            onChange={(e) => setConsultDate(e.target.value)}
            style={{
              padding: '8px 12px',
              border: '1px solid #d1d5db',
              borderRadius: '8px',
              fontSize: '15px',
            }}
          />
          <div style={{ flex: 1 }} />
          {step === 2 && savedLink && (
            <button onClick={handleCopyLink} style={btnStyle('#10b981')}>
              링크 복사
            </button>
          )}
          {step === 2 && (
            <button onClick={handleSave} disabled={isSaving} style={btnStyle('#2563eb')}>
              {isSaving ? '저장 중...' : '저장 + 링크 생성'}
            </button>
          )}
        </div>

        {step === 1 ? (
          <>
            {/* 의사 차팅 입력 */}
            <Section title="1. 차팅 입력 (EMR 복사붙여넣기)">
              <textarea
                placeholder="EMR에서 차팅 내용을 복사해서 붙여넣으세요..."
                value={chartingText}
                onChange={(e) => setChartingText(e.target.value)}
                style={{
                  width: '100%',
                  minHeight: '150px',
                  padding: '12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  fontSize: '14px',
                  resize: 'vertical',
                  fontFamily: 'inherit',
                }}
              />
            </Section>

            {/* 실장 폼 */}
            <Section title="2. 상담 정보 입력 (실장/팀장)">
              <StaffForm value={staffForm} onChange={setStaffForm} />
            </Section>

            {/* AI 생성 버튼 */}
            <button
              onClick={handleGenerate}
              disabled={isGenerating}
              style={{
                ...btnStyle('#7c3aed'),
                width: '100%',
                padding: '14px',
                fontSize: '16px',
                marginBottom: '20px',
              }}
            >
              {isGenerating ? 'AI 생성 중...' : 'AI 텍스트 생성'}
            </button>

            {/* 생성된 텍스트 편집 */}
            {generatedContent && (
              <Section title="3. AI 생성 결과 (수정 가능)">
                <label style={labelStyle}>오늘의 진단</label>
                <textarea
                  value={generatedContent.diagnosis}
                  onChange={(e) =>
                    setGeneratedContent({ ...generatedContent, diagnosis: e.target.value })
                  }
                  style={textareaStyle}
                />

                {generatedContent.treatmentOptions?.map((opt, i) => (
                  <div key={i} style={{ marginBottom: '12px' }}>
                    <label style={labelStyle}>치료 옵션 {i + 1}: {opt.name}</label>
                    <textarea
                      value={opt.description}
                      onChange={(e) => {
                        const newOptions = [...generatedContent.treatmentOptions]
                        newOptions[i] = { ...newOptions[i], description: e.target.value }
                        setGeneratedContent({ ...generatedContent, treatmentOptions: newOptions })
                      }}
                      style={textareaStyle}
                    />
                  </div>
                ))}

                <label style={labelStyle}>함께 알아두실 사항</label>
                <textarea
                  value={generatedContent.additionalNotes}
                  onChange={(e) =>
                    setGeneratedContent({ ...generatedContent, additionalNotes: e.target.value })
                  }
                  style={textareaStyle}
                />
              </Section>
            )}

            {/* 사진 */}
            <Section title="4. 사진 첨부">
              <PhotoUploader photos={photos} onChange={setPhotos} />
            </Section>

            {/* 브로셔 만들기 버튼 */}
            {generatedContent && (
              <button
                onClick={handleMakeBrochure}
                style={{
                  ...btnStyle('#dc2626'),
                  width: '100%',
                  padding: '16px',
                  fontSize: '18px',
                  fontWeight: '700',
                }}
              >
                브로셔 만들기
              </button>
            )}
          </>
        ) : (
          /* Step 2: 섹션 미세 조정 */
          <div>
            <button onClick={() => setStep(1)} style={btnStyle('#6b7280')}>
              ← 초안으로 돌아가기
            </button>
          </div>
        )}
      </div>

      {/* 우측: 모바일 미리보기 */}
      <div style={{
        width: '420px',
        background: '#1f2937',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: '24px',
        overflow: 'auto',
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
            content={generatedContent}
            photos={photos}
            modules={selectedModules}
          />
        </div>
      </div>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: '24px' }}>
      <h3 style={{
        fontSize: '15px',
        fontWeight: '600',
        color: '#374151',
        marginBottom: '12px',
      }}>
        {title}
      </h3>
      {children}
    </div>
  )
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

const labelStyle = {
  display: 'block',
  fontSize: '13px',
  fontWeight: '600',
  color: '#6b7280',
  marginBottom: '4px',
}

const textareaStyle = {
  width: '100%',
  minHeight: '80px',
  padding: '10px',
  border: '1px solid #d1d5db',
  borderRadius: '8px',
  fontSize: '14px',
  resize: 'vertical',
  marginBottom: '8px',
  fontFamily: 'inherit',
}
