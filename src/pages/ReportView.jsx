import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import BrochurePreview from '../components/BrochurePreview'
import { migrateToNewFormat } from '../lib/gemini'
import { loadTreatmentCases, loadStrengthCards } from '../lib/library'
import { loadCasesFromSheet } from '../lib/caseSheet'

export default function ReportView() {
  const { reportId } = useParams()
  const [report, setReport] = useState(null)
  const [selectedCases, setSelectedCases] = useState([])
  const [selectedStrengths, setSelectedStrengths] = useState([])
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

      // 선택된 케이스/장점 해결
      const caseIds = Array.isArray(data.selected_case_ids) ? data.selected_case_ids : []
      const strengthIds = Array.isArray(data.selected_strength_ids) ? data.selected_strength_ids : []
      if (caseIds.length || strengthIds.length) {
        // 케이스 정본은 구글시트(Editor 가 고를 때 쓰는 것과 같은 출처).
        // clinic_settings.treatment_cases 는 시트 도입 전 저장된 진단서 호환용으로만 합친다.
        const [sheetCases, legacyCases, allStrengths] = await Promise.all([
          caseIds.length ? loadCasesFromSheet() : Promise.resolve([]),
          caseIds.length ? loadTreatmentCases() : Promise.resolve([]),
          strengthIds.length ? loadStrengthCards() : Promise.resolve([]),
        ])
        const caseMap = new Map([...legacyCases, ...sheetCases].map(c => [c.id, c]))
        const strengthMap = new Map(allStrengths.map(c => [c.id, c]))
        setSelectedCases(caseIds.map(id => caseMap.get(id)).filter(Boolean))
        setSelectedStrengths(strengthIds.map(id => strengthMap.get(id)).filter(Boolean))
      }
    } catch {
      setError('진단서를 찾을 수 없습니다.')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#f5f2ed', fontFamily: "'Nanum Myeongjo', serif" }}>
        <div style={{ textAlign: 'center', color: '#5a5a55' }}>불러오는 중...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#f5f2ed', fontFamily: "'Nanum Myeongjo', serif" }}>
        <div style={{ textAlign: 'center', padding: '40px', background: '#fff', borderRadius: '16px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', maxWidth: '320px' }}>
          <div style={{ fontSize: '16px', fontWeight: 600, color: '#1a1a18', marginBottom: '8px' }}>프라임에스 치과교정과</div>
          <div style={{ fontSize: '14px', color: '#5a5a55' }}>{error}</div>
        </div>
      </div>
    )
  }

  const content = migrateToNewFormat(report.sections || {})

  return (
    <div style={{ background: '#e8e4de', minHeight: '100vh', fontFamily: "'Nanum Myeongjo', serif" }}>
      <div style={{ maxWidth: '960px', margin: '0 auto', background: '#fff', minHeight: '100vh', boxShadow: '0 0 40px rgba(0,0,0,0.08)' }}>
        <BrochurePreview
          patientName={report.patient_name}
          consultDate={report.consult_date}
          content={content}
          photos={report.photos || []}
          cases={selectedCases}
          strengths={selectedStrengths}
          mode="view"
        />
      </div>
    </div>
  )
}
