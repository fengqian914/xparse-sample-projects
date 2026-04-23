import React from 'react'

const STEPS = ['上传文件', 'OCR 解析', '字段抽取', '查看结果']

function getStepIndex(extractionPhase) {
  if (extractionPhase === 'idle') return 1
  if (extractionPhase === 'classifying' || extractionPhase === 'extracting') return 2
  return 3
}

export default function StepIndicator({ extractionPhase }) {
  const current = getStepIndex(extractionPhase)
  const isError = extractionPhase === 'error'

  return (
    <div className="hidden md:flex items-center gap-1">
      {STEPS.map((label, idx) => {
        const done = idx < current
        const active = idx === current
        const failed = isError && idx === current

        return (
          <React.Fragment key={label}>
            {idx > 0 && (
              <div className={`w-5 h-px ${done ? 'bg-blue-400' : 'bg-slate-200'}`} />
            )}
            <div className="flex items-center gap-1">
              <div className={[
                'w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0',
                failed ? 'bg-red-100 text-red-600' :
                done ? 'bg-blue-600 text-white' :
                active ? 'bg-blue-100 text-blue-700 ring-2 ring-blue-300' :
                'bg-slate-100 text-slate-400',
              ].join(' ')}>
                {done ? (
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                ) : failed ? '!' : idx + 1}
              </div>
              <span className={`text-[10px] whitespace-nowrap ${
                failed ? 'text-red-500' :
                active ? 'text-blue-700 font-semibold' :
                done ? 'text-slate-500' : 'text-slate-300'
              }`}>
                {label}
              </span>
            </div>
          </React.Fragment>
        )
      })}
    </div>
  )
}
