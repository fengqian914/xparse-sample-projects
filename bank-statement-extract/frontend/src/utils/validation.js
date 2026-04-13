import { parseAmount } from './normalize.js'

/**
 * Validate transactions and return doc-level warnings.
 * Also attaches per-row _warnings.
 */
export function validateTransactions(transactions, header) {
  const docWarnings = []

  if (transactions.length === 0) return docWarnings

  // Determine date range from header
  const startDate = header?.statement_period?.start_date || null
  const endDate = header?.statement_period?.end_date || null

  for (const txn of transactions) {
    txn._warnings = []

    if (!txn.txn_date) {
      txn._warnings.push({ code: 'MISSING_DATE', message: '缺少交易日期' })
    }
    if (!txn.amount) {
      txn._warnings.push({ code: 'MISSING_AMOUNT', message: '缺少交易金额' })
    }

    const amt = parseAmount(txn.amount)
    if (amt !== null && amt < 0) {
      txn._warnings.push({ code: 'NEGATIVE_AMOUNT', message: `金额为负数: ${txn.amount}` })
    }

    if (txn.txn_date && startDate && txn.txn_date < startDate) {
      txn._warnings.push({ code: 'DATE_OUT_OF_RANGE', message: `日期 ${txn.txn_date} 早于账单起始日 ${startDate}` })
    }
    if (txn.txn_date && endDate && txn.txn_date > endDate) {
      txn._warnings.push({ code: 'DATE_OUT_OF_RANGE', message: `日期 ${txn.txn_date} 晚于账单结束日 ${endDate}` })
    }
  }

  // Balance continuity check
  for (let i = 1; i < transactions.length; i++) {
    const prev = transactions[i - 1]
    const curr = transactions[i]
    const prevBal = parseAmount(prev.balance_after)
    const currBal = parseAmount(curr.balance_after)
    const amt = parseAmount(curr.amount)

    if (prevBal !== null && currBal !== null && amt !== null && curr.direction) {
      const expected = curr.direction === 'credit'
        ? prevBal + amt
        : prevBal - amt
      if (Math.abs(expected - currBal) > 0.02) {
        curr._warnings.push({
          code: 'BALANCE_DISCONTINUITY',
          message: `余额不连续：前笔余额 ${prevBal}，本笔 ${curr.direction === 'credit' ? '+' : '-'}${amt}，期望余额 ${expected.toFixed(2)}，实际 ${currBal}`,
        })
      }
    }
  }

  // Opening/closing balance mismatch check
  const account = header?.accounts?.[0]
  if (account) {
    const opening = parseAmount(account.opening_balance)
    const closing = parseAmount(account.closing_balance)
    const firstBal = parseAmount(transactions[0]?.balance_after)
    const lastBal = parseAmount(transactions[transactions.length - 1]?.balance_after)

    if (closing !== null && lastBal !== null && Math.abs(closing - lastBal) > 0.02) {
      docWarnings.push({
        code: 'CLOSING_BALANCE_MISMATCH',
        message: `账单期末余额 ${closing} 与最后一笔交易后余额 ${lastBal} 不符`,
      })
    }
  }

  return docWarnings
}
