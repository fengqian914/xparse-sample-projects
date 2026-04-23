import React from 'react'

export default function ExportActions({ classification, extraction, normalized }) {
  if (!extraction) return null

  const handleExportJson = () => {
    const data = {
      document_type: classification?.document_type,
      classification_confidence: classification?.confidence,
      language: classification?.language,
      standard_fields: extraction.standard_fields,
      extra_fields: extraction.extra_fields,
      missing_fields: extraction.missing_fields,
      warnings: extraction.warnings,
      normalized,
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const ts = new Date().toISOString().slice(0, 16).replace('T', '_').replace(':', '')
    a.href = url
    a.download = `resume_extract_${ts}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleExportCsv = () => {
    const sf = extraction.standard_fields
    const bi = sf.basic_info
    const norm = normalized ?? {}
    const rows = []
    const q = (s) => `"${(s ?? '').replace(/"/g, '""')}"`
    const row = (...cells) => rows.push(cells.map((c) => q(c ?? '')))

    row('=== 基本信息 ===')
    row('姓名', bi.name)
    row('性别', bi.gender)
    row('手机', bi.phone, '归一化手机', norm.phone_std)
    row('邮箱', bi.email, '归一化邮箱', norm.email_std)
    row('当前城市', bi.current_city)
    row('出生年月', bi.birth_date, '归一化', norm.birth_date_iso)
    row('最高学历', bi.highest_degree, '归一化', norm.highest_degree_std)
    row('工作年限', bi.years_of_experience, '推算年限', norm.years_of_experience_calc)
    rows.push([])

    if (sf.work_experience.length > 0) {
      row('=== 工作经历 ===')
      row('公司', '职位', '开始时间', '结束时间', '职责描述', '业绩')
      for (const w of sf.work_experience) {
        row(w.company, w.position, w.start_date, w.end_date, w.responsibilities, w.achievements)
      }
      rows.push([])
    }

    if (sf.education.length > 0) {
      row('=== 教育经历 ===')
      row('学校', '专业', '学位', '开始时间', '结束时间', '描述')
      for (const e of sf.education) {
        row(e.school, e.major, e.degree, e.start_date, e.end_date, e.description)
      }
      rows.push([])
    }

    if (sf.project_experience.length > 0) {
      row('=== 项目经历 ===')
      row('项目名称', '角色', '开始时间', '结束时间', '描述')
      for (const p of sf.project_experience) {
        row(p.project_name, p.role, p.start_date, p.end_date, p.description)
      }
      rows.push([])
    }

    if (sf.skills.length > 0) {
      row('=== 技能 ===')
      row('技能名称', '熟练程度')
      for (const s of sf.skills) row(s.skill_name, s.skill_level)
      rows.push([])
    }

    if (sf.certificates.length > 0) {
      row('=== 证书 & 语言能力 ===')
      row('证书名称', '语言名称', '语言等级')
      for (const c of sf.certificates) row(c.certificate_name, c.language_name, c.language_level)
      rows.push([])
    }

    if (sf.self_summary) {
      row('=== 自我评价 ===')
      row(sf.self_summary)
      rows.push([])
    }

    if (extraction.extra_fields.length > 0) {
      row('=== 扩展字段 ===')
      row('字段名', '值', '置信度')
      for (const ef of extraction.extra_fields) {
        row(ef.label, ef.value, ef.confidence)
      }
    }

    const csvContent = rows.map((r) => r.join(',')).join('\n')
    const blob = new Blob(['﻿' + csvContent], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const ts = new Date().toISOString().slice(0, 16).replace('T', '_').replace(':', '')
    a.href = url
    a.download = `resume_extract_${ts}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="relative group">
      <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-white bg-slate-700 hover:bg-slate-600 transition-colors">
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
        </svg>
        导出
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      <div className="absolute right-0 top-full mt-1 w-52 bg-white border border-slate-200 rounded-xl shadow-lg z-50 hidden group-hover:block">
        <button onClick={handleExportJson} className="w-full text-left px-4 py-2.5 text-xs text-slate-700 hover:bg-slate-50 rounded-t-xl transition-colors">
          导出抽取结果 (.json)
        </button>
        <button onClick={handleExportCsv} className="w-full text-left px-4 py-2.5 text-xs text-slate-700 hover:bg-slate-50 rounded-b-xl transition-colors border-t border-slate-100">
          导出字段明细 (.csv)
        </button>
      </div>
    </div>
  )
}
