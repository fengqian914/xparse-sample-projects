import {
  LLM_EXTRACT_URL,
  LLM_MODEL,
  HEADER_EXTRACTION_PROMPT,
  TRANSACTION_EXTRACTION_PROMPT,
} from '../constants.js'

/** Target characters per table batch */
const CHARS_PER_BATCH = 8000
const MIN_BATCH_ROWS = 5
const MAX_BATCH_ROWS = 50

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Most frequent value in a number array */
function modalCount(counts) {
  const freq = new Map()
  for (const n of counts) freq.set(n, (freq.get(n) ?? 0) + 1)
  let best = counts[0], bestFreq = 0
  for (const [n, f] of freq) {
    if (f > bestFreq) { best = n; bestFreq = f }
  }
  return best
}

/** Recursively unwrap {"value": x} → x */
function unwrap(obj) {
  if (obj === null || obj === undefined) return null
  if (typeof obj !== 'object') return obj
  if (Array.isArray(obj)) return obj.map(unwrap)
  const keys = Object.keys(obj)
  if (keys.length === 1 && keys[0] === 'value') return obj.value ?? null
  const result = {}
  for (const [k, v] of Object.entries(obj)) result[k] = unwrap(v)
  return result
}

// ─── Core LLM call ────────────────────────────────────────────────────────────

async function callLlmApi(markdown, prompt) {
  const response = await fetch(`${LLM_EXTRACT_URL}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, model: LLM_MODEL, markdown }),
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`LLM 接口请求失败 (${response.status}): ${text || response.statusText}`)
  }

  const json = await response.json()
  if (json.code !== undefined && json.code !== 200) {
    throw new Error(`LLM 服务返回错误 (${json.code}): ${json.message ?? '未知错误'}`)
  }
  return json
}

// ─── Header extraction ────────────────────────────────────────────────────────

/**
 * Extract header info (bank name, period, accounts).
 * @param {{ markdown: string, pages: Array }} ocr
 * @returns {Promise<{ header: object, rawJson: object, llmPages: Array }>}
 */
export async function extractHeader(ocr) {
  const response = await callLlmApi(ocr.markdown, HEADER_EXTRACTION_PROMPT)

  const rawLlmJson = response.result?.llm_json ?? {}
  const unwrapped = unwrap(rawLlmJson) ?? {}
  const rawJson = response.result?.raw_json ?? {}
  const llmPages = Array.isArray(response.result?.pages) ? response.result.pages : []

  const rawAccounts = Array.isArray(unwrapped.accounts) ? unwrapped.accounts : []
  const accounts = rawAccounts.map((a) => ({
    account_no: a?.account_no ?? null,
    account_name: a?.account_name ?? null,
    currency: a?.currency ?? null,
    opening_balance: a?.opening_balance ?? null,
    closing_balance: a?.closing_balance ?? null,
  }))

  const period = unwrapped.statement_period ?? {}
  const header = {
    bank_name: unwrapped.bank_name ?? null,
    statement_period: {
      start_date: period.start_date ?? null,
      end_date: period.end_date ?? null,
    },
    accounts: accounts.length > 0 ? accounts : [{
      account_no: null, account_name: null, currency: null,
      opening_balance: null, closing_balance: null,
    }],
  }

  return { header, rawJson, llmPages }
}

// ─── Transaction batch preparation ───────────────────────────────────────────

/**
 * Parse OCR markdown for HTML tables and split into batches.
 * Falls back to full-markdown mode if no HTML tables found.
 * @param {{ markdown: string, pages: Array }} ocr
 * @returns {{ batches: Array, tableFound: boolean }}
 */
export function prepareTransactionBatches(ocr) {
  const parser = new DOMParser()
  const doc = parser.parseFromString(ocr.markdown, 'text/html')
  const tables = Array.from(doc.querySelectorAll('table'))

  if (tables.length === 0) {
    return { batches: [{ markdown: ocr.markdown, pages: ocr.pages }], tableFound: false }
  }

  const tableData = tables.map((table) => {
    const rows = Array.from(table.querySelectorAll('tr'))
    let headerHtml = ''
    const dataRows = []
    const colCounts = []

    for (const row of rows) {
      const tdCount = row.querySelectorAll('td').length
      if (tdCount > 0) {
        dataRows.push(row.outerHTML)
        colCounts.push(tdCount)
      } else if (row.querySelectorAll('th').length > 0 && !headerHtml) {
        headerHtml = row.outerHTML
      }
    }
    const modalCols = colCounts.length > 0 ? modalCount(colCounts) : 0
    return { headerHtml, dataRows, modalCols }
  })

  const mainIdx = tableData.reduce(
    (best, t, i) => (t.dataRows.length > tableData[best].dataRows.length ? i : best),
    0,
  )
  const mainCols = tableData[mainIdx].modalCols
  const headerHtml = tableData[mainIdx].headerHtml

  if (mainCols === 0) {
    return { batches: [{ markdown: ocr.markdown, pages: ocr.pages }], tableFound: false }
  }

  const allDataRows = []
  for (const { dataRows, modalCols } of tableData) {
    if (modalCols === mainCols) allDataRows.push(...dataRows)
  }

  if (allDataRows.length === 0) {
    return { batches: [{ markdown: ocr.markdown, pages: ocr.pages }], tableFound: false }
  }

  const totalChars = allDataRows.reduce((sum, r) => sum + r.length, 0)
  const avgRowLength = totalChars / allDataRows.length
  const batchSize = Math.min(
    MAX_BATCH_ROWS,
    Math.max(MIN_BATCH_ROWS, Math.floor(CHARS_PER_BATCH / avgRowLength)),
  )

  const batches = []
  for (let i = 0; i < allDataRows.length; i += batchSize) {
    const rowSlice = allDataRows.slice(i, i + batchSize)
    const tableHtml = [
      '<table>',
      headerHtml ? `<thead>${headerHtml}</thead>` : '',
      '<tbody>',
      ...rowSlice,
      '</tbody></table>',
    ].join('')
    batches.push({ markdown: tableHtml, pages: ocr.pages })
  }

  return { batches, tableFound: true }
}

// ─── Transaction extraction (one batch) ──────────────────────────────────────

/**
 * Extract transactions from a single batch.
 * @param {{ markdown: string, pages: Array }} batch
 * @returns {Promise<{ transactions: Array, rawJson: Array, llmPages: Array }>}
 */
export async function extractTransactionBatch(batch) {
  const response = await callLlmApi(batch.markdown, TRANSACTION_EXTRACTION_PROMPT)

  const rawLlmJson = response.result?.llm_json ?? {}
  const unwrapped = unwrap(rawLlmJson) ?? {}
  const rawJson = response.result?.raw_json ?? {}
  const llmPages = Array.isArray(response.result?.pages) ? response.result.pages : []

  const rawTxns = Array.isArray(unwrapped.transactions) ? unwrapped.transactions : []
  const rawTxnsJson = Array.isArray(rawJson.transactions) ? rawJson.transactions : []

  const transactions = rawTxns.map((t, i) => ({
    _idx: i,
    txn_date: t?.txn_date ?? null,
    txn_time: t?.txn_time ?? null,
    amount: t?.amount ?? null,
    direction: t?.direction ?? null,
    balance_after: t?.balance_after ?? null,
    description: t?.description ?? null,
    counterparty_name: t?.counterparty_name ?? null,
    counterparty_account: t?.counterparty_account ?? null,
    remark: t?.remark ?? null,
    extra_fields: t?.extra_fields ?? {},
    _warnings: [],
  }))

  return { transactions, rawJson: rawTxnsJson, llmPages }
}
