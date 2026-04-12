import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import BrochurePreview from '../components/BrochurePreview'
import { contentToBlocks } from '../components/BlockEditor'

export default function ReportView() {
  const { reportId } = useParams()
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    loadReport()
  }, [reportId])

  const loadReport = async () => {
    try {
      const { data, error: fetchError } = await supabase
        .from('dental_reports')
        .select('*')
        .eq('id', reportId)
        .single()

      if (fetchError) throw fetchError

      if (new Date(data.expires_at) < new Date()) {
        setError('이 진단서 링크는 만료되었습니다.')
        return
      }

      setReport(data)
    } catch (err) {
      setError('진단서를 찾을 수 없습니다.')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        background: '#f8fafc',
        fontFamily: "'Pretendard', sans-serif",
      }}>
        <div style={{ textAlign: 'center', color: '#6b7280' }}>
          <div style={{ fontSize: '24px', marginBottom: '8px' }}>...</div>
          불러오는 중...
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        background: '#f8fafc',
        fontFamily: "'Pretendard', sans-serif",
      }}>
        <div style={{
          textAlign: 'center',
          padding: '40px',
          background: '#fff',
          borderRadius: '16px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
          maxWidth: '320px',
        }}>
          <div style={{ fontSize: '16px', fontWeight: '600', color: '#374151', marginBottom: '8px' }}>
            프라임S치과교정과
          </div>
          <div style={{ fontSize: '14px', color: '#6b7280' }}>{error}</div>
        </div>
      </div>
    )
  }

  // sections.blocks가 있으면 새 블록 형식, 없으면 구형식 호환
  const blocks = report.sections?.blocks
    ? report.sections.blocks
    : contentToBlocks(report.sections)

  return (
    <div style={{
      maxWidth: '480px',
      margin: '0 auto',
      background: '#fff',
      minHeight: '100vh',
      fontFamily: "'Pretendard', sans-serif",
    }}>
      <BrochurePreview
        patientName={report.patient_name}
        consultDate={report.consult_date}
        blocks={blocks}
        modules={report.modules || []}
      />
    </div>
  )
}
