import React from 'react'

export default function ExportActions({ classification, extraction }) {
  if (!extraction) return null

  const handleExportJson = () => {
    const data = {
      document_type: classification?.document_type,
      classification_confidence: classification?.confidence,
      language: classification?.language,
      standard_fields: extraction.standard_fields,
      extra_fields: extraction.extra_fields,
      missing_fields: extraction.missing_fields,
      warnings: extraction.warnings,
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const ts = new Date().toISOString().slice(0, 16).replace('T', '_').replace(':', '')
    a.href = url
    a.download = `bol_extract_${ts}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleExportCsv = () => {
    const sf = extraction.standard_fields
    const rows = []
    const q = (s) => `"${(s ?? '').replace(/"/g, '""')}"`
    const row = (...cells) => rows.push(cells.map((c) => q(c ?? '')))

    row('=== 单据信息 ===')
    row('文档类型', classification?.document_type ?? '')
    row('单据编号', sf.document_no)
    row('运费条款', sf.freight_terms)
    row('签发日期', sf.issue_date)
    row('正本份数', sf.number_of_originals)
    rows.push([])

    row('=== 当事方 ===')
    row('发货人名称', sf.shipper?.name)
    row('发货人地址', sf.shipper?.address)
    row('收货人名称', sf.consignee?.name)
    row('收货人地址', sf.consignee?.address)
    row('通知方名称', sf.notify_party?.name)
    row('通知方地址', sf.notify_party?.address)
    rows.push([])

    row('=== 运输信息 ===')
    row('船名', sf.vessel)
    row('航次', sf.voyage_no)
    row('航司代码', sf.carrier_code)
    rows.push([])

    row('=== 港口/机场 ===')
    row('收货地', sf.place_of_receipt)
    row('装货港', sf.port_of_loading)
    row('卸货港', sf.port_of_discharge)
    row('交货地', sf.place_of_delivery)
    rows.push([])

    row('=== 货物信息 ===')
    row('件数', sf.package_count)
    row('包装类型', sf.package_type)
    row('货物描述', sf.description_of_goods)
    row('毛重', sf.gross_weight)
    row('体积', sf.measurement)
    row('计费重量', sf.chargeable_weight)
    row('集装箱号', sf.container_no)
    row('封条号', sf.seal_no)
    row('操作指示', sf.handling_info)
    rows.push([])

    if (extraction.extra_fields.length > 0) {
      row('=== 扩展字段 ===')
      row('字段名', '值', '置信度')
      for (const ef of extraction.extra_fields) {
        row(ef.label, ef.value, ef.confidence)
      }
    }

    const csvContent = rows.map((r) => r.join(',')).join('\n')
    const blob = new Blob(['﻿' + csvContent], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const ts = new Date().toISOString().slice(0, 16).replace('T', '_').replace(':', '')
    a.href = url
    a.download = `bol_extract_${ts}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="relative group">
      <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-white bg-slate-700 hover:bg-slate-600 transition-colors">
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
        </svg>
        导出
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      <div className="absolute right-0 top-full mt-1 w-52 bg-white border border-slate-200 rounded-xl shadow-lg z-50 hidden group-hover:block">
        <button onClick={handleExportJson} className="w-full text-left px-4 py-2.5 text-xs text-slate-700 hover:bg-slate-50 rounded-t-xl transition-colors">
          导出抽取结果 (.json)
        </button>
        <button onClick={handleExportCsv} className="w-full text-left px-4 py-2.5 text-xs text-slate-700 hover:bg-slate-50 rounded-b-xl transition-colors border-t border-slate-100">
          导出字段明细 (.csv)
        </button>
      </div>
    </div>
  )
}
