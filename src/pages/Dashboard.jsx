import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { createPatient, listReports, isOtherPcEditing, isLockStale, PROGRESS_STAGES } from '../lib/reports'
import { findAvailableChartNumber, makeBaseChartNumber, isChartNumberTaken, normalizeBirth } from '../lib/chartNumber'
import { getSessionId, getPcName, setPcName, getPcLabel } from '../lib/session'

export default function Dashboard() {
  const navigate = useNavigate()

  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)

  const [search, setSearch] = useState('')
  const [dateRange, setDateRange] = useState('all')
  const [hideCompleted, setHideCompleted] = useState(false)

  const [form, setForm] = useState({ name: '', birth: '', chartNumber: '', cc: '' })
  const [chartManual, setChartManual] = useState(false)
  const [creating, setCreating] = useState(false)
  const [chartLookup, setChartLookup] = useState(false)
  const [formError, setFormError] = useState('')

  const [pcName, setPcNameState] = useState(getPcName())
  const [pcEditOpen, setPcEditOpen] = useState(false)

  const reloadTimer = useRef(null)
  const scheduleReload = () => {
    if (reloadTimer.current) clearTimeout(reloadTimer.current)
    reloadTimer.current = setTimeout(() => reload(), 200)
  }

  async function reload() {
    setLoading(true)
    try {
      const data = await listReports({ search, dateRange, hideCompleted })
      setReports(data)
    } catch (err) {
      console.error(err)
    } finally { setLoading(false) }
  }

  useEffect(() => { reload() }, [search, dateRange, hideCompleted])

  useEffect(() => {
    const channel = supabase
      .channel('dental_reports_dashboard')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dental_reports' }, () => {
        scheduleReload()
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  useEffect(() => {
    if (chartManual) return
    const base = makeBaseChartNumber(form.name, form.birth)
    if (!base) {
      setForm(f => ({ ...f, chartNumber: '' }))
      return
    }
    setChartLookup(true)
    findAvailableChartNumber(form.name, form.birth)
      .then(c => setForm(f => (chartManual ? f : { ...f, chartNumber: c })))
      .finally(() => setChartLookup(false))
  }, [form.name, form.birth, chartManual])

  async function handleCreate(goToEditor) {
    setFormError('')
    if (!form.name.trim()) { setFormError('이름을 입력하세요.'); return }
    const birth = normalizeBirth(form.birth)
    if (birth.length !== 6) { setFormError('생년월일 6자리(YYMMDD)를 입력하세요.'); return }
    const chartNumber = (form.chartNumber || '').trim()
    if (!chartNumber) { setFormError('차트번호가 비어있습니다.'); return }

    setCreating(true)
    try {
      if (await isChartNumberTaken(chartNumber)) {
        setFormError(`이미 등록된 차트번호입니다: ${chartNumber}`)
        setCreating(false)
        return
      }
      const created = await createPatient({
        name: form.name.trim(),
        birth,
        chartNumber,
        cc: form.cc.trim(),
      })
      setForm({ name: '', birth: '', chartNumber: '', cc: '' })
      setChartManual(false)
      if (goToEditor) {
        navigate(`/editor/${encodeURIComponent(created.chart_number)}`)
      } else {
        reload()
      }
    } catch (err) {
      setFormError(err.message || '등록 실패')
    } finally { setCreating(false) }
  }

  const filteredReports = useMemo(() => reports, [reports])

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <h1 style={styles.title}>🦷 프라임에스 모바일 진단서</h1>
        <div style={styles.headerRight}>
          <button onClick={() => setPcEditOpen(true)} style={styles.pcBadge}>
            이 PC: <strong style={{ color: '#b5976a' }}>{getPcLabel()}</strong>
          </button>
          <button onClick={() => navigate('/settings')} style={styles.settingsBtn}>AI 설정</button>
        </div>
      </div>

      <div style={styles.body}>
        {/* 좌측: 리스트 */}
        <div style={styles.left}>
          <div style={styles.searchRow}>
            <input
              placeholder="🔍 이름 또는 차트번호 검색"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={styles.searchInput}
            />
            <select value={dateRange} onChange={e => setDateRange(e.target.value)} style={styles.dateSelect}>
              <option value="all">전체</option>
              <option value="today">오늘</option>
              <option value="week">최근 1주</option>
              <option value="month">최근 1개월</option>
            </select>
            <label style={styles.toggleLabel}>
              <input type="checkbox" checked={hideCompleted} onChange={e => setHideCompleted(e.target.checked)} />
              완료 숨김
            </label>
          </div>

          <div style={styles.listCount}>
            {loading ? '불러오는 중…' : `${filteredReports.length}건`}
          </div>

          <div style={styles.list}>
            {filteredReports.length === 0 && !loading && (
              <div style={styles.empty}>등록된 환자가 없습니다.</div>
            )}
            {filteredReports.map(r => (
              <ReportCard key={r.id} report={r} onOpen={() => navigate(`/editor/${encodeURIComponent(r.chart_number)}`)} />
            ))}
          </div>
        </div>

        {/* 우측: 신규 등록 (메인) */}
        <div style={styles.right}>
          <h2 style={styles.sectionTitle}>➕ 신규 환자 등록</h2>

          <div style={styles.inlineRow}>
            <div style={{ flex: 2 }}>
              <label style={styles.label}>이름</label>
              <input
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                style={styles.input}
                placeholder="홍길동"
                autoFocus
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={styles.label}>생년월일</label>
              <input
                value={form.birth}
                onChange={e => setForm({ ...form, birth: e.target.value.replace(/\D/g, '').slice(0, 8) })}
                style={styles.input}
                placeholder="810108"
                maxLength={8}
                inputMode="numeric"
              />
            </div>
            <div style={{ flex: 2 }}>
              <label style={styles.label}>
                차트번호 {!chartManual && form.chartNumber && <span style={styles.autoBadge}>자동</span>}
              </label>
              <input
                value={form.chartNumber}
                onChange={e => { setChartManual(true); setForm({ ...form, chartNumber: e.target.value }) }}
                style={styles.input}
                placeholder="이름+생일 자동"
              />
            </div>
          </div>

          <div style={styles.ccGroup}>
            <label style={styles.label}>주호소 (C.C)</label>
            <textarea
              value={form.cc}
              onChange={e => setForm({ ...form, cc: e.target.value })}
              style={styles.ccTextarea}
              placeholder="환자 주호소 / 상담 내용을 자유롭게 기재하세요"
              rows={10}
            />
          </div>

          {formError && <div style={styles.error}>{formError}</div>}

          <div style={styles.btnRow}>
            <button onClick={() => handleCreate(true)} disabled={creating} style={{ ...styles.primaryBtn, flex: 2 }}>
              {creating ? '등록 중…' : '등록 + 진단 시작'}
            </button>
            <button onClick={() => handleCreate(false)} disabled={creating} style={{ ...styles.secondaryBtn, flex: 1 }}>
              등록만
            </button>
          </div>
        </div>
      </div>

      {pcEditOpen && (
        <PcNameModal
          initial={pcName}
          onSave={(v) => { setPcName(v); setPcNameState(v); setPcEditOpen(false) }}
          onClose={() => setPcEditOpen(false)}
        />
      )}
    </div>
  )
}

function ReportCard({ report, onOpen }) {
  const stage = PROGRESS_STAGES[report.progress_stage] || PROGRESS_STAGES.registered
  const otherPc = isOtherPcEditing(report, null)
  const updatedAgo = timeAgo(report.updated_at)

  return (
    <button onClick={onOpen} style={styles.card}>
      <div style={styles.cardLine1}>
        <strong style={{ fontSize: '13px' }}>{report.patient_name}</strong>
        <span style={{ color: '#9ca3af', fontSize: '11px', marginLeft: '6px' }}>{report.chart_number}</span>
      </div>
      <div style={styles.cardLine2}>
        <span style={{ ...styles.stageBadge, background: stage.color }}>{stage.label}</span>
        <span style={styles.cardMeta}>{updatedAgo}{otherPc && ' · 🔴'}</span>
      </div>
    </button>
  )
}

function PcNameModal({ initial, onSave, onClose }) {
  const [v, setV] = useState(initial || '')
  return (
    <div style={styles.modalBg}>
      <div style={styles.modal}>
        <h3 style={{ marginTop: 0 }}>이 PC의 별명</h3>
        <p style={{ color: '#6b7280', fontSize: '13px' }}>다른 PC에서 편집 중일 때 누구인지 구분할 수 있게 합니다.</p>
        <input value={v} onChange={e => setV(e.target.value)} placeholder="예: 데스크, 1진료실, 상담실" style={styles.input} />
        <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
          <button onClick={onClose} style={{ ...styles.secondaryBtn, flex: 1 }}>취소</button>
          <button onClick={() => onSave(v.trim())} style={{ ...styles.primaryBtn, flex: 1 }}>저장</button>
        </div>
      </div>
    </div>
  )
}

function timeAgo(iso) {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return '방금'
  if (m < 60) return `${m}분 전`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}시간 전`
  const d = Math.floor(h / 24)
  return `${d}일 전`
}

const styles = {
  page: { display: 'flex', flexDirection: 'column', height: '100vh', fontFamily: "'Pretendard', sans-serif", background: '#f9fafb' },
  header: { display: 'flex', alignItems: 'center', padding: '14px 24px', background: '#1a1a18', color: '#fff', borderBottom: '2px solid #b5976a' },
  title: { margin: 0, fontSize: '18px', fontWeight: 600, letterSpacing: '0.5px', flex: 1 },
  headerRight: { display: 'flex', gap: '8px', alignItems: 'center' },
  pcBadge: { padding: '8px 14px', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(181,151,106,0.4)', color: '#fff', borderRadius: '8px', fontSize: '13px', cursor: 'pointer' },
  settingsBtn: { padding: '8px 14px', background: '#374151', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '13px', cursor: 'pointer' },
  body: { flex: 1, display: 'grid', gridTemplateColumns: '280px minmax(0, 1fr)', gap: '16px', padding: '16px', overflow: 'hidden' },
  left: { display: 'flex', flexDirection: 'column', background: '#fff', borderRadius: '12px', padding: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', overflow: 'hidden' },
  right: { display: 'flex', flexDirection: 'column', background: '#fff', borderRadius: '12px', padding: '28px 32px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', overflowY: 'auto' },
  sectionTitle: { margin: 0, fontSize: '20px', fontWeight: 700, marginBottom: '20px', color: '#1f2937' },
  searchRow: { display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '10px' },
  searchInput: { width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '13px', boxSizing: 'border-box' },
  dateSelect: { padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '12px', background: '#fff' },
  toggleLabel: { display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: '#4b5563', whiteSpace: 'nowrap' },
  listCount: { fontSize: '11px', color: '#6b7280', marginBottom: '6px' },
  list: { flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' },
  empty: { padding: '30px 10px', textAlign: 'center', color: '#9ca3af', fontSize: '13px' },
  card: { display: 'block', width: '100%', textAlign: 'left', padding: '8px 10px', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px', cursor: 'pointer', transition: 'all 0.15s' },
  cardLine1: { marginBottom: '4px' },
  cardLine2: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' },
  stageBadge: { display: 'inline-block', padding: '2px 7px', borderRadius: '8px', color: '#fff', fontSize: '10px', fontWeight: 600 },
  cardMeta: { fontSize: '11px', color: '#9ca3af' },
  liveDot: { color: '#dc2626', fontWeight: 600 },
  inlineRow: { display: 'flex', gap: '12px', marginBottom: '20px' },
  ccGroup: { marginBottom: '20px' },
  ccTextarea: { width: '100%', padding: '14px 16px', border: '1px solid #d1d5db', borderRadius: '10px', fontSize: '15px', boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.6, minHeight: '220px' },
  label: { display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '6px' },
  input: { width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box' },
  autoBadge: { background: '#ecfdf5', color: '#047857', fontSize: '10px', padding: '2px 6px', borderRadius: '4px', fontWeight: 500 },
  error: { background: '#fef2f2', color: '#991b1b', padding: '10px 12px', borderRadius: '8px', fontSize: '13px', marginBottom: '12px' },
  btnRow: { display: 'flex', gap: '10px', marginTop: '8px' },
  primaryBtn: { padding: '14px 20px', background: '#b5976a', color: '#fff', border: 'none', borderRadius: '10px', fontSize: '15px', fontWeight: 700, cursor: 'pointer' },
  secondaryBtn: { padding: '14px 20px', background: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: '10px', fontSize: '15px', fontWeight: 600, cursor: 'pointer' },
  modalBg: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 },
  modal: { background: '#fff', padding: '24px', borderRadius: '12px', width: '360px', maxWidth: '90vw' },
}
