import { useState, useRef } from 'react'
import StaffForm from '../components/StaffForm'
import BlockEditor, { contentToBlocks, blocksToContent } from '../components/BlockEditor'
import BrochurePreview from '../components/BrochurePreview'
import { generatePatientText, saveCorrections } from '../lib/minimax'
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
  const [blocks, setBlocks] = useState([])
  const [selectedModules, setSelectedModules] = useState([])
  const [isGenerating, setIsGenerating] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [savedLink, setSavedLink] = useState(null)
  const [step, setStep] = useState(1) // 1: 입력, 2: 편집, 3: 미리보기

  // AI 원본 저장 (교정 비교용)
  const originalContentRef = useRef(null)

  // AI 텍스트 생성 → 블록으로 변환
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

  // 브로셔 미리보기로 전환 + 교정 사례 저장
  const handleMakeBrochure = async () => {
    // 사용자가 수정한 내용과 원본 비교 → 교정 사례 자동 저장
    if (originalContentRef.current) {
      const edited = blocksToContent(blocks)
      const orig = originalContentRef.current
      // 진단, 치료옵션, 추가사항 각각 비교
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
      // 사진 블록만 추출해서 업로드
      const photoBlocks = blocks.filter((b) => b.type === 'photo')
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
          uploadedBlocks.push({
            ...block,
            file: undefined,
            preview: undefined,
            url: urlData.publicUrl,
          })
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
          url: b.url,
          memo: b.memo,
          ratio: b.ratio,
        })),
        modules: selectedModules,
      })

      if (error) throw error

      const link = `${window.location.origin}/dental-report/report/${reportId}`
      setSavedLink(link)
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
            style={inputStyle}
          />
          <input
            type="date"
            value={consultDate}
            onChange={(e) => setConsultDate(e.target.value)}
            style={inputStyle}
          />
          <div style={{ flex: 1 }} />
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
                  width: '100%',
                  minHeight: '150px',
                  padding: '12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  fontSize: '14px',
                  resize: 'vertical',
                  fontFamily: 'inherit',
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
              style={{
                ...btnStyle('#7c3aed'),
                width: '100%',
                padding: '14px',
                fontSize: '16px',
              }}
            >
              {isGenerating ? 'AI 생성 중...' : 'AI 텍스트 생성'}
            </button>
          </>
        )}

        {/* Step 2: 블록 에디터 (워드형) */}
        {step === 2 && (
          <>
            <div style={{
              background: '#fffbeb',
              border: '1px solid #fde68a',
              borderRadius: '8px',
              padding: '10px 14px',
              fontSize: '13px',
              color: '#92400e',
              marginBottom: '16px',
            }}>
              텍스트를 수정하고, 원하는 위치에 [+ 사진] 버튼으로 사진을 삽입하세요.
              텍스트 영역에서 Ctrl+V로 바로 사진 붙여넣기도 가능합니다.
            </div>

            <BlockEditor blocks={blocks} onChange={setBlocks} />

            <button
              onClick={handleMakeBrochure}
              style={{
                ...btnStyle('#dc2626'),
                width: '100%',
                padding: '16px',
                fontSize: '18px',
                fontWeight: '700',
                marginTop: '16px',
              }}
            >
              브로셔 만들기
            </button>
          </>
        )}

        {/* Step 3: 미리보기 확인 */}
        {step === 3 && (
          <div style={{
            textAlign: 'center',
            padding: '40px 20px',
            color: '#6b7280',
            fontSize: '14px',
          }}>
            우측 미리보기를 확인하세요.<br />
            문제없으면 [저장 + 링크 생성] 버튼을 누르세요.
            {savedLink && (
              <div style={{
                marginTop: '20px',
                padding: '16px',
                background: '#ecfdf5',
                borderRadius: '10px',
                border: '1px solid #a7f3d0',
              }}>
                <div style={{ fontSize: '13px', color: '#065f46', marginBottom: '8px' }}>
                  발송 링크:
                </div>
                <div style={{
                  fontSize: '12px',
                  color: '#047857',
                  wordBreak: 'break-all',
                  fontFamily: 'monospace',
                }}>
                  {savedLink}
                </div>
              </div>
            )}
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
            blocks={blocks}
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
