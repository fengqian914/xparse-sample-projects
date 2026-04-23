import React, { useState } from 'react'
import ClassificationCard from './ClassificationCard.jsx'
import ExportActions from './ExportActions.jsx'

const FIELD_NAMES_ZH = {
  document_no: '单据编号', issue_date: '签发日期', freight_terms: '运费条款',
  number_of_originals: '正本份数', shipper: '发货人', consignee: '收货人',
  notify_party: '通知方', vessel: '船名', voyage_no: '航次', carrier_code: '航司代码',
  place_of_receipt: '收货地', port_of_loading: '装货港', port_of_discharge: '卸货港',
  place_of_delivery: '交货地', package_count: '件数', package_type: '包装类型',
  description_of_goods: '货物描述', gross_weight: '毛重', measurement: '体积',
  chargeable_weight: '计费重量', container_no: '集装箱号', seal_no: '封条号',
  handling_info: '处理信息',
}

function translateMissing(str) {
  if (!str) return null
  return str.split(',').map((f) => FIELD_NAMES_ZH[f.trim()] ?? f.trim()).join('、')
}

// ─── Field row ────────────────────────────────────────────────────────────────

function FieldRow({ label, value }) {
  if (!value) return null
  return (
    <div className="flex items-start gap-2 px-3 py-2 rounded-lg text-xs border-b border-slate-50 last:border-0">
      <span className="w-24 flex-shrink-0 text-slate-400 pt-0.5">{label}</span>
      <span className="flex-1 text-slate-700 break-words">{value}</span>
    </div>
  )
}

// ─── Party block ──────────────────────────────────────────────────────────────

function PartyBlock({ title, name, address }) {
  if (!name && !address) return null
  return (
    <div className="bg-slate-50 rounded-lg p-3 mb-2 last:mb-0">
      <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1.5">{title}</div>
      {name && <div className="text-xs font-semibold text-slate-700 leading-relaxed">{name}</div>}
      {address && <div className="text-xs text-slate-500 mt-0.5 whitespace-pre-wrap leading-relaxed">{address}</div>}
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

// ─── Loading state ────────────────────────────────────────────────────────────

function LoadingState({ phase }) {
  const label = phase === 'classifying' ? '文档分类中...' : '字段抽取中...'
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 text-slate-400">
      <div className="w-10 h-10 rounded-full border-[3px] border-slate-200 border-t-blue-500 animate-spin" />
      <p className="text-sm">{label}</p>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function ExtractionPanel({
  classification,
  extraction,
  extractionPhase,
  extractionError,
}) {
  if (extractionPhase === 'classifying' || extractionPhase === 'extracting') {
    return <LoadingState phase={extractionPhase} />
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
          <p className="text-xs text-slate-400 mt-1 max-w-xs">{extractionError}</p>
        </div>
      </div>
    )
  }

  if (!extraction) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-300 gap-3">
        <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <p className="text-sm">等待抽取结果...</p>
      </div>
    )
  }

  const sf = extraction.standard_fields
  const isOcean = ['ocean_bol', 'sea_waybill'].includes(classification?.document_type)
  const isAir = classification?.document_type === 'air_waybill'

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-shrink-0 flex items-center justify-between px-3 pt-3 pb-2">
        <div className="flex-1 min-w-0">
          <ClassificationCard classification={classification} />
        </div>
        <div className="ml-2 flex-shrink-0">
          <ExportActions classification={classification} extraction={extraction} />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-3 min-h-0">
        {/* 单据信息 */}
        <Section title="单据信息">
          <FieldRow label="单据编号" value={sf.document_no} />
          <FieldRow label="运费条款" value={sf.freight_terms} />
          <FieldRow label="签发日期" value={sf.issue_date} />
          {isOcean && <FieldRow label="正本份数" value={sf.number_of_originals} />}
        </Section>

        {/* 当事方 */}
        {(sf.shipper?.name || sf.shipper?.address || sf.consignee?.name || sf.notify_party?.name) && (
          <Section title="当事方">
            <PartyBlock title="发货人 Shipper" name={sf.shipper?.name} address={sf.shipper?.address} />
            <PartyBlock title="收货人 Consignee" name={sf.consignee?.name} address={sf.consignee?.address} />
            <PartyBlock title="通知方 Notify Party" name={sf.notify_party?.name} address={sf.notify_party?.address} />
          </Section>
        )}

        {/* 运输信息 */}
        {(sf.vessel || sf.voyage_no || sf.carrier_code) && (
          <Section title="运输信息">
            {isOcean && <FieldRow label="船名" value={sf.vessel} />}
            {isOcean && <FieldRow label="航次" value={sf.voyage_no} />}
            {isAir && <FieldRow label="航司代码" value={sf.carrier_code} />}
            {!isOcean && !isAir && (
              <>
                <FieldRow label="船名" value={sf.vessel} />
                <FieldRow label="航次" value={sf.voyage_no} />
                <FieldRow label="航司代码" value={sf.carrier_code} />
              </>
            )}
          </Section>
        )}

        {/* 港口/机场 */}
        {(sf.place_of_receipt || sf.port_of_loading || sf.port_of_discharge || sf.place_of_delivery) && (
          <Section title="港口 / 机场">
            <FieldRow label="收货地" value={sf.place_of_receipt} />
            <FieldRow label="装货港" value={sf.port_of_loading} />
            <FieldRow label="卸货港" value={sf.port_of_discharge} />
            <FieldRow label="交货地" value={sf.place_of_delivery} />
          </Section>
        )}

        {/* 货物信息 */}
        {(sf.package_count || sf.description_of_goods || sf.gross_weight) && (
          <Section title="货物信息">
            <FieldRow label="件数" value={sf.package_count} />
            <FieldRow label="包装类型" value={sf.package_type} />
            <FieldRow label="毛重" value={sf.gross_weight} />
            <FieldRow label="体积" value={sf.measurement} />
            {isAir && <FieldRow label="计费重量" value={sf.chargeable_weight} />}
            {sf.description_of_goods && (
              <div className="px-3 py-2 text-xs">
                <div className="text-slate-400 mb-1">货物描述</div>
                <div className="text-slate-700 whitespace-pre-wrap leading-relaxed bg-slate-50 rounded-lg p-2">
                  {sf.description_of_goods}
                </div>
              </div>
            )}
          </Section>
        )}

        {/* 集装箱 */}
        {isOcean && (sf.container_no || sf.seal_no) && (
          <Section title="集装箱信息">
            <FieldRow label="集装箱号" value={sf.container_no} />
            <FieldRow label="封条号" value={sf.seal_no} />
          </Section>
        )}

        {/* 操作指示（空运） */}
        {isAir && sf.handling_info && (
          <Section title="操作指示">
            <FieldRow label="处理信息" value={sf.handling_info} />
          </Section>
        )}

        {/* 扩展字段 */}
        {extraction.extra_fields.length > 0 && (
          <Section title="扩展字段" badge={extraction.extra_fields.length} defaultOpen={false}>
            {extraction.extra_fields.map((ef, i) => (
              <FieldRow key={i} label={ef.label ?? `字段${i + 1}`} value={ef.value} />
            ))}
          </Section>
        )}

        {/* 缺失字段 & 警告 */}
        {(extraction.missing_fields || extraction.warnings) && (
          <div className="mt-2 space-y-2">
            {extraction.missing_fields && (
              <div className="flex items-start gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-500">
                <span className="font-medium flex-shrink-0">缺失字段:</span>
                <span>{translateMissing(extraction.missing_fields)}</span>
              </div>
            )}
            {extraction.warnings && (
              <div className="flex items-start gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-700">
                <svg className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <span>{extraction.warnings}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
