import React, { useCallback, useState, useRef } from 'react'
import { ACCEPTED_MIME_TYPES, MAX_FILE_SIZE } from '../constants.js'

const ACCEPTED_EXT = Object.values(ACCEPTED_MIME_TYPES).flat().join(',')

export default function UploadZone({ onFileSelected, disabled }) {
  const [dragging, setDragging] = useState(false)
  const [selectedFile, setSelectedFile] = useState(null)
  const [error, setError] = useState(null)
  const inputRef = useRef(null)

  const validate = (file) => {
    const ext = ('.' + (file.name.split('.').pop() ?? '')).toLowerCase()
    const validExts = Object.values(ACCEPTED_MIME_TYPES).flat()
    if (!Object.keys(ACCEPTED_MIME_TYPES).includes(file.type) && !validExts.includes(ext)) {
      return `不支持的文件格式：${file.name}`
    }
    if (file.size > MAX_FILE_SIZE) {
      return `文件大小超过 ${MAX_FILE_SIZE / 1024 / 1024}MB 限制`
    }
    return null
  }

  const handleFile = useCallback((file) => {
    const err = validate(file)
    if (err) { setError(err); return }
    setError(null)
    setSelectedFile(file)
  }, [])

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }, [handleFile])

  const handleInputChange = (e) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
    e.target.value = ''
  }

  const handleSubmit = () => {
    if (selectedFile && !disabled) onFileSelected(selectedFile)
  }

  const handleRemove = () => { setSelectedFile(null); setError(null) }

  const fmtSize = (bytes) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  return (
    <div className="w-full max-w-xl mx-auto">
      <div
        onClick={() => !disabled && inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={[
          'relative flex flex-col items-center justify-center min-h-[220px] rounded-2xl border-2 border-dashed cursor-pointer transition-all duration-200',
          dragging ? 'border-blue-500 bg-blue-50 scale-[1.01]' : '',
          !dragging && selectedFile ? 'border-blue-300 bg-blue-50/40' : '',
          !dragging && !selectedFile ? 'border-slate-300 bg-white hover:border-blue-400 hover:bg-slate-50' : '',
          disabled ? 'opacity-50 cursor-not-allowed' : '',
        ].join(' ')}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_EXT}
          className="hidden"
          onChange={handleInputChange}
          disabled={disabled}
        />

        {selectedFile ? (
          <div className="flex flex-col items-center gap-3 px-6 text-center">
            <div className="w-14 h-14 rounded-2xl bg-blue-100 flex items-center justify-center">
              <svg className="w-8 h-8 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-slate-700 truncate max-w-[280px]">{selectedFile.name}</p>
              <p className="text-xs text-slate-400 mt-0.5">{fmtSize(selectedFile.size)}</p>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); handleRemove() }}
              className="text-xs text-slate-400 hover:text-red-500 underline transition-colors"
            >
              移除文件
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 px-6 text-center">
            <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center">
              <svg className="w-9 h-9 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-slate-700">拖拽文件至此，或点击选择</p>
              <p className="text-xs text-slate-400 mt-1">支持 PDF · JPG · PNG&nbsp;&nbsp;·&nbsp;&nbsp;最大 50MB</p>
            </div>
            <div className="flex gap-2 mt-1">
              {['PDF', 'JPG', 'PNG'].map((fmt) => (
                <span key={fmt} className="px-2.5 py-0.5 text-xs font-medium text-slate-500 bg-slate-100 rounded-full">
                  {fmt}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="mt-3 px-4 py-2.5 bg-red-50 border border-red-200 rounded-xl text-xs text-red-600 flex items-center gap-2">
          <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {error}
        </div>
      )}

      {selectedFile && !error && (
        <button
          onClick={handleSubmit}
          disabled={disabled}
          className="mt-4 w-full py-3 rounded-xl text-sm font-semibold transition-colors bg-blue-700 text-white hover:bg-blue-800 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed"
        >
          开始解析
        </button>
      )}
    </div>
  )
}
