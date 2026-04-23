// ─── File constraints ─────────────────────────────────────────────────────────

export const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50MB

export const ACCEPTED_MIME_TYPES = {
  'application/pdf': ['.pdf'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/bmp': ['.bmp'],
  'image/tiff': ['.tiff', '.tif'],
  'image/webp': ['.webp'],
  'application/msword': ['.doc'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
}

// ─── LLM ──────────────────────────────────────────────────────────────────────

export const LLM_EXTRACT_URL = '/api/extract'
export const LLM_MODEL = 'qwen-plus'

// ─── LLM Prompts ──────────────────────────────────────────────────────────────

export const CLASSIFICATION_PROMPT = `你是一个专业的文档识别助手，负责判断输入文档是否为简历，并为后续字段抽取提供策略建议。

## 输出规则
- 所有叶子字段（标量值）必须使用 {"value": <值>} 格式，空值写 {"value": null}
- 只输出纯 JSON，不加任何 markdown 代码块标记
- 只基于文档内容判断，不得使用外部知识推测

## 输出结构（严格按此 JSON 格式输出）

{
  "is_target_document": {"value": true},
  "document_type": {"value": "resume"},
  "language": {"value": "zh"},
  "layout_style": {"value": "single_column"},
  "resume_style": {"value": "experienced_professional"},
  "detected_sections": {
    "basic_info": {"value": true},
    "education": {"value": true},
    "work_experience": {"value": true},
    "project_experience": {"value": false},
    "skills": {"value": true},
    "certificates": {"value": false},
    "self_summary": {"value": false}
  },
  "strategy_hints": {
    "prefer_block_extraction": {"value": true},
    "expect_timeline_sections": {"value": true},
    "focus_aliases": {"value": "教育经历,工作经历,项目经历,技能,证书"}
  },
  "confidence": {"value": 0.95},
  "warnings": {"value": null}
}

## 字段说明
- is_target_document: 文档是否为有效简历
- document_type: "resume"（有效简历）或 "unknown"（非简历文档）
- language: "zh"（中文）/ "en"（英文）/ "mixed"（中英混合）
- layout_style: "single_column"（单栏）/ "two_column"（双栏）/ "graphic"（图形化/图片简历）
- resume_style: "fresh_graduate"（应届生）/ "experienced_professional"（职场人士）/ "academic"（学术/科研）/ "other"
- detected_sections: 文档中检测到的各模块是否存在（true/false）
- strategy_hints.focus_aliases: 文档中实际使用的各模块标题关键词，逗号分隔
- confidence: 0-1 之间的置信度数值
- warnings: 特殊情况说明（如多语言混杂、扫描质量差），多条用逗号分隔，无则 null`

export function buildExtractionPrompt(classificationJson) {
  return `你是一个专业的简历结构化抽取助手。请根据文档内容和下方的分类结果，将简历信息抽取为标准 JSON 结构。

## 分类结果（上下文参考）
${classificationJson}

## 输出规则
1. 所有叶子字段（标量值）必须使用 {"value": <值>} 格式，空值写 {"value": null}
2. 数组字段（education / work_experience / project_experience / skills / certificates）保持 JSON 数组格式
3. 数组内每个条目的叶子字段同样使用 {"value": <值>} 包裹
4. 只基于文档内容抽取，不得编造，找不到则填 {"value": null}
5. 日期格式尽量统一为 YYYY-MM 或 YYYY，如 2021-07、2024、至今
6. 优先保留原始值，复杂归一化交由规则层处理
7. 只输出纯 JSON，不加任何 markdown 代码块标记

## 输出结构（严格按此 JSON 格式输出）

{
  "standard_fields": {
    "basic_info": {
      "name": {"value": null},
      "gender": {"value": null},
      "phone": {"value": null},
      "email": {"value": null},
      "current_city": {"value": null},
      "birth_date": {"value": null},
      "highest_degree": {"value": null},
      "years_of_experience": {"value": null},
      "avatar_url": {"value": null}
    },
    "education": [
      {
        "school": {"value": null},
        "major": {"value": null},
        "degree": {"value": null},
        "start_date": {"value": null},
        "end_date": {"value": null},
        "description": {"value": null}
      }
    ],
    "work_experience": [
      {
        "company": {"value": null},
        "position": {"value": null},
        "start_date": {"value": null},
        "end_date": {"value": null},
        "responsibilities": {"value": null},
        "achievements": {"value": null}
      }
    ],
    "project_experience": [
      {
        "project_name": {"value": null},
        "role": {"value": null},
        "start_date": {"value": null},
        "end_date": {"value": null},
        "description": {"value": null}
      }
    ],
    "skills": [
      {
        "skill_name": {"value": null},
        "skill_level": {"value": null}
      }
    ],
    "certificates": [
      {
        "certificate_name": {"value": null},
        "language_name": {"value": null},
        "language_level": {"value": null}
      }
    ],
    "self_summary": {"value": null}
  },
  "extra_fields": [
    {
      "label": {"value": "字段名称"},
      "value": {"value": "字段内容"},
      "confidence": {"value": 0.85}
    }
  ],
  "missing_fields": {"value": null},
  "warnings": {"value": null}
}

## 字段说明
- basic_info.avatar_url: 候选人头像照片的完整图片 URL（以 http/https 开头）。文档解析开启图片分析后，markdown 中的图片（格式为 ![](URL)）后会附带 HTML 注释块，内含该图片的分析结果，格式如下：
  <!-- 摘要：...
  类别：照片
  描述：...
  分析：... -->
  识别规则：找注释中"类别"为"照片"、且摘要/描述涉及人物面部或证件照的图片（关键词参考：证件照、头像、正面照、面部、人像、面带微笑等）。头像通常出现在简历最开头的基本信息区域。找到则填其完整 URL，未找到或图片无分析注释则填 {"value": null}。若有多张疑似，选最靠近简历开头且最符合证件照特征的一张。
- basic_info.years_of_experience: 简历中明确写出的工作年限描述，如"3年"；若未写明则填 null
- education: 按时间倒序排列（最近的在前），每段教育经历一个条目
- work_experience: 按时间倒序排列，每段工作经历（含实习）一个条目；responsibilities 包含主要工作职责、项目描述、技术栈等完整描述
- project_experience: 独立项目经历，如有在工作经历中描述的项目则不重复提取
- skills: 技能列表，每个技能独立一条；skill_level 为熟练程度描述或 null
- certificates: 证书和语言能力合并在此；certificate_name 为证书名称，language_name 为语言名称，language_level 为语言等级
- self_summary: 自我评价、个人总结等模块，保留原文，整段文字放入 value
- extra_fields: 简历中有业务价值但不在标准字段中的信息，如期望薪资、求职意向城市、作品集链接等
- missing_fields: 简历中未找到的关键字段列表，多个用逗号分隔，如 "email,current_city"
- warnings: 抽取过程中发现的异常情况，如"检测到多个手机号"，多条用逗号分隔`
}
