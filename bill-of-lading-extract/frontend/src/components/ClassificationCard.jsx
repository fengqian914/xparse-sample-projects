import React from 'react'

const DOC_TYPE_LABELS = {
  ocean_bol: { label: '海运提单', color: 'bg-blue-100 text-blue-700' },
  sea_waybill: { label: '海运单', color: 'bg-cyan-100 text-cyan-700' },
  air_waybill: { label: '空运单', color: 'bg-purple-100 text-purple-700' },
  unknown: { label: '未知类型', color: 'bg-slate-100 text-slate-500' },
}

const LANG_LABELS = {
  english: 'English',
  chinese: '中文',
  mixed: '中英混合',
}

export default function ClassificationCard({ classification }) {
  if (!classification) return null

  const docType = DOC_TYPE_LABELS[classification.document_type] ?? DOC_TYPE_LABELS.unknown
  const langLabel = LANG_LABELS[classification.language] ?? classification.language ?? '—'

  if (!classification.is_target_document) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-700">
        <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <span>文档可能不是有效的运输单据，抽取结果仅供参考</span>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2 flex-wrap px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl">
      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${docType.color}`}>
        {docType.label}
      </span>
      {langLabel && (
        <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-600">
          {langLabel}
        </span>
      )}
      {classification.layout_style && (
        <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-500">
          {classification.layout_style}
        </span>
      )}
      {classification.warnings && (
        <div className="w-full mt-1 text-[10px] text-amber-600">⚠ {classification.warnings}</div>
      )}
    </div>
  )
}
