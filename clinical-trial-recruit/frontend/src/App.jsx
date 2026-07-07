import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  Database, UserSquare2, ScanSearch, ListChecks, Filter,
  CheckCircle, XCircle, HelpCircle, ChevronDown, ChevronRight,
  Stethoscope, Download, RefreshCw, Dna, Pill, FlaskConical,
  Activity, Brain, AlertTriangle, Layers, Pencil, Trash2, Plus,
} from 'lucide-react'

// ── 试验定义 ──────────────────────────────────────────────────────────────────
const TRIAL = {
  name: '某肺癌靶向药试验 · 二线 EGFR-TKI II 期',
  code: '样例项目 LC-EGFR-02',
  inclusion: [
    { id: 'I1', text: '年龄 18–75 岁' },
    { id: 'I2', text: '病理确诊非小细胞肺癌（腺癌）' },
    { id: 'I3', text: 'EGFR 敏感突变阳性（19del / L858R）' },
    { id: 'I4', text: '既往一线 EGFR-TKI 治疗后疾病进展' },
    { id: 'I5', text: 'ECOG 体力评分 0–2 分' },
  ],
  exclusion: [
    { id: 'E1', text: '存在活动性 / 未控制的脑转移' },
    { id: 'E2', text: '严重肝功能异常（Child-Pugh C 或 ALT/AST > 2.5×ULN）' },
    { id: 'E3', text: '活动性自身免疫疾病' },
    { id: 'E4', text: '既往接受过三代 EGFR-TKI（如奥希替尼）' },
  ],
}

// ── 硬指标（浅判断，规则确定，不耗 LLM）───────────────────────────────────────
const HARD_INDICATORS = [
  { id: 'H1', text: '年龄 18–75 岁' },
  { id: 'H2', text: '病理确诊肺腺癌（NSCLC）' },
  { id: 'H3', text: 'EGFR 敏感突变阳性（19del / L858R）' },
  { id: 'H4', text: '一线 EGFR-TKI 治疗后疾病进展' },
]

// ── 病人本体（全局 1 份 · schema）────────────────────────────────────────────
const ONTOLOGY = [
  { cls: '基本信息', attrs: '年龄 · 性别', Icon: UserSquare2 },
  { cls: '诊断', attrs: '部位 · 组织学型 · 分期', Icon: Stethoscope },
  { cls: '基因', attrs: '位点 · 变异型 · 状态', Icon: Dna },
  { cls: '用药', attrs: '通用名 · 药理类 · 线数 · 是否进展', Icon: Pill },
  { cls: '检验', attrs: '项目 · 值 · 单位', Icon: FlaskConical },
  { cls: '体力 / 转移', attrs: 'ECOG · 脑转移状态', Icon: Activity },
]

// ── 5 步漏斗 ──────────────────────────────────────────────────────────────────
const FUNNEL = [
  { key: 'ingest',    label: '接数据',      sub: '病患库接入（离线）',    Icon: Database },
  { key: 'profile',   label: '建画像',      sub: '病历解读·结构化（离线）', Icon: UserSquare2 },
  { key: 'prescreen', label: '指标初筛',    sub: '规则快速筛查',          Icon: Filter },
  { key: 'match',     label: 'LLM 精细匹配', sub: '逐条 AI 判断',         Icon: ScanSearch },
  { key: 'list',      label: '候选名单',    sub: '交 CRC 把关',           Icon: ListChecks },
]

// 阶段 → 漏斗步骤索引（active 用）
const PHASE_STAGE = {
  loading: 0, profiling: 1, prescreening: 2, prescreened: 2,
  matching: 3, done: 4, error: -1,
}
const RUNNING_PHASES = new Set(['loading', 'profiling', 'prescreening', 'matching'])

// ── 精细匹配标准 ──────────────────────────────────────────────────────────────
const CRITERIA = [
  ...TRIAL.inclusion.map(c => ({ ...c, type: 'inclusion' })),
  ...TRIAL.exclusion.map(c => ({ ...c, type: 'exclusion' })),
]
const CRITERIA_BY_ID = Object.fromEntries(CRITERIA.map(c => [c.id, c]))

// ── 前端初筛规则（镜像后端，画像在内存中时直接运行，无需 API）────────────────
const SENSITIZING_VARIANTS = ['19del', 'l858r', '19 外显子', '21', 'l858']

function prescreenProfile(profile, indicators) {
  const failed = []
  for (const ind of indicators) {
    switch (ind.id) {
      case 'H1': {
        const age = profile?.age
        if (!(typeof age === 'number' && age >= 18 && age <= 75))
          failed.push({ id: ind.id, label: ind.text, reason: `年龄为 ${age ?? '未知'}，不在范围内` })
        break
      }
      case 'H2': {
        const h = profile?.diagnosis?.histology || ''
        if (!h.includes('腺癌'))
          failed.push({ id: ind.id, label: ind.text, reason: `组织学型为「${h || '未知'}」，非腺癌` })
        break
      }
      case 'H3': {
        const genes = profile?.genes || []
        const ok = genes.some(g =>
          String(g.gene).toUpperCase() === 'EGFR' &&
          String(g.status).includes('阳性') &&
          SENSITIZING_VARIANTS.some(k => String(g.variant).toLowerCase().includes(k))
        )
        if (!ok)
          failed.push({ id: ind.id, label: ind.text, reason: '未见 EGFR 敏感突变阳性' })
        break
      }
      case 'H4': {
        const meds = profile?.medications || []
        const ok = meds.some(m =>
          String(m.drug_class).includes('EGFR-TKI') &&
          (m.line === 1 || m.line === '1') &&
          m.progressed === true
        )
        if (!ok)
          failed.push({ id: ind.id, label: ind.text, reason: '无一线 EGFR-TKI 治疗后进展的记录' })
        break
      }
      default:
        // 自定义指标：标记为「需人工核查」但不淘汰
        break
    }
  }
  return { pass: failed.length === 0, failed }
}

// ── 状态样式 ──────────────────────────────────────────────────────────────────
const STATUS_CFG = {
  pending:      { label: '待筛',        cls: 'bg-slate-100 text-slate-500 border-slate-200' },
  interpreting: { label: '解读中…',     cls: 'bg-blue-50 text-blue-600 border-blue-200' },
  profiled:     { label: '已建画像',    cls: 'bg-sky-50 text-sky-700 border-sky-200' },
  scanning:     { label: '扫描中…',     cls: 'bg-violet-50 text-violet-600 border-violet-200' },
  excluded_pre: { label: '初筛淘汰',    cls: 'bg-slate-100 text-slate-400 border-slate-200' },
  matching:     { label: '匹配中…',     cls: 'bg-blue-50 text-blue-600 border-blue-200' },
  excluded:     { label: '不符合',      cls: 'bg-red-50 text-red-700 border-red-200' },
  uncertain:    { label: '候选·待确认', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  candidate:    { label: '候选',        cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
}

const DECISIONS = {
  in:   { label: '入组', cls: 'bg-emerald-600 text-white' },
  hold: { label: '待定', cls: 'bg-amber-500 text-white' },
  out:  { label: '排除', cls: 'bg-slate-500 text-white' },
}

// ── API ───────────────────────────────────────────────────────────────────────
const API_BASE = import.meta.env.VITE_API_BASE ?? ''

async function apiGet(path) {
  const resp = await fetch(`${API_BASE}${path}`)
  if (!resp.ok) throw new Error(`${path} 失败（${resp.status}）：${(await resp.text()).slice(0, 200)}`)
  return resp.json()
}
async function apiPost(path, body) {
  const resp = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!resp.ok) throw new Error(`${path} 失败（${resp.status}）：${(await resp.text()).slice(0, 200)}`)
  return resp.json()
}

const sleep = ms => new Promise(r => setTimeout(r, ms))

// ── 小组件 ────────────────────────────────────────────────────────────────────

function StatusPill({ status }) {
  const cfg = STATUS_CFG[status] ?? STATUS_CFG.pending
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium whitespace-nowrap ${cfg.cls}`}>
      {cfg.label}
    </span>
  )
}

function ScoreBar({ score }) {
  if (score == null) return <span className="text-xs text-slate-300">—</span>
  const color = score >= 80 ? 'bg-emerald-500' : score >= 50 ? 'bg-amber-400' : 'bg-red-400'
  const text  = score >= 80 ? 'text-emerald-600' : score >= 50 ? 'text-amber-600' : 'text-red-500'
  return (
    <div className="flex items-center gap-2 w-24">
      <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-300 ${color}`} style={{ width: `${score}%` }} />
      </div>
      <span className={`text-xs font-semibold tabular-nums ${text}`}>{score}</span>
    </div>
  )
}

// 初筛阶段的"初筛结果"列内容
function PrescreenCell({ status, prescreen }) {
  if (status === 'scanning') {
    return (
      <span className="flex items-center gap-1.5 text-xs text-violet-500">
        <div className="w-3 h-3 border-2 border-violet-200 border-t-violet-500 rounded-full spinner flex-shrink-0" />
        扫描中
      </span>
    )
  }
  if (!prescreen) return <span className="text-xs text-slate-300">—</span>
  if (prescreen.pass) {
    return (
      <span className="flex items-center gap-1 text-xs text-emerald-600 font-medium">
        <CheckCircle size={12} className="flex-shrink-0" /> 通过
      </span>
    )
  }
  return (
    <div className="flex items-center gap-1 flex-wrap">
      {(prescreen.failed || []).map(f => (
        <span key={f.id} className="text-xs bg-slate-100 text-slate-500 rounded px-1.5 py-0.5 font-mono font-semibold">{f.id}</span>
      ))}
    </div>
  )
}

const PILL = {
  emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  red:     'bg-red-50 text-red-700 border-red-200',
  amber:   'bg-amber-50 text-amber-700 border-amber-200',
}
function PassPill({ pass, type }) {
  const map = type === 'exclusion'
    ? { true: ['未触发', 'emerald'], false: ['触发排除', 'red'], null: ['待确认', 'amber'] }
    : { true: ['符合', 'emerald'], false: ['不符合', 'red'], null: ['待确认', 'amber'] }
  const [label, c] = map[String(pass)] ?? map['null']
  return <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${PILL[c]}`}>{label}</span>
}

function PassIcon({ pass }) {
  if (pass === true)  return <CheckCircle size={14} className="text-emerald-500 flex-shrink-0 mt-0.5" />
  if (pass === false) return <XCircle size={14} className="text-red-500 flex-shrink-0 mt-0.5" />
  return <HelpCircle size={14} className="text-amber-400 flex-shrink-0 mt-0.5" />
}

function profileSummary(profile) {
  if (!profile) return null
  const diag = profile.diagnosis || {}
  const gene = (profile.genes || []).find(g => String(g.gene).toUpperCase() === 'EGFR')
  const parts = []
  if (diag.histology) parts.push(`${diag.site || ''}${diag.histology}${diag.stage ? ` ${diag.stage}` : ''}`.trim())
  if (gene) parts.push(`EGFR ${gene.variant || ''}`.trim())
  return parts.join(' · ')
}

function ProfileChips({ profile }) {
  if (!profile) return null
  const diag = profile.diagnosis || {}
  const chips = []
  if (profile.age != null || profile.gender)
    chips.push(['基本', `${profile.age != null ? profile.age + ' 岁' : ''}${profile.age != null && profile.gender ? ' · ' : ''}${profile.gender || ''}`, UserSquare2])
  if (diag.histology) chips.push(['诊断', `${diag.site || ''}${diag.histology}${diag.stage ? ` · ${diag.stage}` : ''}`, Stethoscope])
  ;(profile.genes || []).forEach(g => chips.push(['基因', `${g.gene} ${g.variant || ''} ${g.status || ''}`.trim(), Dna]))
  ;(profile.medications || []).forEach(m => chips.push(['用药', `${m.name || ''}${m.drug_class ? `（${m.drug_class}）` : ''}${m.line ? ` ${m.line}线` : ''}${m.progressed ? '·已进展' : ''}`, Pill]))
  if (profile.ecog != null) chips.push(['ECOG', `${profile.ecog} 分`, Activity])
  if (profile.brain_metastasis) {
    const bm = { yes: '有脑转移', no: '无脑转移', unknown: '脑转移不详' }[profile.brain_metastasis] || profile.brain_metastasis
    chips.push(['脑转移', bm, Brain])
  }
  ;(profile.labs || []).forEach(l => chips.push(['检验', `${l.item} ${l.value ?? ''} ${l.unit ?? ''}`.trim(), FlaskConical]))
  if (profile.child_pugh) chips.push(['肝功', `Child-Pugh ${profile.child_pugh}`, FlaskConical])
  return (
    <div className="flex flex-wrap gap-1.5">
      {chips.map(([k, v, Icon], i) => (
        <span key={i} className="inline-flex items-center gap-1 text-xs bg-white border border-slate-200 rounded-md px-2 py-1 text-slate-600">
          <Icon size={11} className="text-slate-400" />
          <span className="text-slate-400">{k}</span>
          <span className="font-medium text-slate-700">{v}</span>
        </span>
      ))}
    </div>
  )
}

function PatientDetail({ row, decision, onDecide }) {
  const { profile, match, prescreen } = row
  return (
    <div className="bg-slate-50 border-t border-slate-100 px-5 py-4 flex flex-col gap-4 fade-in">
      {/* 病人画像 */}
      <div>
        <div className="text-xs font-semibold text-slate-500 mb-2 flex items-center gap-1.5">
          <UserSquare2 size={13} /> 病人画像（结构化）
        </div>
        {profile ? <ProfileChips profile={profile} /> : <span className="text-xs text-slate-400">未生成</span>}
      </div>

      {/* 初筛未通过 */}
      {prescreen && !prescreen.pass && (
        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5">
          <div className="text-xs font-semibold text-slate-500 mb-1.5">指标初筛 · 未通过项</div>
          <div className="flex flex-col gap-1">
            {(prescreen.failed || []).map(f => (
              <div key={f.id} className="flex items-start gap-2 text-xs">
                <XCircle size={13} className="text-slate-400 flex-shrink-0 mt-0.5" />
                <span className="text-slate-600"><span className="font-mono font-semibold">{f.id}</span> {f.label} —— {f.reason}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 精细匹配逐条 */}
      {match && (
        <div>
          <div className="text-xs font-semibold text-slate-500 mb-2 flex items-center gap-1.5">
            <ScanSearch size={13} /> 精细匹配 · 逐条判断
          </div>
          <div className="flex flex-col gap-1.5">
            {match.checks.map(ck => {
              const crit = CRITERIA_BY_ID[ck.id]
              if (!crit) return null
              return (
                <div key={ck.id} className="flex items-start gap-2.5 bg-white border border-slate-100 rounded-lg px-3 py-2">
                  <span className={`text-xs px-1.5 py-0.5 rounded font-mono font-semibold flex-shrink-0 ${crit.type === 'inclusion' ? 'bg-blue-50 text-blue-600' : 'bg-orange-50 text-orange-600'}`}>{crit.id}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm text-slate-700">{crit.text}</span>
                      <PassPill pass={ck.pass} type={crit.type} />
                    </div>
                    {ck.evidence && (
                      <div className="flex items-start gap-1.5 mt-1">
                        <PassIcon pass={ck.pass} />
                        <span className="text-xs text-slate-500 leading-relaxed">{ck.evidence}</span>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* 缺失项提示 */}
      {match && match.missing?.length > 0 && (
        <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
          <AlertTriangle size={14} className="text-amber-500 flex-shrink-0 mt-0.5" />
          <span className="text-xs text-amber-700">
            信息缺失，需 CRC 核查：{match.missing.join('；')}
          </span>
        </div>
      )}

      {/* CRC 把关 */}
      {match && (
        <div className="flex items-center gap-2 pt-1">
          <span className="text-xs text-slate-500 mr-1">CRC 把关：</span>
          {Object.entries(DECISIONS).map(([k, cfg]) => (
            <button key={k} onClick={() => onDecide(decision === k ? null : k)}
              className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-all ${decision === k ? cfg.cls : 'bg-white border border-slate-200 text-slate-500 hover:bg-slate-100'}`}>
              {cfg.label}
            </button>
          ))}
          {decision && <span className="text-xs text-slate-400 ml-1">已标记为「{DECISIONS[decision].label}」</span>}
        </div>
      )}
    </div>
  )
}

function PatientRow({ row, showScore, showFailReasons, expanded, onToggle, decision, onDecide }) {
  const { patient, status, profile, match, prescreen } = row
  const summary = profileSummary(profile)
  const canExpand = !!profile
  // 展示初筛失败原因：prescreened 阶段的淘汰行，且有原因数据
  const failedItems = (showFailReasons && status === 'excluded_pre' && prescreen?.failed?.length)
    ? prescreen.failed : null

  return (
    <div className="border-b border-slate-100 last:border-b-0">
      <button
        disabled={!canExpand}
        onClick={onToggle}
        className={`w-full grid gap-3 px-5 py-3 text-left transition-colors items-center
          ${showScore ? 'grid-cols-[88px_120px_1fr_110px_100px_20px]' : 'grid-cols-[88px_120px_1fr_148px_100px_20px]'}
          ${canExpand ? 'hover:bg-slate-50 cursor-pointer' : 'cursor-default'}
          ${status === 'excluded_pre' && !showFailReasons ? 'opacity-40' : ''}
        `}
      >
        <span className="text-xs font-mono text-slate-500">{patient.id}</span>
        <span className={`text-sm truncate ${status === 'excluded_pre' ? 'text-slate-400' : 'text-slate-700'}`}>
          {patient.name} · {patient.gender} · {patient.age}
        </span>
        <span className="text-xs text-slate-500 truncate">{summary || patient.record}</span>
        {showScore
          ? <ScoreBar score={match?.score ?? null} />
          : <PrescreenCell status={status} prescreen={prescreen} />
        }
        <StatusPill status={status} />
        <span className="text-slate-300">
          {canExpand ? (expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />) : null}
        </span>
      </button>

      {/* 初筛失败原因（prescreened 阶段内嵌展示，无需点击） */}
      {failedItems && (
        <div className="px-5 py-2.5 bg-slate-50 border-t border-slate-100 flex flex-col gap-1.5">
          {failedItems.map(f => (
            <div key={f.id} className="flex items-start gap-2">
              <span className="text-xs font-mono bg-violet-50 text-violet-600 border border-violet-100 rounded px-1.5 py-0.5 font-semibold flex-shrink-0 leading-tight">
                {f.id}
              </span>
              <span className="text-xs text-slate-500 leading-relaxed">
                <span className="text-slate-600 font-medium">{f.label}</span>
                <span className="mx-1.5 text-slate-300">—</span>
                {f.reason}
              </span>
            </div>
          ))}
        </div>
      )}

      {expanded && canExpand && (
        <PatientDetail row={row} decision={decision} onDecide={onDecide} />
      )}
    </div>
  )
}

// 硬指标编辑器（左栏内嵌）
function IndicatorEditor({ indicators, onChange, onRerun, canRerun }) {
  const [editingId, setEditingId] = useState(null)
  const [editText, setEditText]   = useState('')
  const [isAdding, setIsAdding]   = useState(false)
  const [newText, setNewText]     = useState('')

  const startEdit = (ind) => { setEditingId(ind.id); setEditText(ind.text) }
  const commitEdit = () => {
    onChange(prev => prev.map(i => i.id === editingId ? { ...i, text: editText } : i))
    setEditingId(null)
  }
  const deleteOne = (id) => onChange(prev => prev.filter(i => i.id !== id))
  const addOne = () => {
    const text = newText.trim()
    if (!text) { setIsAdding(false); return }
    const id = `HC-${Date.now()}`
    onChange(prev => [...prev, { id, text, custom: true }])
    setNewText(''); setIsAdding(false)
  }

  return (
    <div className="flex flex-col gap-1">
      {indicators.map(ind => (
        <div key={ind.id} className="group flex items-start gap-2">
          <span className={`text-xs font-mono px-1 py-0.5 rounded font-semibold flex-shrink-0 mt-0.5 leading-tight ${
            ind.custom ? 'bg-slate-100 text-slate-500' : 'bg-violet-50 text-violet-600'
          }`}>
            {ind.custom ? 'H+' : ind.id}
          </span>

          {editingId === ind.id ? (
            <div className="flex-1 flex items-center gap-1">
              <input
                autoFocus
                value={editText}
                onChange={e => setEditText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditingId(null) }}
                className="flex-1 text-xs border border-blue-300 rounded px-1.5 py-0.5 outline-none min-w-0"
              />
              <button onClick={commitEdit} className="text-emerald-600 hover:text-emerald-700 flex-shrink-0">
                <CheckCircle size={13} />
              </button>
              <button onClick={() => setEditingId(null)} className="text-slate-400 hover:text-slate-600 flex-shrink-0">
                <XCircle size={13} />
              </button>
            </div>
          ) : (
            <>
              <span className="flex-1 text-xs text-slate-600 leading-relaxed">
                {ind.text}
                {ind.custom && <span className="ml-1 text-slate-400">（需人工核查）</span>}
              </span>
              <div className="hidden group-hover:flex items-center gap-0.5 flex-shrink-0 mt-0.5">
                <button onClick={() => startEdit(ind)} className="p-0.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600">
                  <Pencil size={10} />
                </button>
                <button onClick={() => deleteOne(ind.id)} className="p-0.5 rounded hover:bg-red-50 text-slate-400 hover:text-red-500">
                  <Trash2 size={10} />
                </button>
              </div>
            </>
          )}
        </div>
      ))}

      {/* 新增 */}
      {isAdding ? (
        <div className="flex items-center gap-1 mt-1">
          <input
            autoFocus
            placeholder="输入新指标内容…"
            value={newText}
            onChange={e => setNewText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addOne(); if (e.key === 'Escape') setIsAdding(false) }}
            className="flex-1 text-xs border border-blue-300 rounded px-1.5 py-0.5 outline-none"
          />
          <button onClick={addOne} className="text-emerald-600 hover:text-emerald-700 flex-shrink-0">
            <CheckCircle size={13} />
          </button>
          <button onClick={() => setIsAdding(false)} className="text-slate-400 hover:text-slate-600 flex-shrink-0">
            <XCircle size={13} />
          </button>
        </div>
      ) : (
        <button
          onClick={() => setIsAdding(true)}
          className="flex items-center gap-1 text-xs text-slate-400 hover:text-blue-600 mt-0.5 transition-colors self-start"
        >
          <Plus size={11} /> 新增指标
        </button>
      )}

      {/* 重新初筛 */}
      {canRerun && (
        <button
          onClick={onRerun}
          className="mt-2 flex items-center justify-center gap-1.5 w-full py-1.5 text-xs font-semibold text-violet-700 bg-violet-50 border border-violet-200 rounded-lg hover:bg-violet-100 transition-colors"
        >
          <RefreshCw size={11} /> 重新初筛
        </button>
      )}
    </div>
  )
}

function FunnelBar({ phase, counts }) {
  const currentStage = PHASE_STAGE[phase] ?? -1
  const isRunning = RUNNING_PHASES.has(phase)
  return (
    <div className="flex items-stretch gap-2">
      {FUNNEL.map((f, i) => {
        const active = isRunning && currentStage === i
        const done   = !active && currentStage >= i && currentStage >= 0
        const count  = counts[f.key]
        return (
          <div key={f.key} className="flex items-center gap-2 flex-1">
            <div className={`flex-1 flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-all ${
              active ? 'border-blue-300 bg-blue-50' : done ? 'border-emerald-200 bg-emerald-50/40' : 'border-slate-200 bg-white'
            }`}>
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                active ? 'bg-blue-600 text-white' : done ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-400'
              }`}>
                {active
                  ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full spinner" />
                  : <f.Icon size={16} />
                }
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-slate-400">{i + 1}</span>
                  <span className={`text-sm font-semibold truncate ${active ? 'text-blue-700' : done ? 'text-emerald-700' : 'text-slate-400'}`}>{f.label}</span>
                  {count != null && (
                    <span className="text-xs font-bold tabular-nums text-slate-600 bg-white/80 rounded px-1.5 flex-shrink-0">{count}</span>
                  )}
                </div>
                <div className="text-xs text-slate-400 truncate">{f.sub}</div>
              </div>
            </div>
            {i < FUNNEL.length - 1 && <ChevronRight size={14} className="text-slate-300 flex-shrink-0" />}
          </div>
        )
      })}
    </div>
  )
}

// 指标初筛完成后的 Banner
function PrescreenBanner({ passed, total, onMatch }) {
  return (
    <div className="flex-shrink-0 flex items-center gap-4 px-5 py-3 bg-violet-50 border-b border-violet-100 fade-in">
      <Filter size={15} className="text-violet-500 flex-shrink-0" />
      <div>
        <span className="text-sm font-semibold text-violet-700">指标初筛完成</span>
        <span className="text-xs text-violet-500 ml-2">通过 <strong>{passed}</strong> 人 · 淘汰 <strong>{total - passed}</strong> 人</span>
      </div>
      <div className="ml-auto flex items-center gap-2">
        <span className="text-xs text-violet-400">通过者进入 LLM 精细匹配</span>
        <button onClick={onMatch}
          className="flex items-center gap-2 px-4 py-2 bg-blue-700 text-white text-xs font-semibold rounded-lg hover:bg-blue-800 active:scale-95 transition-all">
          <ScanSearch size={13} /> 开始 LLM 精细匹配
        </button>
      </div>
    </div>
  )
}

// ── 主应用 ────────────────────────────────────────────────────────────────────

export default function App() {
  const [patients, setPatients]   = useState([])
  const [rowState, setRowState]   = useState({})
  const [phase, setPhase]         = useState('loading')
  const [expandedId, setExpanded] = useState(null)
  const [decisions, setDecisions] = useState({})
  const [filter, setFilter]       = useState('all')
  const [error, setError]         = useState(null)
  const [indicators, setIndicators] = useState(HARD_INDICATORS.map(h => ({ ...h })))

  // 持久化供 match 步骤复用
  const profileMapRef  = useRef({})
  const survivorIdsRef = useRef([])

  // 更新单行
  const patchRow = useCallback((id, patch) => {
    setRowState(prev => ({ ...prev, [id]: { ...prev[id], ...patch } }))
  }, [])

  // ── 离线自动流程：接数据 → 建画像 → 指标初筛 ──────────────────────────────
  useEffect(() => {
    let alive = true
    async function runOffline() {
      try {
        // ① 接数据
        setPhase('loading')
        const data = await apiGet('/api/patients')
        if (!alive) return
        const pts = data.patients
        setPatients(pts)
        setRowState(Object.fromEntries(pts.map(p => [p.id, { status: 'pending' }])))
        await sleep(200)

        // ② 建画像（LLM，离线）
        setPhase('profiling')
        setRowState(Object.fromEntries(pts.map(p => [p.id, { status: 'interpreting' }])))
        const { profiles } = await apiPost('/api/interpret', {
          items: pts.map(p => ({ id: p.id, record: p.record })),
        })
        if (!alive) return
        // 用病患库中已有的结构化字段（age/gender）回填 LLM 未能提取的部分
        const ptById = Object.fromEntries(pts.map(p => [p.id, p]))
        const profileMap = Object.fromEntries(profiles.map(x => {
          const pt = ptById[x.id] || {}
          const prof = x.profile || {}
          return [x.id, {
            ...prof,
            age:    prof.age    ?? pt.age    ?? null,
            gender: prof.gender ?? pt.gender ?? null,
          }]
        }))
        profileMapRef.current = profileMap
        for (const p of pts) {
          if (!alive) return
          setRowState(prev => ({ ...prev, [p.id]: { ...prev[p.id], status: 'profiled', profile: profileMap[p.id] } }))
          await sleep(25)
        }

        // ③ 指标初筛（规则，离线，快速）
        setPhase('prescreening')
        const { results: pre } = await apiPost('/api/prescreen', {
          items: pts.map(p => ({ id: p.id, profile: profileMap[p.id] || {} })),
        })
        if (!alive) return
        const preMap = Object.fromEntries(pre.map(r => [r.id, r]))
        const survivors = []
        for (const p of pts) {
          if (!alive) return
          // 短暂 "扫描中" 动画
          setRowState(prev => ({ ...prev, [p.id]: { ...prev[p.id], status: 'scanning' } }))
          await sleep(18)
          const r = preMap[p.id]
          if (r?.pass) {
            setRowState(prev => ({ ...prev, [p.id]: { ...prev[p.id], prescreen: r, status: 'profiled' } }))
            survivors.push(p.id)
          } else {
            setRowState(prev => ({ ...prev, [p.id]: { ...prev[p.id], prescreen: r, status: 'excluded_pre' } }))
          }
          await sleep(30)
        }
        survivorIdsRef.current = survivors
        if (!alive) return
        // 若无人通过初筛，直接跳到完成，无需 LLM 精细匹配
        setPhase(survivors.length === 0 ? 'done' : 'prescreened')
      } catch (err) {
        if (alive) { setError(err.message); setPhase('error') }
      }
    }
    runOffline()
    return () => { alive = false }
  }, [])

  // ── 用户触发：LLM 精细匹配 ────────────────────────────────────────────────
  const handleMatch = useCallback(async () => {
    if (phase !== 'prescreened') return
    if (survivorIdsRef.current.length === 0) { setPhase('done'); return }
    setPhase('matching')
    setFilter('all')
    setExpanded(null)
    const survivors = survivorIdsRef.current
    const profileMap = profileMapRef.current

    try {
      survivors.forEach(id => patchRow(id, { status: 'matching' }))
      const { results: matched } = await apiPost('/api/match', {
        items: survivors.map(id => ({ id, profile: profileMap[id] || {} })),
        criteria: CRITERIA,
      })
      for (const m of matched) {
        patchRow(m.id, {
          status: m.recommendation === 'excluded' ? 'excluded' : m.recommendation,
          match: m,
        })
        await sleep(50)
      }
      setPhase('done')
    } catch (err) {
      setError(err.message); setPhase('error')
    }
  }, [phase, patchRow])

  // ── 用户触发：重新初筛（客户端侧，利用内存中的画像，即时完成）───────────────
  const handleReprescreen = useCallback(async () => {
    if (!['prescreened', 'done', 'matching'].includes(phase)) return
    setPhase('prescreening')
    setExpanded(null)
    setDecisions({})
    setFilter('all')

    // 在循环前快照当前画像，避免闭包陈旧
    const profileSnapshot = {}
    patients.forEach(p => { profileSnapshot[p.id] = rowState[p.id]?.profile })
    const activeIndicators = [...indicators]
    const survivors = []

    for (const p of patients) {
      setRowState(prev => ({ ...prev, [p.id]: { ...prev[p.id], status: 'scanning', match: null } }))
      await sleep(18)
      const profile = profileSnapshot[p.id]
      if (!profile) {
        setRowState(prev => ({ ...prev, [p.id]: { ...prev[p.id], status: 'profiled', prescreen: null } }))
      } else {
        const result = prescreenProfile(profile, activeIndicators)
        if (result.pass) {
          survivors.push(p.id)
          setRowState(prev => ({ ...prev, [p.id]: { ...prev[p.id], status: 'profiled', prescreen: result } }))
        } else {
          setRowState(prev => ({ ...prev, [p.id]: { ...prev[p.id], status: 'excluded_pre', prescreen: result } }))
        }
      }
      await sleep(30)
    }

    survivorIdsRef.current = survivors
    setPhase(survivors.length === 0 ? 'done' : 'prescreened')
  }, [phase, patients, rowState, indicators])

  const handleReset = useCallback(() => {
    setPhase('loading')
    setRowState({})
    setPatients([])
    setExpanded(null)
    setDecisions({})
    setFilter('all')
    setError(null)
    profileMapRef.current = {}
    survivorIdsRef.current = []
    // 重新触发离线流程（通过重新挂载？简单做法：刷新）
    window.location.reload()
  }, [])

  // 视图行
  const rows = useMemo(
    () => patients.map(p => ({ patient: p, ...(rowState[p.id] || { status: 'pending' }) })),
    [patients, rowState],
  )

  // 漏斗计数
  const counts = useMemo(() => {
    const profiled   = rows.filter(r => r.profile != null).length
    const passed     = rows.filter(r => r.prescreen?.pass === true).length
    const candidates = rows.filter(r => r.status === 'candidate' || r.status === 'uncertain').length
    const afterPrescreen = ['prescreened', 'matching', 'done'].includes(phase)
    return {
      ingest:    patients.length || null,
      profile:   patients.length ? profiled : null,
      prescreen: afterPrescreen ? passed : null,
      match:     phase === 'done' ? candidates : null,
      list:      phase === 'done' ? candidates : null,
    }
  }, [rows, patients.length, phase])

  // 初筛通过数
  const prescreenPassed = useMemo(() => rows.filter(r => r.prescreen?.pass === true).length, [rows])

  // 排序
  const orderedRows = useMemo(() => {
    if (phase === 'done' || phase === 'matching') {
      const rank = { candidate: 0, uncertain: 1, excluded: 2, excluded_pre: 3, matching: 4 }
      return [...rows].sort((a, b) => {
        const ra = rank[a.status] ?? 9, rb = rank[b.status] ?? 9
        if (ra !== rb) return ra - rb
        return (b.match?.score ?? -1) - (a.match?.score ?? -1)
      })
    }
    // 初筛阶段：通过者置顶；淘汰行按失败指标组合聚合，便于对比调整规则
    if (phase === 'prescreened' || phase === 'prescreening') {
      return [...rows].sort((a, b) => {
        const aPass = a.prescreen?.pass === true ? 0 : a.prescreen?.pass === false ? 1 : 2
        const bPass = b.prescreen?.pass === true ? 0 : b.prescreen?.pass === false ? 1 : 2
        if (aPass !== bPass) return aPass - bPass
        // 相同通过/淘汰状态 → 按失败指标 key 字母排序，让同一失败模式聚在一起
        const aKey = (a.prescreen?.failed || []).map(f => f.id).sort().join(',')
        const bKey = (b.prescreen?.failed || []).map(f => f.id).sort().join(',')
        return aKey.localeCompare(bKey)
      })
    }
    return rows
  }, [rows, phase])

  const tally = useMemo(() => ({
    candidate: rows.filter(r => r.status === 'candidate').length,
    uncertain: rows.filter(r => r.status === 'uncertain').length,
    excluded:  rows.filter(r => r.status === 'excluded' || r.status === 'excluded_pre').length,
  }), [rows])

  const filteredRows = useMemo(() => {
    if (filter === 'candidate') return orderedRows.filter(r => r.status === 'candidate' || r.status === 'uncertain')
    if (filter === 'uncertain') return orderedRows.filter(r => r.status === 'uncertain')
    if (filter === 'excluded')  return orderedRows.filter(r => r.status === 'excluded' || r.status === 'excluded_pre')
    return orderedRows
  }, [orderedRows, filter])

  const exportCSV = useCallback(() => {
    const header = ['病例号', '患者', '年龄', '性别', '匹配度', '判定', 'CRC决定', '缺失项']
    const lines = orderedRows.map(r => [
      r.patient.id, r.patient.name, r.patient.age, r.patient.gender,
      r.match?.score ?? '',
      STATUS_CFG[r.status]?.label ?? '',
      decisions[r.patient.id] ? DECISIONS[decisions[r.patient.id]].label : '',
      (r.match?.missing || []).join(' / '),
    ])
    const csv = [header, ...lines].map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'candidate_list.csv'; a.click()
    URL.revokeObjectURL(url)
  }, [orderedRows, decisions])

  // 列模式：初筛阶段显示初筛列，匹配/完成显示评分
  const showScore = phase === 'matching' || phase === 'done'

  return (
    <div className="h-screen flex flex-col bg-slate-100 overflow-hidden">
      {/* Header */}
      <header className="flex-shrink-0 bg-white border-b border-slate-200 px-6 py-3 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-blue-700 flex items-center justify-center">
          <ScanSearch size={16} className="text-white" />
        </div>
        <div>
          <div className="font-semibold text-slate-800 text-sm leading-tight">临床受试者智能筛选系统</div>
          <div className="text-xs text-slate-400">{TRIAL.name}</div>
        </div>
        <span className="ml-auto text-xs px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-100 font-medium">{TRIAL.code}</span>
      </header>

      {/* 5 步漏斗 */}
      <div className="flex-shrink-0 bg-white border-b border-slate-200 px-4 py-3">
        <FunnelBar phase={phase} counts={counts} />
      </div>

      {/* Body */}
      <div className="flex-1 flex min-h-0 gap-3 p-3">
        {/* 左栏 */}
        <div className="w-72 flex-shrink-0 flex flex-col gap-3 min-h-0">
          {/* 试验标准（可滚动） */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden flex flex-col flex-1 min-h-0">
            <div className="flex-shrink-0 px-4 py-3 border-b border-slate-100 text-xs font-semibold text-slate-500 uppercase tracking-wider">试验筛选标准</div>
            <div className="overflow-y-auto px-4 py-3 flex flex-col gap-3">
              {/* 硬指标（可编辑） */}
              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <span className="text-xs text-slate-400">硬指标</span>
                  <span className="text-xs bg-violet-50 text-violet-600 border border-violet-200 rounded px-1.5 py-0.5 font-medium">规则初筛</span>
                </div>
                <IndicatorEditor
                  indicators={indicators}
                  onChange={setIndicators}
                  canRerun={['prescreened', 'done', 'matching'].includes(phase) && patients.length > 0}
                  onRerun={handleReprescreen}
                />
              </div>
              {/* 纳入标准 */}
              <div className="border-t border-slate-100 pt-3">
                <div className="text-xs text-slate-400 mb-1.5">纳入标准</div>
                <div className="flex flex-col gap-1">
                  {TRIAL.inclusion.map(c => (
                    <div key={c.id} className="flex items-start gap-2">
                      <span className="text-xs font-mono px-1 py-0.5 rounded bg-blue-50 text-blue-600 font-semibold flex-shrink-0 mt-0.5">{c.id}</span>
                      <span className="text-xs text-slate-600 leading-relaxed">{c.text}</span>
                    </div>
                  ))}
                </div>
              </div>
              {/* 排除标准 */}
              <div className="border-t border-slate-100 pt-3">
                <div className="text-xs text-slate-400 mb-1.5">排除标准</div>
                <div className="flex flex-col gap-1">
                  {TRIAL.exclusion.map(c => (
                    <div key={c.id} className="flex items-start gap-2">
                      <span className="text-xs font-mono px-1 py-0.5 rounded bg-orange-50 text-orange-600 font-semibold flex-shrink-0 mt-0.5">{c.id}</span>
                      <span className="text-xs text-slate-600 leading-relaxed">{c.text}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* 病人本体（固定） */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden flex-shrink-0">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-1.5">
              <Layers size={13} className="text-slate-400" />
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">病人本体 · 全局 1 份</span>
            </div>
            <div className="px-4 py-3 flex flex-col gap-2">
              {ONTOLOGY.map(o => (
                <div key={o.cls} className="flex items-start gap-2">
                  <o.Icon size={13} className="text-slate-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <div className="text-xs font-medium text-slate-700">{o.cls}</div>
                    <div className="text-xs text-slate-400">{o.attrs}</div>
                  </div>
                </div>
              ))}
              <div className="text-xs text-slate-400 border-t border-slate-100 pt-2 leading-relaxed">
                本体是「尺子」（schema）；每位病患按本体填出的实例，即病人画像。
              </div>
            </div>
          </div>
        </div>

        {/* 右栏 */}
        <div className="flex-1 bg-white rounded-xl border border-slate-200 overflow-hidden flex flex-col min-w-0">
          {/* 工具栏 */}
          <div className="flex-shrink-0 flex items-center gap-3 px-5 py-3 border-b border-slate-100">
            <div className="text-sm font-semibold text-slate-700">
              {phase === 'done' ? '候选名单' : phase === 'prescreened' ? '指标初筛结果' : '病患库队列'}
              {patients.length > 0 && <span className="text-slate-400 font-normal ml-2 text-xs">{patients.length} 人</span>}
            </div>

            {/* 完成后的过滤 tab */}
            {phase === 'done' && (
              <div className="flex items-center gap-1">
                {[
                  ['all',       `全部 ${patients.length}`],
                  ['candidate', `候选 ${tally.candidate + tally.uncertain}`],
                  ['uncertain', `待确认 ${tally.uncertain}`],
                  ['excluded',  `已淘汰 ${tally.excluded}`],
                ].map(([k, label]) => (
                  <button key={k} onClick={() => setFilter(k)}
                    className={`text-xs px-2.5 py-1 rounded-lg font-medium transition-colors ${filter === k ? 'bg-blue-600 text-white' : 'text-slate-500 hover:bg-slate-100'}`}>
                    {label}
                  </button>
                ))}
              </div>
            )}

            <div className="ml-auto flex items-center gap-2">
              {phase === 'done' && (
                <button onClick={exportCSV}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50">
                  <Download size={13} /> 导出名单
                </button>
              )}
              {phase === 'done' && (
                <button onClick={handleReset}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-500 border border-slate-200 rounded-lg hover:bg-slate-50">
                  <RefreshCw size={13} /> 重置
                </button>
              )}
            </div>
          </div>

          {/* 初筛完成 Banner */}
          {phase === 'prescreened' && (
            <PrescreenBanner
              passed={prescreenPassed}
              total={patients.length}
              onMatch={handleMatch}
            />
          )}

          {/* 列头 */}
          {phase !== 'loading' && phase !== 'error' && patients.length > 0 && (
            <div className={`flex-shrink-0 grid gap-3 px-5 py-2 border-b border-slate-100 bg-slate-50 text-xs font-medium text-slate-400
              ${showScore ? 'grid-cols-[88px_120px_1fr_110px_100px_20px]' : 'grid-cols-[88px_120px_1fr_148px_100px_20px]'}
            `}>
              <span>病例号</span>
              <span>患者</span>
              <span>诊断 / 摘要</span>
              <span>{showScore ? '匹配度' : '初筛结果'}</span>
              <span>状态</span>
              <span />
            </div>
          )}

          {/* 列表主体 */}
          <div className="flex-1 overflow-y-auto">
            {phase === 'loading' && (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-400">
                <div className="w-6 h-6 border-2 border-slate-300 border-t-blue-500 rounded-full spinner" />
                <span className="text-sm">正在接入病患库…</span>
              </div>
            )}
            {phase === 'error' && (
              <div className="flex flex-col items-center justify-center h-full gap-4 px-10 text-center fade-in">
                <div className="w-12 h-12 rounded-2xl bg-red-50 flex items-center justify-center">
                  <XCircle size={24} className="text-red-500" />
                </div>
                <div>
                  <div className="font-semibold text-slate-800 mb-1">处理失败</div>
                  <div className="text-sm text-slate-500 max-w-md leading-relaxed">{error}</div>
                </div>
                <button onClick={handleReset}
                  className="px-4 py-2 text-sm font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">
                  重试
                </button>
              </div>
            )}
            {phase !== 'loading' && phase !== 'error' &&
              filteredRows.map(row => (
                <PatientRow
                  key={row.patient.id}
                  row={row}
                  showScore={showScore}
                  showFailReasons={phase === 'prescreened'}
                  expanded={expandedId === row.patient.id}
                  onToggle={() => setExpanded(expandedId === row.patient.id ? null : row.patient.id)}
                  decision={decisions[row.patient.id] ?? null}
                  onDecide={d => setDecisions(prev => ({ ...prev, [row.patient.id]: d }))}
                />
              ))
            }
          </div>
        </div>
      </div>
    </div>
  )
}
