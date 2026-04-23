import { LLM_EXTRACT_URL, LLM_MODEL, CLASSIFICATION_PROMPT, buildExtractionPrompt } from '../constants.js'

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

const str = (v) => (typeof v === 'string' ? v : null)
const bool = (v) => (v === 'true' || v === true)

// ─── Core LLM call ────────────────────────────────────────────────────────────

async function callLlmApi(markdown, prompt) {
  const response = await fetch(LLM_EXTRACT_URL, {
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

// ─── Classification ────────────────────────────────────────────────────────────

/**
 * Classify the document (is it a BOL? what type?).
 * @param {string} markdown
 * @returns {Promise<{ classification: object, rawUnwrapped: object }>}
 */
export async function classifyDocument(markdown) {
  const response = await callLlmApi(markdown, CLASSIFICATION_PROMPT)
  const rawLlmJson = response.result?.llm_json ?? {}
  const unwrapped = unwrap(rawLlmJson) ?? {}

  const ls = unwrapped.likely_sections ?? {}
  const sh = unwrapped.strategy_hints ?? {}

  const classification = {
    is_target_document: bool(unwrapped.is_target_document),
    document_type: str(unwrapped.document_type),
    language: str(unwrapped.language),
    layout_style: str(unwrapped.layout_style),
    cargo_region_type: str(unwrapped.cargo_region_type),
    likely_sections: {
      shipper: bool(ls.shipper),
      consignee: bool(ls.consignee),
      notify_party: bool(ls.notify_party),
      vessel_voyage: bool(ls.vessel_voyage),
      ports_airports: bool(ls.ports_airports),
      cargo_details: bool(ls.cargo_details),
      container_seal: bool(ls.container_seal),
      awb_specific: bool(ls.awb_specific),
    },
    strategy_hints: {
      focus_aliases: str(sh.focus_aliases),
      prefer_table_extraction_for_cargo: bool(sh.prefer_table_extraction_for_cargo),
      prefer_block_extraction_for_parties: bool(sh.prefer_block_extraction_for_parties),
    },
    confidence: str(unwrapped.confidence),
    warnings: str(unwrapped.warnings),
  }

  return { classification, rawUnwrapped: unwrapped }
}

// ─── Field extraction ─────────────────────────────────────────────────────────

/**
 * Extract all BOL fields using classification context.
 * @param {string} markdown
 * @param {string} classificationJson - JSON.stringify of rawUnwrapped classification
 * @returns {Promise<{ extraction: object }>}
 */
export async function extractFields(markdown, classificationJson) {
  const prompt = buildExtractionPrompt(classificationJson)
  const response = await callLlmApi(markdown, prompt)
  const rawLlmJson = response.result?.llm_json ?? {}
  const unwrapped = unwrap(rawLlmJson) ?? {}

  const rawSF = unwrapped.standard_fields ?? {}
  const o = (x) => x ?? {}

  const extraction = {
    standard_fields: {
      document_no: str(rawSF.document_no),
      shipper: {
        name: str(o(rawSF.shipper).name),
        address: str(o(rawSF.shipper).address),
      },
      consignee: {
        name: str(o(rawSF.consignee).name),
        address: str(o(rawSF.consignee).address),
      },
      notify_party: {
        name: str(o(rawSF.notify_party).name),
        address: str(o(rawSF.notify_party).address),
      },
      vessel: str(rawSF.vessel),
      voyage_no: str(rawSF.voyage_no),
      carrier_code: str(rawSF.carrier_code),
      place_of_receipt: str(rawSF.place_of_receipt),
      port_of_loading: str(rawSF.port_of_loading),
      port_of_discharge: str(rawSF.port_of_discharge),
      place_of_delivery: str(rawSF.place_of_delivery),
      freight_terms: str(rawSF.freight_terms),
      issue_date: str(rawSF.issue_date),
      number_of_originals: str(rawSF.number_of_originals),
      package_count: str(rawSF.package_count),
      package_type: str(rawSF.package_type),
      description_of_goods: str(rawSF.description_of_goods),
      gross_weight: str(rawSF.gross_weight),
      measurement: str(rawSF.measurement),
      chargeable_weight: str(rawSF.chargeable_weight),
      container_no: str(rawSF.container_no),
      seal_no: str(rawSF.seal_no),
      handling_info: str(rawSF.handling_info),
    },
    extra_fields: (Array.isArray(unwrapped.extra_fields) ? unwrapped.extra_fields : [])
      .filter((ef) => ef?.label || ef?.value)
      .map((ef) => ({
        label: str(ef?.label),
        value: str(ef?.value),
        confidence: str(ef?.confidence),
      })),
    missing_fields: str(unwrapped.missing_fields),
    warnings: str(unwrapped.warnings),
  }

  return { extraction }
}
