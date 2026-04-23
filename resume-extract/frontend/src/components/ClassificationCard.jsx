import React from 'react'

const STYLE_LABELS = {
  fresh_graduate: '应届生',
  experienced_professional: '职场人士',
  academic: '学术/科研',
  other: '其他',
}

const LANG_LABELS = {
  zh: '中文',
  en: 'English',
  mixed: '中英混合',
}

export default function ClassificationCard({ classification }) {
  if (!classification) return null

  const styleLabel = STYLE_LABELS[classification.resume_style] ?? classification.resume_style
  const langLabel = LANG_LABELS[classification.language] ?? classification.language

  if (!classification.is_target_document) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-700">
        <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <span>文档可能不是有效简历，抽取结果仅供参考</span>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2 flex-wrap px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl">
      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-100 text-blue-700">
        简历
      </span>
      {styleLabel && (
        <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-600">
          {styleLabel}
        </span>
      )}
      {langLabel && (
        <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-500">
          {langLabel}
        </span>
      )}
      {classification.layout_style && (
        <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-400">
          {classification.layout_style === 'two_column' ? '双栏' :
           classification.layout_style === 'graphic' ? '图形化' : '单栏'}
        </span>
      )}
      {classification.warnings && (
        <div className="w-full mt-1 text-[10px] text-amber-600">⚠ {classification.warnings}</div>
      )}
    </div>
  )
}
