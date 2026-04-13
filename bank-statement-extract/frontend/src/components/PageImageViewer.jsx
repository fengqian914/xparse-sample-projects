import React, { useRef, useEffect, useState } from 'react'

export default function PageImageViewer({ pages, currentPage, onPageChange, highlight }) {
  const imgRef = useRef(null)
  const [imgLoaded, setImgLoaded] = useState(false)
  const [naturalSize, setNaturalSize] = useState({ w: 0, h: 0 })

  const currentPageData = pages[currentPage]

  useEffect(() => {
    setImgLoaded(false)
    setNaturalSize({ w: 0, h: 0 })
  }, [currentPage])

  const handleImgLoad = () => {
    const img = imgRef.current
    if (img) {
      setNaturalSize({ w: img.naturalWidth, h: img.naturalHeight })
      setImgLoaded(true)
    }
  }

  const highlightOnThisPage = highlight !== null && highlight?.pageIndex === currentPage

  const buildPolygonPoints = (pos) => {
    if (!pos || pos.length < 8) return ''
    const scaleX = naturalSize.w / (currentPageData?.width ?? naturalSize.w)
    const scaleY = naturalSize.h / (currentPageData?.height ?? naturalSize.h)
    const pts = []
    for (let i = 0; i < 8; i += 2) {
      pts.push(`${(pos[i] * scaleX).toFixed(1)},${(pos[i + 1] * scaleY).toFixed(1)}`)
    }
    return pts.join(' ')
  }

  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* Image area */}
      <div className="flex-1 overflow-auto flex items-start justify-center p-4 min-h-0">
        {currentPageData?.blobUrl ? (
          <div className="relative inline-block shadow-md rounded-lg overflow-hidden">
            <img
              ref={imgRef}
              src={currentPageData.blobUrl}
              alt={`第 ${currentPage + 1} 页`}
              onLoad={handleImgLoad}
              className="block max-w-full"
              style={{ display: imgLoaded ? 'block' : 'none' }}
            />

            {!imgLoaded && (
              <div className="w-[560px] h-[792px] bg-slate-200 animate-pulse flex items-center justify-center">
                <div className="flex flex-col items-center gap-3 text-slate-400">
                  <div className="w-10 h-10 rounded-full border-[3px] border-slate-300 border-t-slate-500 animate-spin" />
                  <span className="text-xs">加载页面图像...</span>
                </div>
              </div>
            )}

            {imgLoaded && highlightOnThisPage && highlight && naturalSize.w > 0 && (
              <svg
                className="absolute inset-0 pointer-events-none"
                width={naturalSize.w}
                height={naturalSize.h}
                viewBox={`0 0 ${naturalSize.w} ${naturalSize.h}`}
                style={{ width: '100%', height: '100%' }}
              >
                {highlight.positions.map((pos, i) => {
                  const pts = buildPolygonPoints(pos)
                  if (!pts) return null
                  return (
                    <polygon
                      key={i}
                      points={pts}
                      fill="rgba(245,158,11,0.22)"
                      stroke="rgba(245,158,11,0.9)"
                      strokeWidth="2"
                      className="highlight-polygon"
                    />
                  )
                })}
              </svg>
            )}
          </div>
        ) : currentPageData && !currentPageData.blobUrl ? (
          <div className="flex flex-col items-center justify-center h-64 text-slate-400 gap-3">
            <div className="w-8 h-8 rounded-full border-[3px] border-slate-200 border-t-slate-400 animate-spin" />
            <p className="text-sm">图像准备中，请稍候...</p>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-64 text-slate-300 gap-3">
            <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <p className="text-sm">暂无页面预览</p>
          </div>
        )}
      </div>

      {/* Thumbnail strip */}
      {pages.length > 1 && (
        <div className="flex-shrink-0 border-t border-slate-200 bg-white px-3 py-2">
          <div className="flex items-center gap-1.5 overflow-x-auto">
            <span className="text-xs text-slate-400 flex-shrink-0 mr-1">共 {pages.length} 页</span>
            {pages.map((page, idx) => (
              <button
                key={idx}
                onClick={() => onPageChange(idx)}
                className={[
                  'flex-shrink-0 rounded-md overflow-hidden transition-all',
                  currentPage === idx
                    ? 'ring-2 ring-blue-500 ring-offset-1 shadow-md opacity-100'
                    : 'opacity-50 hover:opacity-80',
                ].join(' ')}
                title={`第 ${idx + 1} 页`}
              >
                {page.blobUrl ? (
                  <img src={page.blobUrl} alt={`第 ${idx + 1} 页`} className="w-10 h-14 object-cover object-top" />
                ) : (
                  <div className="w-10 h-14 bg-slate-100 flex items-center justify-center">
                    <span className="text-[10px] text-slate-400">{idx + 1}</span>
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Page nav */}
      <div className="flex-shrink-0 bg-white border-t border-slate-200 px-4 py-2 flex items-center justify-between">
        <button
          onClick={() => onPageChange(Math.max(0, currentPage - 1))}
          disabled={currentPage === 0}
          className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        <span className="text-sm text-slate-500">
          第 <span className="font-medium text-slate-800">{currentPage + 1}</span> 页 / 共 {pages.length} 页
          {highlight && highlightOnThisPage && (
            <span className="ml-2 text-xs text-amber-600">· 已定位: {highlight.label}</span>
          )}
        </span>

        <button
          onClick={() => onPageChange(Math.min(pages.length - 1, currentPage + 1))}
          disabled={currentPage === pages.length - 1}
          className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    </div>
  )
}
