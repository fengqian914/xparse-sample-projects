# -*- coding: utf-8 -*-
"""
Clinical Trial Subject Recruitment - FastAPI Backend
Endpoints:
  POST /api/parse    - TextIn OCR -> markdown
  POST /api/extract  - LLM -> structured patient JSON
  POST /api/screen   - LLM -> per-criterion eligibility checks
"""

import json
import os
import re
from typing import Any, Optional

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from pathlib import Path
load_dotenv(Path(__file__).parent.parent / ".env")

app = FastAPI(title="Clinical Trial Recruitment API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

TEXTIN_APP_ID     = os.getenv("TEXTIN_APP_ID", "")
TEXTIN_SECRET_CODE = os.getenv("TEXTIN_SECRET_CODE", "")
OPENAI_API_KEY    = os.getenv("OPENAI_API_KEY", "")
OPENAI_BASE_URL   = os.getenv("OPENAI_BASE_URL", "https://dashscope.aliyuncs.com/compatible-mode/v1")
OPENAI_MODEL      = os.getenv("OPENAI_MODEL", "qwen-plus")

TEXTIN_API_URL = "https://api.textin.com/ai/service/v1/pdf_to_markdown"
TEXTIN_PARAMS  = {
    "parse_mode": "scan",
    "page_count": 200,
    "dpi": 144,
    "table_flavor": "html",
    "apply_document_tree": 1,
    "markdown_details": 1,
    "page_details": 1,
    "apply_merge": 1,
    "crop_dewarp": 1,
}


# ── Helpers ───────────────────────────────────────────────────────────────────

def _parse_json(text: str) -> Any:
    text = text.strip()
    text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.MULTILINE)
    text = re.sub(r"\s*```\s*$", "", text, flags=re.MULTILINE)
    text = text.strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        m = re.search(r"[\[{][\s\S]*[\]}]", text)
        if m:
            try:
                return json.loads(m.group())
            except json.JSONDecodeError:
                pass
    return {}


async def _llm(prompt: str) -> str:
    if not OPENAI_API_KEY:
        raise HTTPException(status_code=500, detail="OPENAI_API_KEY not configured.")
    base = OPENAI_BASE_URL.rstrip("/")
    async with httpx.AsyncClient(timeout=120.0) as client:
        resp = await client.post(
            f"{base}/chat/completions",
            headers={"Authorization": f"Bearer {OPENAI_API_KEY}", "Content-Type": "application/json"},
            json={"model": OPENAI_MODEL, "messages": [{"role": "user", "content": prompt}], "temperature": 0.1},
        )
    if not resp.is_success:
        raise HTTPException(status_code=resp.status_code, detail=f"LLM error: {resp.text[:300]}")
    return resp.json()["choices"][0]["message"]["content"]


# ── Endpoints ─────────────────────────────────────────────────────────────────

@app.post("/api/parse")
async def parse_document(file: UploadFile = File(...)):
    """OCR parse medical document via TextIn. Returns markdown text."""
    if not TEXTIN_APP_ID or not TEXTIN_SECRET_CODE:
        raise HTTPException(status_code=500, detail="TextIn credentials not configured.")

    content = await file.read()
    async with httpx.AsyncClient(timeout=120.0) as client:
        resp = await client.post(
            TEXTIN_API_URL,
            headers={
                "x-ti-app-id": TEXTIN_APP_ID,
                "x-ti-secret-code": TEXTIN_SECRET_CODE,
                "Content-Type": "application/octet-stream",
            },
            params=TEXTIN_PARAMS,
            content=content,
        )

    if not resp.is_success:
        raise HTTPException(status_code=resp.status_code, detail=f"TextIn error: {resp.text[:300]}")

    data = resp.json()
    if data.get("code") != 200:
        raise HTTPException(status_code=502, detail=f"TextIn: {data.get('message', 'unknown error')}")

    result = data.get("result", {})
    return {"markdown": result.get("markdown", ""), "pages": result.get("pages", [])}


class ExtractRequest(BaseModel):
    markdown: str


@app.post("/api/extract")
async def extract_patient(req: ExtractRequest):
    """LLM extracts structured patient fields from OCR markdown."""
    prompt = f"""从以下医疗文档中提取患者信息，以 JSON 格式返回，字段含义见下方说明。
如某字段无法从文档中确认，则值设为 null。

JSON 结构：
{{
  "age": 数字（岁）,
  "gender": "男" 或 "女",
  "diagnosis": "主诊断名称（含病理类型，如有）",
  "ecog_score": 数字（0-4，无则 null）,
  "alt": "ALT 数值含单位，如 32 U/L",
  "ast": "AST 数值含单位，如 28 U/L",
  "prior_targeted_therapy": true/false/null（是否使用过同类靶向药物）,
  "autoimmune_disease": true/false/null（是否有活动性自身免疫疾病）,
  "child_pugh": "A/B/C（肝功能分级，无则 null）"
}}

## 文档内容

{req.markdown}
"""
    raw = await _llm(prompt)
    return {"patient": _parse_json(raw)}


class Criterion(BaseModel):
    id: str
    text: str
    type: str  # "inclusion" | "exclusion"


class ScreenRequest(BaseModel):
    patient: dict
    criteria: list[Criterion]


@app.post("/api/screen")
async def screen_patient(req: ScreenRequest):
    """LLM checks each criterion against the patient profile. Returns per-criterion results."""
    criteria_text = "\n".join(
        f"- [{c.type.upper()} {c.id}] {c.text}" for c in req.criteria
    )
    patient_text = json.dumps(req.patient, ensure_ascii=False, indent=2)

    prompt = f"""根据下方患者档案，逐条核查每项临床试验标准，输出 JSON 数组。

每条结果格式：
{{
  "id": "标准ID",
  "pass": true（符合）/ false（不符合）/ null（信息不足，无法判断）,
  "evidence": "从患者档案中摘录的判断依据，1-2句话"
}}

重要规则：
- 排除标准（EXCLUSION）命中（即 pass=false）表示该患者触发了排除条件
- 不得推断或假设档案中未记录的信息，信息缺失时 pass 为 null
- evidence 必须引用档案中的具体数值或描述

## 试验标准
{criteria_text}

## 患者档案（JSON）
{patient_text}

直接输出 JSON 数组，不要加其他说明。
"""
    raw = await _llm(prompt)
    checks = _parse_json(raw)
    if not isinstance(checks, list):
        checks = []

    # Derive overall status
    inclusion_ids = {c.id for c in req.criteria if c.type == "inclusion"}
    exclusion_ids = {c.id for c in req.criteria if c.type == "exclusion"}

    # pass=False on any criterion (inclusion or exclusion) means the patient fails that criterion
    has_fail = any(ck.get("pass") is False for ck in checks)
    has_uncertain = any(ck.get("pass") is None for ck in checks)

    if has_fail:
        overall = "ineligible"
    elif has_uncertain:
        overall = "potential"
    else:
        overall = "eligible"

    return {"overall": overall, "checks": checks}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8010, reload=True)
