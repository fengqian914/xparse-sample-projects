# -*- coding: utf-8 -*-
"""
Resume Extract - FastAPI Backend
Handles document parsing (TextIn official API) and LLM extraction (OpenAI-compatible).
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

app = FastAPI(title="Resume Extract API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

TEXTIN_APP_ID = os.getenv("TEXTIN_APP_ID", "")
TEXTIN_SECRET_CODE = os.getenv("TEXTIN_SECRET_CODE", "")

# ── LLM: OpenAI-compatible (fallback) ─────────────────────────────────────────
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
OPENAI_BASE_URL = os.getenv("OPENAI_BASE_URL", "https://dashscope.aliyuncs.com/compatible-mode/v1")
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "qwen-plus")

# ── LLM: AI Gateway (preferred when AI_GATEWAY_URL is set) ────────────────────
AI_GATEWAY_URL = os.getenv("AI_GATEWAY_URL", "")
AI_GATEWAY_TOKEN = os.getenv("AI_GATEWAY_TOKEN", "")
AI_GATEWAY_UID = os.getenv("AI_GATEWAY_UID", "")
AI_GATEWAY_PRODUCT = os.getenv("AI_GATEWAY_PRODUCT", "")
AI_GATEWAY_INTENTION = os.getenv("AI_GATEWAY_INTENTION", "")
AI_GATEWAY_PROVIDER = os.getenv("AI_GATEWAY_PROVIDER", "ali")
AI_GATEWAY_MODEL = os.getenv("AI_GATEWAY_MODEL", "qwen-plus")
AI_GATEWAY_MAX_TOKENS = int(os.getenv("AI_GATEWAY_MAX_TOKENS", "8192"))

TEXTIN_API_URL = "https://api.textin.com/ai/service/v1/pdf_to_markdown"
TEXTIN_PARAMS = {
    "parse_mode": "auto",
    "page_count": 200,
    "dpi": 144,
    "table_flavor": "html",
    "apply_document_tree": 1,
    "markdown_details": 1,
    "page_details": 1,
    "get_image": "both",
    "image_output_type": "default",
    "crop_dewarp": 1,
    "apply_image_analysis": 1,
}


@app.post("/api/parse")
async def parse_document(file: UploadFile = File(...)):
    """Parse a resume file using TextIn official API. Returns markdown + pages."""
    if not TEXTIN_APP_ID or not TEXTIN_SECRET_CODE:
        raise HTTPException(
            status_code=500,
            detail="TEXTIN_APP_ID and TEXTIN_SECRET_CODE are not configured. Check your .env file.",
        )

    content = await file.read()
    headers = {
        "x-ti-app-id": TEXTIN_APP_ID,
        "x-ti-secret-code": TEXTIN_SECRET_CODE,
        "Content-Type": "application/octet-stream",
    }

    async with httpx.AsyncClient(timeout=120.0) as client:
        resp = await client.post(
            TEXTIN_API_URL,
            headers=headers,
            params=TEXTIN_PARAMS,
            content=content,
        )

    if not resp.is_success:
        raise HTTPException(
            status_code=resp.status_code,
            detail=f"TextIn API error: {resp.text[:500]}",
        )

    data = resp.json()
    if data.get("code") != 200:
        raise HTTPException(
            status_code=502,
            detail=f"TextIn returned error: {data.get('message', 'unknown')}",
        )

    result = data.get("result", {})
    return {
        "markdown": result.get("markdown", ""),
        "pages": result.get("pages", []),
    }


def _parse_json_from_text(text: str) -> Any:
    text = text.strip()
    text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.MULTILINE)
    text = re.sub(r"\s*```\s*$", "", text, flags=re.MULTILINE)
    text = text.strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        match = re.search(r"\{[\s\S]*\}", text)
        if match:
            try:
                return json.loads(match.group())
            except json.JSONDecodeError:
                pass
    return {}


class ExtractRequest(BaseModel):
    prompt: str
    model: Optional[str] = None
    markdown: Optional[str] = None


async def _call_ai_gateway(user_message: str, model: Optional[str]) -> str:
    """Call the internal AI Gateway. Returns the raw assistant text."""
    if not AI_GATEWAY_TOKEN:
        raise HTTPException(
            status_code=500,
            detail="AI_GATEWAY_TOKEN is not configured. Check your .env file.",
        )

    payload = {
        "model": model or AI_GATEWAY_MODEL,
        "provider": AI_GATEWAY_PROVIDER,
        "version": "",
        "context": "",
        "examples": [],
        "messages": [{"role": "user", "content": user_message, "name": ""}],
        "stream": False,
        "base_llm_arguments": {
            "max_tokens": AI_GATEWAY_MAX_TOKENS,
            "top_p": 0.8,
            "top_k": 50,
            "temperature": 0.1,
        },
    }
    headers = {
        "Authorization": f"Bearer {AI_GATEWAY_TOKEN}",
        "AI-Gateway-Uid": AI_GATEWAY_UID,
        "AI-Gateway-Product-Name": AI_GATEWAY_PRODUCT,
        "AI-Gateway-Intention-Code": AI_GATEWAY_INTENTION,
        "Content-Type": "application/json",
    }

    async with httpx.AsyncClient(timeout=300.0) as client:
        resp = await client.post(AI_GATEWAY_URL, headers=headers, json=payload)

    if not resp.is_success:
        raise HTTPException(
            status_code=resp.status_code,
            detail=f"AI Gateway error: {resp.text[:500]}",
        )

    data = resp.json()
    if data.get("code") and data["code"] != "Success":
        raise HTTPException(
            status_code=502,
            detail=f"AI Gateway returned error: {data.get('message', 'unknown')}",
        )
    try:
        return data["choices"][0]["text"]
    except (KeyError, IndexError, TypeError) as e:
        raise HTTPException(
            status_code=502,
            detail=f"Unexpected AI Gateway response shape: {e}",
        )


async def _call_openai_compatible(user_message: str, model: Optional[str]) -> str:
    """Call an OpenAI-compatible /chat/completions endpoint. Returns the raw assistant text."""
    if not OPENAI_API_KEY:
        raise HTTPException(
            status_code=500,
            detail="OPENAI_API_KEY is not configured. Check your .env file.",
        )

    headers = {
        "Authorization": f"Bearer {OPENAI_API_KEY}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": model or OPENAI_MODEL,
        "messages": [{"role": "user", "content": user_message}],
        "temperature": 0.1,
    }

    base_url = OPENAI_BASE_URL.rstrip("/")
    async with httpx.AsyncClient(timeout=300.0) as client:
        resp = await client.post(
            f"{base_url}/chat/completions",
            headers=headers,
            json=payload,
        )

    if not resp.is_success:
        raise HTTPException(
            status_code=resp.status_code,
            detail=f"LLM API error: {resp.text[:500]}",
        )

    data = resp.json()
    return data["choices"][0]["message"]["content"]


@app.post("/api/extract")
async def extract(req: ExtractRequest):
    """Route resume extraction to AI Gateway (if configured) or OpenAI-compatible fallback."""
    user_message = f"{req.prompt}\n\n## 文档内容\n\n{req.markdown or ''}"

    if AI_GATEWAY_URL:
        content = await _call_ai_gateway(user_message, req.model)
    else:
        content = await _call_openai_compatible(user_message, req.model)

    llm_json = _parse_json_from_text(content)
    return {"code": 200, "result": {"llm_json": llm_json, "raw_json": {}}}


@app.get("/api/image")
async def get_page_image(image_id: str):
    """Proxy TextIn page image download with auth headers."""
    if not TEXTIN_APP_ID or not TEXTIN_SECRET_CODE:
        raise HTTPException(status_code=500, detail="TextIn credentials not configured.")
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.get(
            "https://api.textin.com/ocr_image/download",
            headers={"x-ti-app-id": TEXTIN_APP_ID, "x-ti-secret-code": TEXTIN_SECRET_CODE},
            params={"image_id": image_id},
        )
    if not resp.is_success:
        raise HTTPException(
            status_code=resp.status_code,
            detail=f"Image download failed: {resp.text[:200]}",
        )
    return resp.json()


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8005, reload=True)
