import React, { useState } from 'react'

// ─── Field row ────────────────────────────────────────────────────────────────

function FieldRow({ label, value }) {
  return (
    <div className="flex items-start gap-2 px-3 py-2 rounded-lg text-xs">
      <span className="w-28 flex-shrink-0 text-slate-400 pt-0.5">{label}</span>
      <span className="flex-1 text-slate-700 break-all">
        {value ?? <span className="text-slate-300">—</span>}
      </span>
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

// ─── Transaction table ────────────────────────────────────────────────────────

function TransactionTable({ transactions, isLoading }) {
  const warningColor = (txn) => {
    if (txn._warnings?.some((w) => w.code === 'BALANCE_DISCONTINUITY')) return 'bg-red-50 border-l-2 border-red-400'
    if (txn._warnings?.length > 0) return 'bg-amber-50 border-l-2 border-amber-400'
    return ''
  }

  if (transactions.length === 0 && !isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-slate-300">
        <svg className="w-10 h-10 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <p className="text-sm">暂无交易记录</p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-collapse min-w-[700px]">
        <thead>
          <tr className="bg-slate-100 text-slate-500">
            {['#', '日期', '时间', '金额', '方向', '余额', '摘要', '对手方', ''].map((h, i) => (
              <th key={i} className="px-2 py-2 text-left font-semibold whitespace-nowrap border-b border-slate-200">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {transactions.map((txn) => {
            const hasWarning = txn._warnings?.length > 0
            return (
              <tr
                key={txn._idx}
                className={[
                  'border-b border-slate-100 fade-in',
                  warningColor(txn),
                ].join(' ')}
                title={hasWarning ? txn._warnings.map((w) => w.message).join('；') : undefined}
              >
                <td className="px-2 py-1.5 text-slate-400">{txn._idx + 1}</td>
                <td className="px-2 py-1.5 whitespace-nowrap font-medium text-slate-700">{txn.txn_date ?? '—'}</td>
                <td className="px-2 py-1.5 text-slate-500">{txn.txn_time ?? '—'}</td>
                <td className="px-2 py-1.5 font-medium text-right">
                  <span className={txn.direction === 'credit' ? 'text-green-700' : txn.direction === 'debit' ? 'text-red-600' : 'text-slate-700'}>
                    {txn.amount ?? '—'}
                  </span>
                </td>
                <td className="px-2 py-1.5">
                  {txn.direction === 'credit' ? (
                    <span className="px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-green-100 text-green-700">收入</span>
                  ) : txn.direction === 'debit' ? (
                    <span className="px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-red-100 text-red-600">支出</span>
                  ) : (
                    <span className="text-slate-300">—</span>
                  )}
                </td>
                <td className="px-2 py-1.5 text-slate-600 text-right">{txn.balance_after ?? '—'}</td>
                <td className="px-2 py-1.5 text-slate-600 max-w-[140px] truncate">{txn.description ?? '—'}</td>
                <td className="px-2 py-1.5 text-slate-500 max-w-[100px] truncate">{txn.counterparty_name ?? '—'}</td>
                <td className="px-2 py-1.5 text-center">
                  {hasWarning && (
                    <svg className="w-3.5 h-3.5 text-amber-500 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  )}
                </td>
              </tr>
            )
          })}

          {isLoading && (
            <tr>
              <td colSpan={9} className="px-4 py-3 text-center">
                <div className="flex items-center justify-center gap-2 text-xs text-blue-600">
                  <div className="w-3.5 h-3.5 rounded-full border-2 border-blue-200 border-t-blue-600 animate-spin" />
                  正在抽取更多交易记录...
                </div>
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function ExtractionPanel({
  header,
  transactions,
  docWarnings,
  extractionPhase,
  extractionProgress,
  extractionError,
}) {
  const isExtracting = extractionPhase === 'extracting'
  const isDone = extractionPhase === 'done'

  if (extractionPhase === 'idle') {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-300 gap-4">
        <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
        </svg>
        <p className="text-sm">点击顶部「AI 抽取」开始提取交易数据</p>
      </div>
    )
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
          <p className="text-xs text-slate-400 mt-1">{extractionError}</p>
        </div>
      </div>
    )
  }

  const account = header?.accounts?.[0]
  const totalTxns = isDone
    ? transactions.length
    : extractionProgress.done > 0 ? `${transactions.length}（加载中...）` : '—'

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-shrink-0 px-4 pt-3 pb-2 border-b border-slate-100">
        <div className="flex items-center gap-2 mb-1">
          <span className="px-2 py-0.5 text-[10px] font-semibold bg-blue-100 text-blue-700 rounded-full">银行流水</span>
          {header?.bank_name && <span className="text-xs text-slate-500">{header.bank_name}</span>}
          {isExtracting && (
            <div className="flex items-center gap-1 text-[10px] text-blue-600 ml-auto">
              <div className="w-3 h-3 rounded-full border-2 border-blue-200 border-t-blue-600 animate-spin" />
              批次 {extractionProgress.done}/{extractionProgress.total}
            </div>
          )}
        </div>

        {docWarnings.length > 0 && (
          <div className="flex items-start gap-1.5 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700 mt-2">
            <svg className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div>{docWarnings.map((w) => w.message).join('；')}</div>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3 min-h-0">
        {header && (
          <Section title="文档信息">
            <FieldRow label="银行名称" value={header.bank_name} />
            <FieldRow label="账单开始日期" value={header.statement_period?.start_date} />
            <FieldRow label="账单结束日期" value={header.statement_period?.end_date} />
          </Section>
        )}

        {account && (
          <Section title="账户信息">
            <FieldRow label="账号" value={account.account_no} />
            <FieldRow label="户名" value={account.account_name} />
            <FieldRow label="币种" value={account.currency} />
            <FieldRow label="期初余额" value={account.opening_balance} />
            <FieldRow label="期末余额" value={account.closing_balance} />
          </Section>
        )}

        <Section title="交易明细" badge={totalTxns}>
          <TransactionTable transactions={transactions} isLoading={isExtracting} />
        </Section>
      </div>
    </div>
  )
}
