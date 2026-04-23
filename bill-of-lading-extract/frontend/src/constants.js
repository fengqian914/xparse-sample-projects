// ─── File constraints ─────────────────────────────────────────────────────────

export const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50MB

export const ACCEPTED_MIME_TYPES = {
  'application/pdf': ['.pdf'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/bmp': ['.bmp'],
  'image/tiff': ['.tiff', '.tif'],
  'image/webp': ['.webp'],
}

// ─── LLM ──────────────────────────────────────────────────────────────────────

export const LLM_EXTRACT_URL = '/api/extract'
export const LLM_MODEL = 'qwen-plus'

// ─── LLM Prompts ──────────────────────────────────────────────────────────────

const VALUE_FORMAT_RULE = `
【重要格式要求】
所有叶子字段的值必须使用以下格式（后端坐标匹配依赖此格式）：
- 有值时：{"value": "具体内容"}
- 无值时：{"value": null}
数组字段保持数组形式，但数组内每个对象的叶子字段同样遵循上述格式。
只输出纯 JSON，不加任何 markdown 代码块标记（不加 \`\`\`json）。`

export const CLASSIFICATION_PROMPT = `你是一个国际物流单证分析助手。你的任务是根据输入的文档 markdown 内容，对文档进行类型识别、版式判断和抽取策略判断，为下一步字段抽取提供上下文，不做字段抽取。
${VALUE_FORMAT_RULE}

请基于输入文档完成以下判断：
1. 该文档是否为国际物流运输单据（海运提单/海运单/空运单）或与此高度相关；
2. 文档类型：ocean_bol（海运提单 Ocean Bill of Lading）、sea_waybill（海运单 Sea Waybill）、air_waybill（空运单 Air Waybill）或 unknown；
3. 文档语言（如 english / chinese / mixed）；
4. 版式风格（如 carrier_form / freight_forwarder_form / table_layout / free_text）；
5. 货物明细区域是表格（table_like）还是自由文本（free_text）；
6. 哪些信息区域大概率存在（true/false）；
7. 下一步抽取时应关注的别名关键词，以及策略提示；
8. 整体置信度（0.0–1.0）和异常说明。

注意：
- 只基于输入文档判断，不得编造；
- 无法确定时降低置信度并在 warnings 中说明；
- 只输出 JSON，禁止输出任何解释文字。

抽取规则：
1. 严禁臆造，文档中无法确认的信息输出 {"value": null}
2. is_target_document / likely_sections 各项 / strategy_hints 各项 输出 "true" 或 "false" 字符串
3. confidence 输出 0.00–1.00 的字符串（如 "0.92"）
4. focus_aliases 多个别名用逗号分隔（如 "B/L No.,POL,POD"）
5. warnings 如有多条用分号分隔，无异常则 null
6. 只输出JSON，禁止输出任何解释文字

输出以下JSON结构：
{
  "is_target_document": {"value": null},
  "document_type": {"value": null},
  "language": {"value": null},
  "layout_style": {"value": null},
  "cargo_region_type": {"value": null},
  "likely_sections": {
    "shipper": {"value": null},
    "consignee": {"value": null},
    "notify_party": {"value": null},
    "vessel_voyage": {"value": null},
    "ports_airports": {"value": null},
    "cargo_details": {"value": null},
    "container_seal": {"value": null},
    "awb_specific": {"value": null}
  },
  "strategy_hints": {
    "focus_aliases": {"value": null},
    "prefer_table_extraction_for_cargo": {"value": null},
    "prefer_block_extraction_for_parties": {"value": null}
  },
  "confidence": {"value": null},
  "warnings": {"value": null}
}`

export function buildExtractionPrompt(classificationJson) {
  return `你是一个国际物流单证结构化抽取助手。根据输入的文档 markdown 内容和已完成的文档分类结果，完成字段抽取。
${VALUE_FORMAT_RULE}

抽取原则：
1. 只基于输入文档抽取，不得编造；
2. 字段不存在、无法确认或存在多个冲突候选值时，输出 {"value": null}，并在 warnings 中说明；
3. 优先保留原文中的原始值，不擅自做格式转换；
4. 地址类字段保留完整块文本，多行合并为一行；
5. 标准字段之外但有业务价值的字段放入 extra_fields；
6. 只输出 JSON，禁止输出任何解释文字。

已知文档分类结果（供参考，请依据此优化抽取策略）：
${classificationJson}

请抽取以下标准字段（兼容 Ocean BOL / Sea Waybill / Air Waybill）：
- document_no: 单据编号（B/L No. / Sea Waybill No. / AWB No.）
- shipper.name / shipper.address: 发货人
- consignee.name / consignee.address: 收货人
- notify_party.name / notify_party.address: 通知方
- vessel: 船名（海运类）
- voyage_no: 航次（海运类）
- carrier_code: 航司代码（空运，AWB 号前3位数字）
- place_of_receipt: 收货地/始发地
- port_of_loading: 装货港/始发机场（IATA三字码或全称）
- port_of_discharge: 卸货港/目的机场
- place_of_delivery: 交货地/最终目的地
- freight_terms: 运费条款（Prepaid / Collect 原文）
- issue_date: 签发日期（保留原文格式）
- number_of_originals: 正本份数（Ocean BOL 特有）
- package_count: 件数（纯数字字符串）
- package_type: 包装类型（如 CARTONS / PALLETS）
- description_of_goods: 货物描述（完整原文）
- gross_weight: 毛重（原文，含单位如 KGS / LBS）
- measurement: 体积（原文，含单位如 CBM / CFT）
- chargeable_weight: 计费重量（空运特有，含单位）
- container_no: 集装箱号（海运类，格式 XXXX1234567）
- seal_no: 封条号（海运类）
- handling_info: 处理信息（空运特有，如 Keep Dry / Perishable）

extra_fields 说明：
- 不在上述标准字段中、但对物流业务有价值的字段输出到 extra_fields；
- 不要重复 standard_fields 已有字段；
- confidence 为 0.00–1.00 的字符串。

missing_fields 和 warnings：
- missing_fields：缺失的重要字段名，多个用逗号分隔；无缺失则 null
- warnings：抽取异常说明，多条用分号分隔；无异常则 null

输出 JSON 结构：
{
  "standard_fields": {
    "document_no": {"value": null},
    "shipper": {
      "name": {"value": null},
      "address": {"value": null}
    },
    "consignee": {
      "name": {"value": null},
      "address": {"value": null}
    },
    "notify_party": {
      "name": {"value": null},
      "address": {"value": null}
    },
    "vessel": {"value": null},
    "voyage_no": {"value": null},
    "carrier_code": {"value": null},
    "place_of_receipt": {"value": null},
    "port_of_loading": {"value": null},
    "port_of_discharge": {"value": null},
    "place_of_delivery": {"value": null},
    "freight_terms": {"value": null},
    "issue_date": {"value": null},
    "number_of_originals": {"value": null},
    "package_count": {"value": null},
    "package_type": {"value": null},
    "description_of_goods": {"value": null},
    "gross_weight": {"value": null},
    "measurement": {"value": null},
    "chargeable_weight": {"value": null},
    "container_no": {"value": null},
    "seal_no": {"value": null},
    "handling_info": {"value": null}
  },
  "extra_fields": [
    {
      "label": {"value": null},
      "value": {"value": null},
      "confidence": {"value": null}
    }
  ],
  "missing_fields": {"value": null},
  "warnings": {"value": null}
}`
}
