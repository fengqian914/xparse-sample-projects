import { useState, useCallback, useRef } from 'react'
import { parseDocument, downloadAllPageImages } from './api/textin.js'
import { extractHeader, extractTransactionBatch, prepareTransactionBatches } from './api/llm.js'
import { normalizeDates } from './utils/normalize.js'
import { validateTransactions } from './utils/validation.js'
import UploadZone from './components/UploadZone.jsx'
import ResultViewer from './components/ResultViewer.jsx'

const BATCH_CONCURRENCY = 2

export default function App() {
  // ── Phase ─────────────────────────────────────────────────────────────────
  const [phase, setPhase] = useState('upload') // 'upload' | 'parsing' | 'result'
  const [parseError, setParseError] = useState(null)

  // ── OCR result ────────────────────────────────────────────────────────────
  const [ocrResult, setOcrResult] = useState(null)
  const [pageImages, setPageImages] = useState([])
  const [fileName, setFileName] = useState('')

  // ── Extraction state ──────────────────────────────────────────────────────
  const [extractionPhase, setExtractionPhase] = useState('idle') // 'idle'|'extracting'|'done'|'error'
  const [extractionError, setExtractionError] = useState(null)
  const [headerResult, setHeaderResult] = useState(null)
  const [transactions, setTransactions] = useState([])
  const [docWarnings, setDocWarnings] = useState([])
  const [extractionProgress, setExtractionProgress] = useState({ done: 0, total: 0 })

  const extractionAborted = useRef(false)

  // ── Parse flow ────────────────────────────────────────────────────────────

  const handleFileSelected = useCallback(async (file) => {
    setPhase('parsing')
    setParseError(null)
    setOcrResult(null)
    setPageImages([])
    setFileName(file.name)
    setExtractionPhase('idle')
    setExtractionError(null)
    setHeaderResult(null)
    setTransactions([])
    setDocWarnings([])
    setExtractionProgress({ done: 0, total: 0 })
    extractionAborted.current = false

    try {
      const ocr = await parseDocument(file)
      setOcrResult(ocr)
      setPhase('result')

      // Background: download page images progressively
      downloadAllPageImages(ocr.pages, (img) => {
        setPageImages((prev) => [...prev, img].sort((a, b) => a.pageIndex - b.pageIndex))
      }).catch((err) => console.warn('部分页面图片下载失败:', err))
    } catch (err) {
      setParseError(err.message || '解析失败，请重试')
      setPhase('upload')
    }
  }, [])

  // ── Extraction flow ───────────────────────────────────────────────────────

  const handleStartExtraction = useCallback(async () => {
    if (!ocrResult) return
    extractionAborted.current = false

    setExtractionPhase('extracting')
    setExtractionError(null)
    setHeaderResult(null)
    setTransactions([])
    setDocWarnings([])

    try {
      // Step A: header extraction (single call)
      const headerRes = await extractHeader(ocrResult)
      if (extractionAborted.current) return

      setHeaderResult(headerRes.header)

      // Step B: transaction batches (concurrent queue)
      const { batches } = prepareTransactionBatches(ocrResult)
      setExtractionProgress({ done: 0, total: batches.length })

      const batchResults = new Array(batches.length).fill(null)
      let nextToStart = 0
      let nextToApply = 0
      let appliedTxnCount = 0
      const allTxns = []

      function applyOrdered() {
        while (nextToApply < batches.length && batchResults[nextToApply] !== null) {
          const { txns } = batchResults[nextToApply]
          txns.forEach((t, j) => { t._idx = appliedTxnCount + j })
          appliedTxnCount += txns.length
          allTxns.push(...txns)
          setTransactions([...allTxns])
          nextToApply++
          setExtractionProgress((prev) => ({ ...prev, done: nextToApply }))
        }
      }

      async function runBatch(i) {
        if (extractionAborted.current) return
        try {
          const res = await extractTransactionBatch(batches[i])
          if (extractionAborted.current) return
          batchResults[i] = { txns: res.transactions }
        } catch (err) {
          console.error(`批次 ${i + 1} 抽取失败:`, err)
          batchResults[i] = { txns: [] }
        }
        applyOrdered()
        if (nextToStart < batches.length && !extractionAborted.current) {
          runBatch(nextToStart++)
        }
      }

      const seedCount = Math.min(BATCH_CONCURRENCY, batches.length)
      while (nextToStart < seedCount) runBatch(nextToStart++)

      // Wait for all batches to complete
      await new Promise((resolve) => {
        const check = () => {
          if (batchResults.every((r) => r !== null) || extractionAborted.current) resolve()
          else setTimeout(check, 200)
        }
        check()
      })

      if (extractionAborted.current) return

      normalizeDates(allTxns)
      const header = headerResult ?? headerRes.header
      const warnings = validateTransactions(allTxns, header)

      setTransactions([...allTxns])
      setDocWarnings(warnings)
      setExtractionPhase('done')
    } catch (err) {
      if (extractionAborted.current) return
      setExtractionError(err.message || 'AI 抽取失败，请重试')
      setExtractionPhase('error')
    }
  }, [ocrResult, headerResult])

  const handleReset = useCallback(() => {
    extractionAborted.current = true
    setPhase('upload')
    setParseError(null)
    setOcrResult(null)
    setPageImages([])
    setFileName('')
    setExtractionPhase('idle')
    setExtractionError(null)
    setHeaderResult(null)
    setTransactions([])
    setDocWarnings([])
    setExtractionProgress({ done: 0, total: 0 })
  }, [])

  // ── Render ────────────────────────────────────────────────────────────────

  if (phase === 'result' && ocrResult) {
    return (
      <ResultViewer
        ocrResult={ocrResult}
        pageImages={pageImages}
        header={headerResult}
        transactions={transactions}
        docWarnings={docWarnings}
        extractionPhase={extractionPhase}
        extractionProgress={extractionProgress}
        extractionError={extractionError}
        onStartExtraction={handleStartExtraction}
        onReset={handleReset}
        fileName={fileName}
      />
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50/20 flex flex-col items-center justify-center px-4 py-16">
      {/* Parsing overlay */}
      {phase === 'parsing' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl px-10 py-8 flex flex-col items-center gap-4 min-w-[240px]">
            <div className="w-10 h-10 border-slate-200 border-t-blue-600 rounded-full animate-spin border-[3px]" />
            <div className="text-slate-700 font-medium text-sm text-center">OCR 解析中，请稍候...</div>
          </div>
        </div>
      )}

      <div className="w-full max-w-xl">
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-700 mb-5 shadow-lg shadow-blue-200">
            <svg className="w-9 h-9 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-slate-800 mb-3">银行流水智能抽取</h1>
          <p className="text-slate-500 text-sm leading-relaxed max-w-md mx-auto">
            上传银行流水 PDF 或图片，AI 自动识别交易明细与账户信息，支持余额连续性校验与 JSON/CSV 导出
          </p>
        </div>

        <UploadZone onFileSelected={handleFileSelected} disabled={phase === 'parsing'} />

        {parseError && (
          <div className="mt-4 flex items-start gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">
            <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {parseError}
          </div>
        )}

        <div className="mt-10 flex flex-wrap items-center justify-center gap-2">
          {[
            { icon: '🏦', text: '多银行适配' },
            { icon: '📊', text: '交易明细抽取' },
            { icon: '🔄', text: '长表格分批处理' },
            { icon: '✅', text: '余额连续性校验' },
            { icon: '📤', text: 'JSON / CSV 导出' },
          ].map((f) => (
            <span key={f.text} className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs text-slate-500 bg-white border border-slate-200 rounded-full shadow-sm">
              <span>{f.icon}</span>
              {f.text}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
