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

export const HEADER_EXTRACTION_PROMPT = `你是一名专业的银行流水结构化抽取专家。请从以下银行流水文档中抽取文档级信息和账户信息。
${VALUE_FORMAT_RULE}

抽取规则：
1. 严禁臆造，文档中没有的字段输出 {"value": null}
2. 日期统一为 YYYY-MM-DD 格式，无法确定时保留原文
3. 金额只返回数值字符串，不带货币符号（如 "12345.67"）
4. 币种返回3位代码（如 CNY / USD / HKD），若只有"人民币"则返回 "CNY"
5. 若文档包含多个账户，accounts 数组列出所有账户
6. 只输出JSON，禁止输出任何解释文字

输出以下JSON结构：
{
  "bank_name": {"value": null},
  "statement_period": {
    "start_date": {"value": null},
    "end_date": {"value": null}
  },
  "accounts": [
    {
      "account_no": {"value": null},
      "account_name": {"value": null},
      "currency": {"value": null},
      "opening_balance": {"value": null},
      "closing_balance": {"value": null}
    }
  ]
}`

export const TRANSACTION_EXTRACTION_PROMPT = `你是一名专业的银行流水交易明细抽取专家。请从以下银行交易表格中抽取每一笔交易记录。
${VALUE_FORMAT_RULE}

抽取规则：
1. 严禁臆造，文档中没有的字段输出 {"value": null}
2. 每一行对应一条交易，合并行内被拆开的多行描述到同一条记录的 description 字段
3. txn_date 统一为 YYYY-MM-DD 格式；txn_time 保留原文（如 "14:35:22"），无时间则 null
4. amount 只填数值字符串（正数，不含正负符号），如 "1000.00"
5. direction 字段：收入/贷记/转入/存入 → 统一输出 "credit"；支出/借记/转出/取款 → 统一输出 "debit"
   若原表有借贷两列，金额在哪列就对应哪个方向；若只有符号+/-则正为credit负为debit
6. balance_after 只填数值字符串，无余额列则 null
7. extra_fields：将本银行流水特有字段（如流水号、渠道、业务类型等）以键值对放入此对象
8. 汇总行、合计行、空行不输出
9. 只输出JSON，禁止输出任何解释文字

输出以下JSON结构：
{
  "transactions": [
    {
      "txn_date": {"value": null},
      "txn_time": {"value": null},
      "amount": {"value": null},
      "direction": {"value": null},
      "balance_after": {"value": null},
      "description": {"value": null},
      "counterparty_name": {"value": null},
      "counterparty_account": {"value": null},
      "remark": {"value": null},
      "extra_fields": {}
    }
  ]
}`
