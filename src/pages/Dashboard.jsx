import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { createPatient, listReports, deleteReport, isOtherPcEditing, isLockStale, PROGRESS_STAGES, todayYMD } from '../lib/reports'
import { findAvailableChartNumber, makeBaseChartNumber, isChartNumberTaken, normalizeBirth } from '../lib/chartNumber'
import { getSessionId, getPcName, setPcName, getPcLabel } from '../lib/session'
import { getStepStatuses, STATUS_TONE, describeProgress, getNextStep } from '../lib/progress'

export default function Dashboard() {
  const navigate = useNavigate()

  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)

  const [search, setSearch] = useState('')
  const [dateRange, setDateRange] = useState('all')
  const [hideCompleted, setHideCompleted] = useState(false)

  const [form, setForm] = useState({ name: '', birth: '', chartNumber: '', cc: '', consultDate: todayYMD() })
  const [chartManual, setChartManual] = useState(false)
  const [creating, setCreating] = useState(false)
  const [chartLookup, setChartLookup] = useState(false)
  const [formError, setFormError] = useState('')

  const [pcName, setPcNameState] = useState(getPcName())
  const [pcEditOpen, setPcEditOpen] = useState(false)

  // 환자 삭제 — 확인 창을 거쳐야만 지워진다
  const [pendingDelete, setPendingDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  const confirmDelete = async () => {
    if (!pendingDelete) return
    setDeleting(true)
    setDeleteError('')
    try {
      await deleteReport(pendingDelete.id)
      setPendingDelete(null)
      await reload()
    } catch (err) {
      setDeleteError(err.message || '삭제에 실패했습니다.')
    } finally { setDeleting(false) }
  }

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

  async function handleCreate() {
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
      await createPatient({
        name: form.name.trim(),
        birth,
        chartNumber,
        cc: form.cc.trim(),
        consultDate: form.consultDate || todayYMD(),
      })
      setForm({ name: '', birth: '', chartNumber: '', cc: '', consultDate: todayYMD() })
      setChartManual(false)
      reload()
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
              <ReportCard
                key={r.id}
                report={r}
                onOpen={() => navigate(`/editor/${encodeURIComponent(r.chart_number)}`)}
                onDelete={(rep) => { setDeleteError(''); setPendingDelete(rep) }}
              />
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
            <div style={{ flex: 1.4 }}>
              <label style={styles.label}>상담일</label>
              <input
                type="date"
                value={form.consultDate}
                onChange={e => setForm({ ...form, consultDate: e.target.value })}
                style={styles.input}
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

          <button onClick={handleCreate} disabled={creating} style={styles.primaryBtn}>
            {creating ? '등록 중…' : '등록'}
          </button>
        </div>
      </div>

      {pcEditOpen && (
        <PcNameModal
          initial={pcName}
          onSave={(v) => { setPcName(v); setPcNameState(v); setPcEditOpen(false) }}
          onClose={() => setPcEditOpen(false)}
        />
      )}

      {pendingDelete && (
        <DeleteConfirmModal
          report={pendingDelete}
          busy={deleting}
          error={deleteError}
          onConfirm={confirmDelete}
          onClose={() => { setPendingDelete(null); setDeleteError('') }}
        />
      )}
    </div>
  )
}

function ReportCard({ report, onOpen, onDelete }) {
  const stage = PROGRESS_STAGES[report.progress_stage] || PROGRESS_STAGES.registered
  const otherPc = isOtherPcEditing(report, null)
  const updatedAgo = timeAgo(report.updated_at)
  // 주치의·상담자·발송자가 서로 다른 PC 에서 열기 때문에,
  // 목록에서 바로 "어디까지 됐나"를 읽힐 수 있어야 한다.
  const statuses = getStepStatuses(report)
  const next = getNextStep(statuses)

  return (
    <div style={styles.cardWrap}>
      <button onClick={onOpen} style={styles.card}>
        <div style={styles.cardLine1}>
          <strong style={{ fontSize: '13px' }}>{report.patient_name}</strong>
          <span style={{ color: '#9ca3af', fontSize: '11px', marginLeft: '6px' }}>{report.chart_number}</span>
        </div>
        <div style={styles.progressRow} title={describeProgress(statuses)}>
          {statuses.map(s => {
            const tone = STATUS_TONE[s.status]
            return (
              <div key={s.num} style={styles.progressCell}>
                <span style={{
                  ...styles.progressLabel,
                  color: s.status === 'empty' ? '#c9ced6' : '#4b5563',
                  fontWeight: s.status === 'done' ? 700 : 400,
                }}>{s.short}</span>
                <div style={{ ...styles.progressBar, background: tone.color, opacity: tone.opacity }} />
              </div>
            )
          })}
        </div>
        <div style={styles.cardLine2}>
          <span style={{ ...styles.stageBadge, background: stage.color }}>{stage.label}</span>
          <span style={styles.cardMeta}>
            {next ? `다음: ${next.short}` : '발송 준비 완료'} · {updatedAgo}{otherPc && ' · 🔴'}
          </span>
        </div>
      </button>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onDelete(report) }}
        title="이 환자 삭제"
        aria-label={`${report.patient_name} 삭제`}
        style={styles.cardDelete}
      >×</button>
    </div>
  )
}

/** 실수로 지우는 걸 막기 위해 환자명을 다시 한 번 보여주고 확인받는다 */
function DeleteConfirmModal({ report, busy, error, onConfirm, onClose }) {
  return (
    <div style={styles.modalBg}>
      <div style={styles.modal}>
        <h3 style={{ marginTop: 0, color: '#b91c1c' }}>환자 삭제</h3>
        <p style={{ fontSize: '14px', color: '#374151', lineHeight: 1.7 }}>
          <strong>{report.patient_name}</strong>
          <span style={{ color: '#9ca3af' }}> · {report.chart_number}</span>
          <br />진단서와 작성한 내용이 <strong>모두 지워집니다.</strong>
        </p>
        <p style={{ fontSize: '12px', color: '#6b7280', lineHeight: 1.7 }}>
          되돌릴 수 없습니다. 환자에게 보낸 진단서 링크도 함께 열리지 않게 됩니다.
        </p>
        {error && (
          <div style={{ padding: '8px 10px', background: '#fef2f2', color: '#b91c1c', borderRadius: '6px', fontSize: '12px' }}>
            {error}
          </div>
        )}
        <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
          <button onClick={onClose} disabled={busy} style={{ ...styles.secondaryBtn, flex: 1 }}>취소</button>
          <button onClick={onConfirm} disabled={busy} style={{ ...styles.primaryBtn, flex: 1, background: '#dc2626' }}>
            {busy ? '삭제 중...' : '삭제'}
          </button>
        </div>
      </div>
    </div>
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
  // 카드 + 삭제 버튼을 겹쳐 놓는다 (버튼 안에 버튼을 넣을 수 없어 바깥으로 뺐다)
  cardWrap: { position: 'relative' },
  card: { display: 'block', width: '100%', textAlign: 'left', padding: '8px 30px 8px 10px', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px', cursor: 'pointer', transition: 'all 0.15s' },
  cardDelete: {
    position: 'absolute', top: '6px', right: '6px',
    width: '20px', height: '20px', padding: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    border: 'none', borderRadius: '50%', background: 'transparent',
    color: '#c4c4c4', fontSize: '15px', lineHeight: 1, cursor: 'pointer',
  },
  cardLine1: { marginBottom: '4px' },
  // 진행 막대 — 끝난 단계는 진하게, 안 된 단계는 흐릿하게
  progressRow: { display: 'flex', gap: '3px', marginBottom: '6px' },
  progressCell: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', minWidth: 0 },
  progressLabel: { fontSize: '9px', lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' },
  progressBar: { width: '100%', height: '4px', borderRadius: '2px' },
  cardLine2: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' },
  stageBadge: { display: 'inline-block', padding: '2px 7px', borderRadius: '8px', color: '#fff', fontSize: '10px', fontWeight: 600 },
  cardMeta: { fontSize: '11px', color: '#9ca3af', textAlign: 'right' },
  liveDot: { color: '#dc2626', fontWeight: 600 },
  inlineRow: { display: 'flex', gap: '12px', marginBottom: '20px' },
  ccGroup: { marginBottom: '20px' },
  ccTextarea: { width: '100%', padding: '14px 16px', border: '1px solid #d1d5db', borderRadius: '10px', fontSize: '15px', boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.6, minHeight: '220px' },
  label: { display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '6px' },
  input: { width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box' },
  autoBadge: { background: '#ecfdf5', color: '#047857', fontSize: '10px', padding: '2px 6px', borderRadius: '4px', fontWeight: 500 },
  error: { background: '#fef2f2', color: '#991b1b', padding: '10px 12px', borderRadius: '8px', fontSize: '13px', marginBottom: '12px' },
  primaryBtn: { width: '100%', padding: '16px 20px', background: '#b5976a', color: '#fff', border: 'none', borderRadius: '10px', fontSize: '16px', fontWeight: 700, cursor: 'pointer', marginTop: '8px' },
  secondaryBtn: { padding: '14px 20px', background: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: '10px', fontSize: '15px', fontWeight: 600, cursor: 'pointer' },
  modalBg: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 },
  modal: { background: '#fff', padding: '24px', borderRadius: '12px', width: '360px', maxWidth: '90vw' },
}
