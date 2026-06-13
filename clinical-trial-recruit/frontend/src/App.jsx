import { useState, useRef, useCallback } from 'react'
import {
  Upload, FileText, Image, File, X,
  CheckCircle, XCircle, HelpCircle,
  Download, ChevronDown, ChevronRight,
  Stethoscope, FlaskConical, ClipboardCheck,
} from 'lucide-react'

// ── Trial definition (hardcoded for demo) ────────────────────────────────────

const TRIAL = {
  name: '非小细胞肺癌 ALK 抑制剂 II 期临床试验',
  sponsor: 'Demo 研究中心',
  inclusion: [
    { id: 'I1', text: '年龄 18–75 岁' },
    { id: 'I2', text: '病理确诊非小细胞肺癌（NSCLC）' },
    { id: 'I3', text: 'ECOG 体力评分 0–2 分' },
    { id: 'I4', text: 'ALT / AST ≤ 2.5 × ULN（正常上限）' },
  ],
  exclusion: [
    { id: 'E1', text: '既往接受过同类 ALK 靶向治疗' },
    { id: 'E2', text: '活动性自身免疫疾病' },
    { id: 'E3', text: '严重肝肾功能异常（Child-Pugh C）' },
  ],
}

// ── API base URL (set VITE_API_BASE in .env.production for remote backend) ────
const API_BASE = import.meta.env.VITE_API_BASE ?? ''

// ── Real API calls ────────────────────────────────────────────────────────────

async function apiParse(file) {
  const form = new FormData()
  form.append('file', file)
  const resp = await fetch(`${API_BASE}/api/parse`, { method: 'POST', body: form })
  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(`文档解析失败（${resp.status}）：${text.slice(0, 200)}`)
  }
  return resp.json()  // { markdown, pages }
}

async function apiExtract(markdown) {
  const resp = await fetch(`${API_BASE}/api/extract`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ markdown }),
  })
  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(`指标抽取失败（${resp.status}）：${text.slice(0, 200)}`)
  }
  return resp.json()  // { patient: {...} }
}

async function apiScreen(patient, criteria) {
  const resp = await fetch(`${API_BASE}/api/screen`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ patient, criteria }),
  })
  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(`标准匹配失败（${resp.status}）：${text.slice(0, 200)}`)
  }
  return resp.json()  // { overall, checks }
}

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS = {
  eligible:   { label: '完全符合', bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', dot: 'bg-emerald-500' },
  potential:  { label: '待确认',   bg: 'bg-amber-50',   text: 'text-amber-700',   border: 'border-amber-200',   dot: 'bg-amber-400' },
  ineligible: { label: '不符合',   bg: 'bg-red-50',     text: 'text-red-700',     border: 'border-red-200',     dot: 'bg-red-500' },
}

const PROCESS_STEPS = [
  { key: 'parse',   label: '文档解析',  sub: 'OCR 识别病历内容',                Icon: Stethoscope },
  { key: 'extract', label: '指标抽取',  sub: 'AI 提取年龄、诊断、检验值等字段',   Icon: FlaskConical },
  { key: 'screen',  label: '标准匹配',  sub: '逐条核查纳入 / 排除标准',          Icon: ClipboardCheck },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatBytes(bytes) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function exportCSV(result) {
  const { patient, status, checks } = result
  const allCriteria = [...TRIAL.inclusion, ...TRIAL.exclusion]
  const rows = [
    ['患者ID', '姓名', '年龄', '性别', '诊断', 'ECOG', 'ALT', 'AST', '综合评级'],
    [
      patient.id, patient.name, patient.age, patient.gender,
      patient.diagnosis, patient.ecog, patient.alt, patient.ast,
      STATUS[status].label,
    ],
    [],
    ['标准ID', '类型', '标准内容', '判定', '原文依据'],
    ...checks.map(c => {
      const crit = allCriteria.find(x => x.id === c.id)
      const type = c.id.startsWith('I') ? '纳入' : '排除'
      const pass = c.pass === true ? '符合' : c.pass === false ? '不符合' : '待确认'
      return [c.id, type, crit?.text || '', pass, c.evidence]
    }),
  ]
  const csv = rows
    .map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\n')
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url
  a.download = `screening_${patient.id}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// ── Sub-components ────────────────────────────────────────────────────────────

function PassIcon({ pass, size = 15 }) {
  if (pass === true)  return <CheckCircle size={size} className="text-emerald-500 flex-shrink-0" />
  if (pass === false) return <XCircle     size={size} className="text-red-500 flex-shrink-0" />
  return <HelpCircle size={size} className="text-amber-400 flex-shrink-0" />
}

function PassPill({ pass }) {
  if (pass === true)  return <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-medium">符合</span>
  if (pass === false) return <span className="text-xs px-2 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200 font-medium">不符合</span>
  return <span className="text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 font-medium">待确认</span>
}

function CriterionRow({ criterion, check, type }) {
  const [open, setOpen] = useState(false)
  const hasCheck = !!check

  return (
    <div className="border border-slate-100 rounded-lg overflow-hidden">
      <button
        className="w-full flex items-start gap-3 px-3 py-2.5 text-left hover:bg-slate-50 transition-colors"
        onClick={() => hasCheck && setOpen(o => !o)}
      >
        <span className={`text-xs px-1.5 py-0.5 rounded font-mono font-semibold flex-shrink-0 mt-0.5 ${
          type === 'inclusion'
            ? 'bg-blue-50 text-blue-600'
            : 'bg-orange-50 text-orange-600'
        }`}>
          {criterion.id}
        </span>
        <span className="flex-1 text-sm text-slate-700">{criterion.text}</span>
        <div className="flex items-center gap-2 flex-shrink-0">
          {hasCheck && <PassPill pass={check.pass} />}
          {hasCheck && (
            open
              ? <ChevronDown size={13} className="text-slate-400" />
              : <ChevronRight size={13} className="text-slate-400" />
          )}
        </div>
      </button>
      {open && check && (
        <div className="px-3 pb-3 pt-1 bg-slate-50 border-t border-slate-100 flex items-start gap-2">
          <PassIcon pass={check.pass} size={14} />
          <p className="text-xs text-slate-600 leading-relaxed">{check.evidence}</p>
        </div>
      )}
    </div>
  )
}

function ProcessingView({ stepIndex }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-8 py-16 fade-in">
      <div className="flex flex-col gap-4 w-full max-w-xs">
        {PROCESS_STEPS.map((s, i) => {
          const done    = i < stepIndex
          const active  = i === stepIndex
          const pending = i > stepIndex
          return (
            <div key={s.key} className={`flex items-center gap-4 transition-opacity duration-300 ${pending ? 'opacity-30' : 'opacity-100'}`}>
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors ${
                done   ? 'bg-emerald-100' :
                active ? 'bg-blue-600'   : 'bg-slate-100'
              }`}>
                {done
                  ? <CheckCircle size={18} className="text-emerald-600" />
                  : active
                    ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full spinner" />
                    : <s.Icon size={16} className="text-slate-400" />
                }
              </div>
              <div>
                <div className={`text-sm font-semibold ${active ? 'text-blue-700' : done ? 'text-emerald-700' : 'text-slate-400'}`}>
                  {s.label}
                </div>
                <div className="text-xs text-slate-400">{s.sub}</div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ResultView({ result, onReset }) {
  const { patient, status, checks } = result
  const cfg = STATUS[status]
  const allCriteria = [...TRIAL.inclusion, ...TRIAL.exclusion]

  const failCount      = checks.filter(c => c.pass === false).length
  const passCount      = checks.filter(c => c.pass === true).length
  const uncertainCount = checks.filter(c => c.pass === null).length

  return (
    <div className="flex flex-col h-full fade-in">
      {/* Result header */}
      <div className={`flex items-center justify-between px-5 py-3.5 border-b ${cfg.bg} ${cfg.border} border-x-0 border-t-0 rounded-t-xl`}>
        <div className="flex items-center gap-3">
          <div className={`w-2.5 h-2.5 rounded-full ${cfg.dot} ${status !== 'ineligible' ? 'pulse-dot' : ''}`} />
          <span className={`font-bold text-base ${cfg.text}`}>{cfg.label}</span>
          <span className="text-slate-400 text-sm">·</span>
          <span className="text-sm text-slate-600">{patient.name} · {patient.gender} · {patient.age} 岁</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => exportCSV(result)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
          >
            <Download size={13} />
            导出 CSV
          </button>
          <button
            onClick={onReset}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-700 hover:bg-white border border-transparent hover:border-slate-200 rounded-lg transition-all"
          >
            <X size={13} />
            重置
          </button>
        </div>
      </div>

      {/* Patient info strip */}
      <div className="flex items-center gap-6 px-5 py-3 bg-white border-b border-slate-100">
        {[
          { label: '病例号',   value: patient.id },
          { label: '诊断',     value: patient.diagnosis },
          { label: 'ECOG',    value: `${patient.ecog} 分` },
          { label: 'ALT',     value: patient.alt },
          { label: 'AST',     value: patient.ast },
        ].map(({ label, value }) => (
          <div key={label} className="flex flex-col">
            <span className="text-xs text-slate-400">{label}</span>
            <span className="text-sm font-medium text-slate-700 whitespace-nowrap">{value}</span>
          </div>
        ))}
        <div className="ml-auto flex items-center gap-3 text-xs text-slate-400">
          <span className="flex items-center gap-1"><CheckCircle size={12} className="text-emerald-500" /> {passCount} 项符合</span>
          {uncertainCount > 0 && <span className="flex items-center gap-1"><HelpCircle size={12} className="text-amber-400" /> {uncertainCount} 项待确认</span>}
          {failCount > 0 && <span className="flex items-center gap-1"><XCircle size={12} className="text-red-500" /> {failCount} 项不符合</span>}
        </div>
      </div>

      {/* Criteria checks */}
      <div className="flex-1 overflow-y-auto px-5 py-4">
        <div className="mb-3">
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">纳入标准</h3>
          <div className="flex flex-col gap-1.5">
            {TRIAL.inclusion.map(c => (
              <CriterionRow
                key={c.id}
                criterion={c}
                check={checks.find(x => x.id === c.id)}
                type="inclusion"
              />
            ))}
          </div>
        </div>
        <div>
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 mt-4">排除标准</h3>
          <div className="flex flex-col gap-1.5">
            {TRIAL.exclusion.map(c => (
              <CriterionRow
                key={c.id}
                criterion={c}
                check={checks.find(x => x.id === c.id)}
                type="exclusion"
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function EmptyRight() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center gap-3 px-8">
      <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center">
        <ClipboardCheck size={26} className="text-slate-300" />
      </div>
      <p className="text-slate-400 text-sm">上传病历文件并点击「开始筛查」<br />结果将在此处显示</p>
    </div>
  )
}

// ── Main App ──────────────────────────────────────────────────────────────────

export default function App() {
  const [file, setFile]           = useState(null)
  const [dragOver, setDragOver]   = useState(false)
  const [phase, setPhase]         = useState('idle')  // idle | processing | done | error
  const [stepIndex, setStepIndex] = useState(0)
  const [result, setResult]       = useState(null)
  const [error, setError]         = useState(null)
  const inputRef = useRef(null)

  const handleFile = useCallback((f) => {
    if (!f) return
    setFile(f)
    setResult(null)
    setError(null)
    setPhase('idle')
  }, [])

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    setDragOver(false)
    const f = e.dataTransfer.files[0]
    if (f) handleFile(f)
  }, [handleFile])

  const handleScreen = useCallback(async () => {
    if (!file || phase === 'processing') return
    setPhase('processing')
    setStepIndex(0)
    setResult(null)
    setError(null)

    try {
      // Step 1: OCR parse
      setStepIndex(0)
      const parseData = await apiParse(file)

      // Step 2: LLM extract
      setStepIndex(1)
      const extractData = await apiExtract(parseData.markdown)

      // Step 3: LLM screen
      setStepIndex(2)
      const criteria = [
        ...TRIAL.inclusion.map(c => ({ ...c, type: 'inclusion' })),
        ...TRIAL.exclusion.map(c => ({ ...c, type: 'exclusion' })),
      ]
      const screenData = await apiScreen(extractData.patient ?? {}, criteria)

      // Build result from real data
      const p = extractData.patient ?? {}
      setResult({
        patient: {
          id: `PT-${Date.now().toString().slice(-6)}`,
          name: '上传患者（已脱敏）',
          age:      p.age        ?? '—',
          gender:   p.gender     ?? '—',
          diagnosis: p.diagnosis ?? '—',
          ecog:     p.ecog_score ?? '—',
          alt:      p.alt        ?? '—',
          ast:      p.ast        ?? '—',
        },
        status: screenData.overall ?? 'potential',
        checks: screenData.checks  ?? [],
      })
      setPhase('done')
    } catch (err) {
      setError(err.message)
      setPhase('error')
    }
  }, [file, phase])

  const handleReset = useCallback(() => {
    setFile(null)
    setResult(null)
    setError(null)
    setPhase('idle')
    setStepIndex(0)
  }, [])

  const isProcessing = phase === 'processing'

  return (
    <div className="h-screen flex flex-col bg-slate-100 overflow-hidden">
      {/* ── Header ── */}
      <header className="flex-shrink-0 bg-white border-b border-slate-200 px-6 py-3 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-blue-700 flex items-center justify-center">
          <Stethoscope size={16} className="text-white" />
        </div>
        <div>
          <div className="font-semibold text-slate-800 text-sm leading-tight">临床受试者招募系统</div>
          <div className="text-xs text-slate-400">{TRIAL.name}</div>
        </div>
        <div className="ml-auto">
          <span className="text-xs px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-100 font-medium">Demo</span>
        </div>
      </header>

      {/* ── Body ── */}
      <div className="flex-1 flex min-h-0 gap-3 p-3">

        {/* Left panel */}
        <div className="w-72 flex-shrink-0 flex flex-col gap-3">

          {/* Trial criteria card */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100">
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">试验筛选标准</div>
            </div>
            <div className="px-4 py-3 flex flex-col gap-3">
              <div>
                <div className="text-xs text-slate-400 mb-1.5">纳入标准</div>
                <div className="flex flex-col gap-1">
                  {TRIAL.inclusion.map(c => (
                    <div key={c.id} className="flex items-start gap-2">
                      <span className="text-xs font-mono px-1 py-0.5 rounded bg-blue-50 text-blue-600 font-semibold flex-shrink-0 leading-tight mt-0.5">{c.id}</span>
                      <span className="text-xs text-slate-600 leading-relaxed">{c.text}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="border-t border-slate-100 pt-3">
                <div className="text-xs text-slate-400 mb-1.5">排除标准</div>
                <div className="flex flex-col gap-1">
                  {TRIAL.exclusion.map(c => (
                    <div key={c.id} className="flex items-start gap-2">
                      <span className="text-xs font-mono px-1 py-0.5 rounded bg-orange-50 text-orange-600 font-semibold flex-shrink-0 leading-tight mt-0.5">{c.id}</span>
                      <span className="text-xs text-slate-600 leading-relaxed">{c.text}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Upload zone */}
          <div className="flex-1 flex flex-col gap-2">
            <input
              ref={inputRef}
              type="file"
              className="hidden"
              accept=".jpg,.jpeg,.png,.bmp,.tiff,.tif,.webp,.pdf,.docx,.doc"
              onChange={e => { if (e.target.files[0]) handleFile(e.target.files[0]); e.target.value = '' }}
              disabled={isProcessing}
            />
            <div
              className={`
                flex-1 flex flex-col items-center justify-center rounded-xl border-2 border-dashed
                transition-all duration-200 cursor-pointer select-none min-h-[140px]
                ${isProcessing ? 'opacity-50 cursor-not-allowed border-slate-200 bg-white' :
                  dragOver ? 'border-blue-400 bg-blue-50 scale-[1.01]' :
                  file      ? 'border-blue-300 bg-blue-50/40' :
                              'border-slate-300 bg-white hover:border-blue-400 hover:bg-blue-50/20'}
              `}
              onClick={() => !isProcessing && !file && inputRef.current?.click()}
              onDrop={handleDrop}
              onDragOver={e => { e.preventDefault(); if (!isProcessing) setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
            >
              {file ? (
                <div className="flex flex-col items-center gap-2 p-4 text-center">
                  <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
                    {file.type === 'application/pdf' ? <FileText size={20} className="text-blue-600" /> :
                     file.type.startsWith('image/')   ? <Image    size={20} className="text-blue-600" /> :
                                                        <File     size={20} className="text-blue-600" />}
                  </div>
                  <div className="text-sm font-medium text-slate-700 max-w-[180px] truncate">{file.name}</div>
                  <div className="text-xs text-slate-400">{formatBytes(file.size)}</div>
                  {!isProcessing && (
                    <button
                      className="text-xs text-slate-400 hover:text-red-500 flex items-center gap-1 transition-colors mt-1"
                      onClick={e => { e.stopPropagation(); handleReset() }}
                    >
                      <X size={11} /> 移除
                    </button>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2 p-6 text-center">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${dragOver ? 'bg-blue-200' : 'bg-slate-100'}`}>
                    <Upload size={20} className={dragOver ? 'text-blue-600' : 'text-slate-400'} />
                  </div>
                  <div className="text-sm font-medium text-slate-600">
                    {dragOver ? '释放上传' : '拖拽或点击上传病历'}
                  </div>
                  <div className="text-xs text-slate-400">PDF / 图片 / Word · 最大 50MB</div>
                </div>
              )}
            </div>

            {/* Action button */}
            <button
              disabled={!file || isProcessing}
              onClick={handleScreen}
              className={`
                w-full py-3 rounded-xl font-semibold text-sm transition-all duration-200
                ${file && !isProcessing
                  ? 'bg-blue-700 text-white hover:bg-blue-800 active:scale-[0.98]'
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed'}
              `}
            >
              {isProcessing ? (
                <span className="flex items-center justify-center gap-2">
                  <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full spinner" />
                  正在筛查…
                </span>
              ) : '开始筛查'}
            </button>
          </div>
        </div>

        {/* Right panel */}
        <div className="flex-1 bg-white rounded-xl border border-slate-200 overflow-hidden flex flex-col min-w-0">
          {(phase === 'idle') && <EmptyRight />}
          {phase === 'processing' && <ProcessingView stepIndex={stepIndex} />}
          {phase === 'done' && result && <ResultView result={result} onReset={handleReset} />}
          {phase === 'error' && (
            <div className="flex flex-col items-center justify-center h-full gap-4 px-10 text-center fade-in">
              <div className="w-12 h-12 rounded-2xl bg-red-50 flex items-center justify-center">
                <XCircle size={24} className="text-red-500" />
              </div>
              <div>
                <div className="font-semibold text-slate-800 mb-1">处理失败</div>
                <div className="text-sm text-slate-500 max-w-sm leading-relaxed">{error}</div>
              </div>
              <button
                onClick={handleReset}
                className="mt-2 px-4 py-2 text-sm font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
              >
                重新上传
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
