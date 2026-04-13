import React, { useState } from 'react'
import PageImageViewer from './PageImageViewer.jsx'
import ExtractionPanel from './ExtractionPanel.jsx'
import ParsePanel from './ParsePanel.jsx'

export default function ResultViewer({
  ocrResult,
  pageImages,
  header,
  transactions,
  docWarnings,
  extractionPhase,
  extractionProgress,
  extractionError,
  onStartExtraction,
  onReset,
  fileName,
}) {
  const [currentPage, setCurrentPage] = useState(0)
  const [rightTab, setRightTab] = useState('parse')

  React.useEffect(() => {
    if (extractionPhase === 'extracting' || extractionPhase === 'done') {
      setRightTab('extraction')
    }
  }, [extractionPhase])

  const warningCount = transactions.filter((t) => t._warnings?.length > 0).length
  const canExtract = extractionPhase === 'idle' || extractionPhase === 'error'
  const isExtracting = extractionPhase === 'extracting'
  const canExport = (extractionPhase === 'done' || extractionPhase === 'extracting') && transactions.length > 0

  const handleExportJson = () => {
    const data = {
      bank_name: header?.bank_name,
      statement_period: header?.statement_period,
      accounts: header?.accounts,
      transactions: transactions.map(({ _warnings, ...rest }) => rest),
      doc_warnings: docWarnings,
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const ts = new Date().toISOString().slice(0, 16).replace('T', '_').replace(':', '')
    a.href = url; a.download = `bank_statement_${ts}.json`; a.click()
    URL.revokeObjectURL(url)
  }

  const handleExportCsv = () => {
    const headers = ['序号', '日期', '时间', '金额', '方向', '余额', '摘要', '对手方名称', '对手方账号', '备注']
    const rows = transactions.map((t) => [
      t._idx + 1, t.txn_date ?? '', t.txn_time ?? '', t.amount ?? '',
      t.direction === 'credit' ? '收入' : t.direction === 'debit' ? '支出' : '',
      t.balance_after ?? '', t.description ?? '', t.counterparty_name ?? '',
      t.counterparty_account ?? '', t.remark ?? '',
    ])
    const csv = [headers, ...rows]
      .map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const ts = new Date().toISOString().slice(0, 16).replace('T', '_').replace(':', '')
    a.href = url; a.download = `bank_statement_${ts}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex flex-col" style={{ height: '100dvh' }}>
      {/* Top toolbar */}
      <div className="flex-shrink-0 flex items-center gap-3 px-4 py-2.5 border-b border-slate-200 bg-white z-10">
        {/* Step indicator */}
        <div className="flex items-center gap-1 text-xs text-slate-400">
          <span className="flex items-center gap-1">
            <span className="w-5 h-5 rounded-full bg-blue-700 text-white flex items-center justify-center text-[10px] font-bold">✓</span>
            上传
          </span>
          <span className="w-8 h-px bg-blue-600 mx-1" />
          <span className="flex items-center gap-1">
            <span className="w-5 h-5 rounded-full bg-blue-700 text-white flex items-center justify-center text-[10px] font-bold">✓</span>
            OCR 解析
          </span>
          <span className="w-8 h-px mx-1" style={{ background: extractionPhase !== 'idle' ? '#1d4ed8' : '#e2e8f0' }} />
          <span className="flex items-center gap-1">
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
              extractionPhase === 'done' ? 'bg-blue-700 text-white' :
              extractionPhase === 'extracting' ? 'bg-blue-100 text-blue-700 ring-2 ring-blue-500' :
              'bg-slate-100 text-slate-400'
            }`}>
              {extractionPhase === 'done' ? '✓' : '3'}
            </span>
            AI 抽取
          </span>
        </div>

        <span className="hidden xl:block text-xs text-slate-400 truncate max-w-[160px] ml-2" title={fileName}>
          {fileName}
        </span>

        <div className="flex-1" />

        <div className="flex items-center gap-2">
          {canExtract && (
            <button
              onClick={onStartExtraction}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-blue-700 text-white hover:bg-blue-800 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
              AI 抽取
            </button>
          )}

          {isExtracting && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-blue-600 bg-blue-50 rounded-lg">
              <div className="w-3 h-3 rounded-full border-2 border-blue-200 border-t-blue-600 animate-spin" />
              抽取中 {extractionProgress.done}/{extractionProgress.total}
            </div>
          )}

          {warningCount > 0 && (
            <span className="flex items-center gap-1 px-2 py-1 text-xs bg-amber-50 text-amber-600 border border-amber-200 rounded-lg">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              {warningCount} 条异常
            </span>
          )}

          {canExport && (
            <div className="relative group">
              <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-800 text-white hover:bg-slate-700 transition-colors">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                导出
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              <div className="absolute right-0 top-full mt-1 w-44 bg-white border border-slate-200 rounded-xl shadow-lg z-50 hidden group-hover:block">
                <button onClick={handleExportJson}
                  className="w-full text-left px-4 py-2.5 text-xs text-slate-700 hover:bg-slate-50 rounded-t-xl transition-colors">
                  导出抽取结果 (.json)
                </button>
                <button onClick={handleExportCsv}
                  className="w-full text-left px-4 py-2.5 text-xs text-slate-700 hover:bg-slate-50 rounded-b-xl transition-colors border-t border-slate-100">
                  导出交易明细 (.csv)
                </button>
              </div>
            </div>
          )}

          <button
            onClick={onReset}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors border border-slate-200"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            新文件
          </button>
        </div>
      </div>

      {/* Split layout */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Left: image viewer 45% */}
        <div className="w-[45%] min-w-0 border-r border-slate-200 flex flex-col">
          <PageImageViewer
            pages={pageImages}
            currentPage={currentPage}
            onPageChange={setCurrentPage}
            highlight={null}
          />
        </div>

        {/* Right: tabs 55% */}
        <div className="w-[55%] min-w-0 flex flex-col">
          <div className="flex-shrink-0 flex border-b border-slate-200 bg-white">
            {[
              { key: 'extraction', label: '抽取结果', badge: transactions.length > 0 ? transactions.length : null },
              { key: 'parse', label: '解析原文', badge: null },
            ].map(({ key, label, badge }) => (
              <button
                key={key}
                onClick={() => setRightTab(key)}
                className={[
                  'px-5 py-2.5 text-xs font-semibold transition-colors border-b-2',
                  rightTab === key ? 'text-blue-700 border-blue-700' : 'text-slate-400 border-transparent hover:text-slate-600',
                ].join(' ')}
              >
                {label}
                {badge !== null && (
                  <span className="ml-1.5 px-1.5 py-0.5 text-[10px] bg-blue-100 text-blue-700 rounded-full">{badge}</span>
                )}
              </button>
            ))}
          </div>

          <div className="flex-1 min-h-0 overflow-hidden">
            {rightTab === 'extraction' ? (
              <ExtractionPanel
                header={header}
                transactions={transactions}
                docWarnings={docWarnings}
                extractionPhase={extractionPhase}
                extractionProgress={extractionProgress}
                extractionError={extractionError}
              />
            ) : (
              <ParsePanel markdown={ocrResult.markdown} />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
