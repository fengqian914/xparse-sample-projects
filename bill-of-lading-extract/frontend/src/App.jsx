import { useState, useCallback } from 'react'
import { parseDocument, downloadAllPageImages } from './api/textin.js'
import { classifyDocument, extractFields } from './api/llm.js'
import UploadZone from './components/UploadZone.jsx'
import StepIndicator from './components/StepIndicator.jsx'
import ResultLayout from './components/ResultLayout.jsx'

export default function App() {
  const [appPhase, setAppPhase] = useState('upload') // 'upload' | 'ocring' | 'result'
  const [parseError, setParseError] = useState(null)
  const [ocrResult, setOcrResult] = useState(null)
  const [pageImages, setPageImages] = useState([])
  const [fileName, setFileName] = useState('')

  const [extractionPhase, setExtractionPhase] = useState('idle') // 'idle'|'classifying'|'extracting'|'done'|'error'
  const [extractionError, setExtractionError] = useState(null)
  const [classification, setClassification] = useState(null)
  const [extraction, setExtraction] = useState(null)

  const handleFileSelected = useCallback(async (file) => {
    setAppPhase('ocring')
    setParseError(null)
    setOcrResult(null)
    setPageImages([])
    setFileName(file.name)
    setExtractionPhase('idle')
    setExtractionError(null)
    setClassification(null)
    setExtraction(null)

    let ocr
    try {
      ocr = await parseDocument(file)
      setOcrResult(ocr)
      setAppPhase('result')

      downloadAllPageImages(ocr.pages, (img) => {
        setPageImages((prev) => [...prev, img].sort((a, b) => a.pageIndex - b.pageIndex))
      }).catch((err) => console.warn('部分页面图片下载失败:', err))
    } catch (err) {
      setParseError(err.message || '解析失败，请重试')
      setAppPhase('upload')
      return
    }

    // Auto-start extraction after OCR
    try {
      setExtractionPhase('classifying')
      const { classification: cls, rawUnwrapped } = await classifyDocument(ocr.markdown)
      setClassification(cls)

      setExtractionPhase('extracting')
      const classificationJson = JSON.stringify(rawUnwrapped, null, 2)
      const { extraction: ext } = await extractFields(ocr.markdown, classificationJson)
      setExtraction(ext)
      setExtractionPhase('done')
    } catch (err) {
      setExtractionError(err.message || 'AI 抽取失败，请重试')
      setExtractionPhase('error')
    }
  }, [])

  const handleReset = useCallback(() => {
    setAppPhase('upload')
    setParseError(null)
    setOcrResult(null)
    setPageImages([])
    setFileName('')
    setExtractionPhase('idle')
    setExtractionError(null)
    setClassification(null)
    setExtraction(null)
  }, [])

  if (appPhase === 'result' && ocrResult) {
    return (
      <div className="flex flex-col h-screen overflow-hidden bg-slate-100">
        <div className="flex-shrink-0 flex items-center justify-between px-5 py-3 bg-white border-b border-slate-200 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-blue-700 flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div>
              <h1 className="text-sm font-semibold text-slate-800">提单智能抽取</h1>
              <p className="text-xs text-slate-400 truncate max-w-[300px]">{fileName}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <StepIndicator extractionPhase={extractionPhase} />
            <button
              onClick={handleReset}
              className="px-3 py-1.5 rounded-xl text-xs font-medium text-slate-500 hover:bg-slate-100 border border-slate-200 transition-colors"
            >
              上传新文件
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-hidden p-3">
          <ResultLayout
            ocrResult={ocrResult}
            pageImages={pageImages}
            classification={classification}
            extraction={extraction}
            extractionPhase={extractionPhase}
            extractionError={extractionError}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50/20 flex flex-col items-center justify-center px-4 py-16">
      {appPhase === 'ocring' && (
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
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-slate-800 mb-3">提单智能抽取</h1>
          <p className="text-slate-500 text-sm leading-relaxed max-w-md mx-auto">
            上传海运提单、海运单或空运单，AI 自动识别单据类型并抽取关键字段，支持 JSON / CSV 导出
          </p>
        </div>

        <UploadZone onFileSelected={handleFileSelected} disabled={appPhase === 'ocring'} />

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
            { icon: '🚢', text: '海运 / 空运提单' },
            { icon: '🤖', text: 'AI 字段抽取' },
            { icon: '📋', text: '当事方识别' },
            { icon: '📦', text: '货物信息提取' },
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
