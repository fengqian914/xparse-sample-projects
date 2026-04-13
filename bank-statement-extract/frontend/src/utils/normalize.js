/**
 * Normalize a date string to YYYY-MM-DD.
 * Handles: YYYY-MM-DD, YYYY/MM/DD, DD/MM/YYYY, Chinese dates, 8-digit YYYYMMDD.
 */
export function normalizeDate(str) {
  if (!str || typeof str !== 'string') return str

  const s = str.trim()

  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s

  // YYYY/MM/DD or YYYY.MM.DD
  const ymd = s.match(/^(\d{4})[/.](\d{1,2})[/.](\d{1,2})$/)
  if (ymd) {
    return `${ymd[1]}-${ymd[2].padStart(2, '0')}-${ymd[3].padStart(2, '0')}`
  }

  // DD/MM/YYYY
  const dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (dmy) {
    return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`
  }

  // Chinese: 2024年1月5日
  const cn = s.match(/^(\d{4})年(\d{1,2})月(\d{1,2})日?$/)
  if (cn) {
    return `${cn[1]}-${cn[2].padStart(2, '0')}-${cn[3].padStart(2, '0')}`
  }

  // 8-digit YYYYMMDD
  if (/^\d{8}$/.test(s)) {
    return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`
  }

  return s
}

/**
 * Parse a numeric string, stripping commas.
 */
export function parseAmount(str) {
  if (!str) return null
  const n = parseFloat(String(str).replace(/,/g, ''))
  return isNaN(n) ? null : n
}

/**
 * Normalize dates in-place on all transactions.
 */
export function normalizeDates(transactions) {
  for (const txn of transactions) {
    if (txn.txn_date) txn.txn_date = normalizeDate(txn.txn_date)
  }
}
