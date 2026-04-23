import React, { useState } from 'react'
import ClassificationCard from './ClassificationCard.jsx'
import ExportActions from './ExportActions.jsx'

const FIELD_NAMES_ZH = {
  name: '姓名', gender: '性别', phone: '手机', email: '邮箱',
  current_city: '当前城市', birth_date: '出生年月', highest_degree: '最高学历',
  years_of_experience: '工作年限', avatar_url: '头像',
  education: '教育经历', work_experience: '工作经历',
  project_experience: '项目经历', skills: '技能', certificates: '证书',
}

function translateMissing(str) {
  if (!str) return null
  return str.split(',').map((f) => FIELD_NAMES_ZH[f.trim()] ?? f.trim()).join('、')
}

// ─── Field row ────────────────────────────────────────────────────────────────

function FieldRow({ label, value, norm }) {
  if (!value && !norm) return null
  return (
    <div className="flex items-start gap-2 px-3 py-2 rounded-lg text-xs border-b border-slate-50 last:border-0">
      <span className="w-20 flex-shrink-0 text-slate-400 pt-0.5">{label}</span>
      <div className="flex-1 min-w-0">
        <span className="text-slate-700 break-words">{value ?? <span className="text-slate-300">—</span>}</span>
        {norm && norm !== value && (
          <span className="ml-1.5 text-[10px] text-slate-400 bg-slate-100 rounded px-1 py-0.5">→ {norm}</span>
        )}
      </div>
    </div>
  )
}

// ─── Timeline card ────────────────────────────────────────────────────────────

function calcDuration(start, end) {
  if (!start) return null
  const parseYM = (s) => {
    if (!s) return null
    const m = s.match(/(\d{4})-(\d{2})/)
    if (m) return { year: parseInt(m[1]), month: parseInt(m[2]) }
    const y = s.match(/(\d{4})/)
    return y ? { year: parseInt(y[1]), month: 1 } : null
  }
  const isPresent = !end || /至今|present|now|current/i.test(end)
  const s = parseYM(start)
  const e = isPresent ? { year: new Date().getFullYear(), month: new Date().getMonth() + 1 } : parseYM(end)
  if (!s || !e) return null
  const months = (e.year - s.year) * 12 + (e.month - s.month)
  if (months <= 0) return null
  const y = Math.floor(months / 12)
  const m = months % 12
  if (y === 0) return `${m}个月`
  if (m === 0) return `${y}年`
  return `${y}年${m}个月`
}

function TimelineCard({ title, subtitle, startDate, endDate, body }) {
  const [open, setOpen] = useState(false)
  const duration = calcDuration(startDate, endDate)
  const hasBody = !!body

  return (
    <div className="bg-slate-50 rounded-lg p-3 mb-2 last:mb-0">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="text-xs font-semibold text-slate-700 leading-relaxed">{title}</div>
          {subtitle && <div className="text-[11px] text-slate-500 mt-0.5">{subtitle}</div>}
        </div>
        <div className="flex-shrink-0 text-right">
          <div className="text-[10px] text-slate-400 whitespace-nowrap">
            {startDate || '?'} — {endDate || '至今'}
          </div>
          {duration && (
            <div className="text-[10px] text-blue-500 mt-0.5">{duration}</div>
          )}
        </div>
      </div>
      {hasBody && (
        <div className="mt-2">
          <button
            onClick={() => setOpen((v) => !v)}
            className="text-[10px] text-blue-600 hover:text-blue-800 flex items-center gap-1 transition-colors"
          >
            {open ? '收起' : '展开详情'}
            <svg className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {open && (
            <div className="mt-1.5 text-xs text-slate-600 whitespace-pre-wrap leading-relaxed border-t border-slate-200 pt-1.5">
              {body}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Collapsible section ──────────────────────────────────────────────────────

function Section({ title, badge, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden mb-3">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-2.5 bg-slate-50 hover:bg-slate-100 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-700">{title}</span>
          {badge !== undefined && (
            <span className="px-1.5 py-0.5 text-[10px] font-medium bg-blue-100 text-blue-700 rounded-full">{badge}</span>
          )}
        </div>
        <svg className={`w-3.5 h-3.5 text-slate-400 transition-transform ${open ? '' : 'rotate-180'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
        </svg>
      </button>
      {open && <div className="p-2">{children}</div>}
    </div>
  )
}

// ─── Loading state ────────────────────────────────────────────────────────────

function LoadingState({ phase }) {
  const label = phase === 'classifying' ? '文档分类中...' : '字段抽取中...'
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 text-slate-400">
      <div className="w-10 h-10 rounded-full border-[3px] border-slate-200 border-t-blue-500 animate-spin" />
      <p className="text-sm">{label}</p>
    </div>
  )
}

// ─── Validation badge ─────────────────────────────────────────────────────────

function ValidationBadge({ validation }) {
  if (!validation) return null
  const { score } = validation
  const color = score >= 80 ? 'text-green-600 bg-green-50 border-green-200' :
    score >= 60 ? 'text-amber-600 bg-amber-50 border-amber-200' :
    'text-red-600 bg-red-50 border-red-200'
  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${color}`}>
      完整度 {score}分
    </span>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function ExtractionPanel({
  classification,
  extraction,
  normalized,
  validation,
  extractionPhase,
  extractionError,
}) {
  if (extractionPhase === 'classifying' || extractionPhase === 'extracting') {
    return <LoadingState phase={extractionPhase} />
  }

  if (extractionPhase === 'error' && extractionError) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 px-6">
        <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
          <svg className="w-6 h-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
        <div className="text-center">
          <p className="text-sm font-semibold text-slate-700">抽取失败</p>
          <p className="text-xs text-slate-400 mt-1 max-w-xs">{extractionError}</p>
        </div>
      </div>
    )
  }

  if (!extraction) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-300 gap-3">
        <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
        <p className="text-sm">等待抽取结果...</p>
      </div>
    )
  }

  const sf = extraction.standard_fields
  const bi = sf.basic_info

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-shrink-0 flex items-center justify-between px-3 pt-3 pb-2">
        <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
          <ClassificationCard classification={classification} />
          <ValidationBadge validation={validation} />
        </div>
        <div className="ml-2 flex-shrink-0">
          <ExportActions classification={classification} extraction={extraction} normalized={normalized} />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-3 min-h-0">
        {/* 基本信息 */}
        <Section title="基本信息">
          {bi.avatar_url && (
            <div className="flex justify-center px-3 py-2 border-b border-slate-50">
              <img
                src={bi.avatar_url}
                alt="头像"
                className="w-20 h-20 rounded-lg object-cover border border-slate-200"
                onError={(e) => { e.target.style.display = 'none' }}
              />
            </div>
          )}
          <FieldRow label="姓名" value={bi.name} />
          <FieldRow label="性别" value={bi.gender} />
          <FieldRow label="手机" value={bi.phone} norm={normalized?.phone_std} />
          <FieldRow label="邮箱" value={bi.email} norm={normalized?.email_std} />
          <FieldRow label="当前城市" value={bi.current_city} />
          <FieldRow label="出生年月" value={bi.birth_date} norm={normalized?.birth_date_iso} />
          <FieldRow label="最高学历" value={bi.highest_degree} norm={normalized?.highest_degree_std} />
          <FieldRow
            label="工作年限"
            value={bi.years_of_experience}
            norm={normalized?.years_of_experience_calc && bi.years_of_experience !== normalized.years_of_experience_calc
              ? `推算: ${normalized.years_of_experience_calc}` : null}
          />
        </Section>

        {/* 工作经历 */}
        {sf.work_experience.length > 0 && (
          <Section title="工作经历" badge={sf.work_experience.length}>
            {sf.work_experience.map((w, i) => (
              <TimelineCard
                key={i}
                title={w.company ?? `工作经历 ${i + 1}`}
                subtitle={w.position}
                startDate={w.start_date}
                endDate={w.end_date}
                body={[w.responsibilities, w.achievements].filter(Boolean).join('\n\n') || null}
              />
            ))}
          </Section>
        )}

        {/* 教育经历 */}
        {sf.education.length > 0 && (
          <Section title="教育经历" badge={sf.education.length}>
            {sf.education.map((e, i) => (
              <TimelineCard
                key={i}
                title={e.school ?? `教育经历 ${i + 1}`}
                subtitle={[e.major, e.degree].filter(Boolean).join(' · ')}
                startDate={e.start_date}
                endDate={e.end_date}
                body={e.description || null}
              />
            ))}
          </Section>
        )}

        {/* 项目经历 */}
        {sf.project_experience.length > 0 && (
          <Section title="项目经历" badge={sf.project_experience.length}>
            {sf.project_experience.map((p, i) => (
              <TimelineCard
                key={i}
                title={p.project_name ?? `项目 ${i + 1}`}
                subtitle={p.role}
                startDate={p.start_date}
                endDate={p.end_date}
                body={p.description || null}
              />
            ))}
          </Section>
        )}

        {/* 技能 */}
        {sf.skills.length > 0 && (
          <Section title="技能" badge={sf.skills.length}>
            <div className="flex flex-wrap gap-1.5 px-2 py-1">
              {sf.skills.map((s, i) => (
                <span key={i} className="flex items-center gap-1 px-2.5 py-1 bg-blue-50 border border-blue-100 rounded-full text-[11px] text-blue-700">
                  {s.skill_name}
                  {s.skill_level && (
                    <span className="text-blue-400">· {s.skill_level}</span>
                  )}
                </span>
              ))}
            </div>
          </Section>
        )}

        {/* 证书 & 语言 */}
        {sf.certificates.length > 0 && (
          <Section title="证书 & 语言能力" badge={sf.certificates.length}>
            {sf.certificates.map((c, i) => {
              const label = c.certificate_name || c.language_name || `证书 ${i + 1}`
              const detail = c.language_level || null
              return (
                <div key={i} className="flex items-center gap-2 px-3 py-1.5 text-xs border-b border-slate-50 last:border-0">
                  <span className="text-slate-700">{label}</span>
                  {detail && <span className="text-slate-400 text-[10px]">{detail}</span>}
                </div>
              )
            })}
          </Section>
        )}

        {/* 自我评价 */}
        {sf.self_summary && (
          <Section title="自我评价">
            <div className="px-3 py-2 text-xs text-slate-600 whitespace-pre-wrap leading-relaxed">
              {sf.self_summary}
            </div>
          </Section>
        )}

        {/* 扩展字段 */}
        {extraction.extra_fields.length > 0 && (
          <Section title="扩展字段" badge={extraction.extra_fields.length} defaultOpen={false}>
            {extraction.extra_fields.map((ef, i) => (
              <FieldRow key={i} label={ef.label ?? `字段${i + 1}`} value={ef.value} />
            ))}
          </Section>
        )}

        {/* 缺失字段 & 警告 */}
        {(extraction.missing_fields || extraction.warnings) && (
          <div className="mt-2 space-y-2">
            {extraction.missing_fields && (
              <div className="flex items-start gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-500">
                <span className="font-medium flex-shrink-0">缺失字段:</span>
                <span>{translateMissing(extraction.missing_fields)}</span>
              </div>
            )}
            {extraction.warnings && (
              <div className="flex items-start gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-700">
                <svg className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <span>{extraction.warnings}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
