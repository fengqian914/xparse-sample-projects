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
const asArr = (v) => (Array.isArray(v) ? v : [])

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
 * Classify the document (is it a resume? what style?).
 * @param {string} markdown
 * @returns {Promise<{ classification: object, rawUnwrapped: object }>}
 */
export async function classifyDocument(markdown) {
  const response = await callLlmApi(markdown, CLASSIFICATION_PROMPT)
  const rawLlmJson = response.result?.llm_json ?? {}
  const unwrapped = unwrap(rawLlmJson) ?? {}

  const ds = unwrapped.detected_sections ?? {}
  const sh = unwrapped.strategy_hints ?? {}

  const classification = {
    is_target_document: bool(unwrapped.is_target_document),
    document_type: str(unwrapped.document_type),
    language: str(unwrapped.language),
    layout_style: str(unwrapped.layout_style),
    resume_style: str(unwrapped.resume_style),
    detected_sections: {
      basic_info: bool(ds.basic_info),
      education: bool(ds.education),
      work_experience: bool(ds.work_experience),
      project_experience: bool(ds.project_experience),
      skills: bool(ds.skills),
      certificates: bool(ds.certificates),
      self_summary: bool(ds.self_summary),
    },
    strategy_hints: {
      prefer_block_extraction: bool(sh.prefer_block_extraction),
      expect_timeline_sections: bool(sh.expect_timeline_sections),
      focus_aliases: str(sh.focus_aliases),
    },
    confidence: typeof unwrapped.confidence === 'number'
      ? String(unwrapped.confidence)
      : str(unwrapped.confidence),
    warnings: str(unwrapped.warnings),
  }

  return { classification, rawUnwrapped: unwrapped }
}

// ─── Field extraction ─────────────────────────────────────────────────────────

/**
 * Extract all resume fields using classification context.
 * @param {string} markdown
 * @param {string} classificationJson
 * @returns {Promise<{ extraction: object }>}
 */
export async function extractFields(markdown, classificationJson) {
  const prompt = buildExtractionPrompt(classificationJson)
  const response = await callLlmApi(markdown, prompt)
  const rawLlmJson = response.result?.llm_json ?? {}
  const unwrapped = unwrap(rawLlmJson) ?? {}

  const rawSF = unwrapped.standard_fields ?? {}
  const bi = rawSF.basic_info ?? {}

  const extraction = {
    standard_fields: {
      basic_info: {
        name: str(bi.name),
        gender: str(bi.gender),
        phone: str(bi.phone),
        email: str(bi.email),
        current_city: str(bi.current_city),
        birth_date: str(bi.birth_date),
        highest_degree: str(bi.highest_degree),
        years_of_experience: str(bi.years_of_experience),
        avatar_url: str(bi.avatar_url),
      },
      education: asArr(rawSF.education).map((e) => ({
        school: str(e?.school),
        major: str(e?.major),
        degree: str(e?.degree),
        start_date: str(e?.start_date),
        end_date: str(e?.end_date),
        description: str(e?.description),
      })),
      work_experience: asArr(rawSF.work_experience).map((e) => ({
        company: str(e?.company),
        position: str(e?.position),
        start_date: str(e?.start_date),
        end_date: str(e?.end_date),
        responsibilities: str(e?.responsibilities),
        achievements: str(e?.achievements),
      })),
      project_experience: asArr(rawSF.project_experience).map((e) => ({
        project_name: str(e?.project_name),
        role: str(e?.role),
        start_date: str(e?.start_date),
        end_date: str(e?.end_date),
        description: str(e?.description),
      })),
      skills: asArr(rawSF.skills).map((e) => ({
        skill_name: str(e?.skill_name),
        skill_level: str(e?.skill_level),
      })),
      certificates: asArr(rawSF.certificates).map((e) => ({
        certificate_name: str(e?.certificate_name),
        language_name: str(e?.language_name),
        language_level: str(e?.language_level),
      })),
      self_summary: str(rawSF.self_summary),
    },
    extra_fields: asArr(unwrapped.extra_fields)
      .filter((ef) => ef?.label || ef?.value)
      .map((ef) => ({
        label: str(ef?.label),
        value: str(ef?.value),
        confidence: typeof ef?.confidence === 'number'
          ? String(ef.confidence)
          : str(ef?.confidence),
      })),
    missing_fields: str(unwrapped.missing_fields),
    warnings: str(unwrapped.warnings),
  }

  return { extraction }
}
