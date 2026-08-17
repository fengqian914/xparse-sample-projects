# -*- coding: utf-8 -*-
"""AI Gateway：翻译 query、从召回 chunk 回填表格。"""

from __future__ import annotations

import json
import logging
import os
import re
from typing import Any

import httpx

logger = logging.getLogger("hrv.llm")

AI_GATEWAY_URL = os.getenv("AI_GATEWAY_URL", "http://ai-gateway.wps.cn/api/v2/llm/chat")
AI_GATEWAY_TOKEN = os.getenv("AI_GATEWAY_TOKEN", "")
AI_GATEWAY_UID = os.getenv("AI_GATEWAY_UID", "9052")
AI_GATEWAY_PRODUCT = os.getenv("AI_GATEWAY_PRODUCT", "saas_knowledgebase_web")
AI_GATEWAY_INTENTION = os.getenv("AI_GATEWAY_INTENTION", "dc_saas_knowledgebase_extract")
AI_GATEWAY_PROVIDER = os.getenv("AI_GATEWAY_PROVIDER", "ali")
AI_GATEWAY_MODEL = os.getenv("AI_GATEWAY_MODEL", "qwen3-max-2026-01-23")
AI_GATEWAY_MAX_TOKENS = int(os.getenv("AI_GATEWAY_MAX_TOKENS", "4096"))

TRANSLATE_CONTEXT = (
    "你是轨道交通技术规格书翻译助手。把中文需求条目译成英文，供在英文标书中做语义检索。"
    "数字、单位、标准号（如 IEC 61373、IP65、EN 50121、DC750V）必须原样保留。"
    "只输出 JSON，不要解释。"
)

EXTRACT_CONTEXT = (
    "你是洛杉矶 HRV 4000 技术规格书解读助手，只根据召回的英文标书 chunk 做需求条目回填。"
    "禁止编造章节号、页码和原文。数字、单位、标准号必须与 chunk 原文完全一致。"
    "只输出 JSON，不要解释。"
)

EXTRACT_PROMPT = """根据召回 chunk，为每条基准需求判定匹配并回填表格字段。

判定：
- matched：chunk 能回答该条目问法，关键数字/标准号能在原文中找到
- partial：有相关章节但只覆盖一半问法，或缺少关键限值/标准号
- unmatched：标书未写该基准项

回填规则：
- srcChapter：客户原始章节编号与名称（英文）。从 chunk 的 title 或正文标题摘取，编号不改。多出处用换行并列，不要合成一句
- srcDesc：客户原始描述。摘录能支撑该条目的英文原句，可并列多出处，不要改写成作文；数字/标准号不改
- zhChapter：srcChapter 的中文翻译，章节编号保持英文/数字原样
- zhDesc：srcDesc 的中文翻译，数字/标准号不改
- page：必须填写最相关出处的页码（整数）。优先用 chunk.page；若为 null，从正文页脚/页眉提取，如 PAGE 22-26 取 26，p.4 取 4。matched/partial 时尽量给出页码，不要留空
- unmatched 时 srcChapter、srcDesc、zhChapter、zhDesc 必须为空字符串，page 必须为 null，禁止编造

输出 JSON 数组，每项字段：id, matchStatus, srcChapter, srcDesc, zhChapter, zhDesc, page

输入如下：
"""


def _assistant_text(data: dict[str, Any]) -> str:
    if data.get("code") and str(data["code"]) not in ("0", "Success", "success"):
        raise RuntimeError(f"AI Gateway 返回错误: {data.get('message') or data.get('msg') or data}")
    choices = data.get("choices")
    if isinstance(choices, list) and choices:
        first = choices[0] if isinstance(choices[0], dict) else {}
        if isinstance(first.get("text"), str) and first["text"].strip():
            return first["text"]
        message = first.get("message")
        if isinstance(message, dict) and isinstance(message.get("content"), str):
            return message["content"]
    for key in ("text", "content", "result", "data"):
        val = data.get(key)
        if isinstance(val, str) and val.strip():
            return val
    raise RuntimeError("AI Gateway 响应无法解析文本")


def _parse_json_array(text: str) -> list[Any]:
    stripped = text.strip()
    fenced = re.search(r"```(?:json)?\s*([\s\S]*?)```", stripped)
    if fenced:
        stripped = fenced.group(1).strip()
    start, end = stripped.find("["), stripped.rfind("]")
    if start >= 0 and end > start:
        stripped = stripped[start : end + 1]
    data = json.loads(stripped)
    if not isinstance(data, list):
        raise RuntimeError("模型结果不是 JSON 数组")
    return data


def _as_int(value: Any) -> int | None:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


async def chat(user_message: str, context: str = "") -> str:
    if not AI_GATEWAY_TOKEN:
        raise RuntimeError("未配置 AI_GATEWAY_TOKEN")
    payload = {
        "model": AI_GATEWAY_MODEL,
        "provider": AI_GATEWAY_PROVIDER,
        "version": "",
        "context": context,
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
    logger.info("调用 AI Gateway model=%s，输入 %s 字", AI_GATEWAY_MODEL, len(user_message))
    async with httpx.AsyncClient(timeout=180.0) as client:
        resp = await client.post(AI_GATEWAY_URL, headers=headers, json=payload)
    logger.info("AI Gateway 返回 HTTP %s", resp.status_code)
    if resp.status_code >= 400:
        raise RuntimeError(f"AI Gateway HTTP {resp.status_code}: {resp.text[:500]}")
    try:
        return _assistant_text(resp.json())
    except ValueError as exc:
        raise RuntimeError(f"AI Gateway 返回非 JSON: {resp.text[:300]}") from exc


async def translate_items(items: list[dict[str, Any]]) -> list[dict[str, str]]:
    """把勾选行的 name/desc 译成英文，供召回使用。"""
    payload = [
        {
            "id": it["id"],
            "name": it.get("item") or "",
            "desc": "；".join(p for p in (it.get("explain") or "", it.get("example") or "") if p),
        }
        for it in items
    ]
    raw = await chat(
        "将下列需求条目的 name、desc 译成英文。保持 id 不变。"
        "输出数组，每项字段：id, name_en, desc_en。\n\n"
        + json.dumps(payload, ensure_ascii=False),
        context=TRANSLATE_CONTEXT,
    )
    by_id: dict[int, dict[str, str]] = {}
    for row in _parse_json_array(raw):
        if not isinstance(row, dict):
            continue
        rid = _as_int(row.get("id"))
        if rid is None:
            continue
        by_id[rid] = {
            "name_en": str(row.get("name_en") or "").strip(),
            "desc_en": str(row.get("desc_en") or "").strip(),
        }
    results = []
    for item, src in zip(items, payload):
        hit = by_id.get(item["id"], {})
        results.append(
            {
                "id": item["id"],
                "name_en": hit.get("name_en") or src["name"],
                "desc_en": hit.get("desc_en") or src["desc"],
            }
        )
    return results


def _empty_extract(item_id: int) -> dict[str, Any]:
    return {
        "id": item_id,
        "matchStatus": "unmatched",
        "srcChapter": "",
        "srcDesc": "",
        "zhChapter": "",
        "zhDesc": "",
        "page": None,
    }


async def extract_from_chunks(jobs: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """根据召回 chunk 回填绿色列。jobs 含 id/name/desc/name_en/desc_en/chunks。"""
    payload = [
        {
            "id": job["id"],
            "name": job.get("name") or "",
            "desc": job.get("desc") or "",
            "name_en": job.get("name_en") or "",
            "desc_en": job.get("desc_en") or "",
            "chunks": job.get("chunks") or [],
        }
        for job in jobs
    ]
    raw = await chat(EXTRACT_PROMPT + json.dumps(payload, ensure_ascii=False), context=EXTRACT_CONTEXT)
    by_id: dict[int, dict[str, Any]] = {}
    for row in _parse_json_array(raw):
        if not isinstance(row, dict):
            continue
        rid = _as_int(row.get("id"))
        if rid is None:
            continue
        status = str(row.get("matchStatus") or row.get("match_status") or "").strip().lower()
        if status not in ("matched", "partial", "unmatched"):
            status = "unmatched"
        page = _as_int(row.get("page"))
        if page is not None and page <= 0:
            page = None
        result = {
            "id": rid,
            "matchStatus": status,
            "srcChapter": str(row.get("srcChapter") or "").strip(),
            "srcDesc": str(row.get("srcDesc") or "").strip(),
            "zhChapter": str(row.get("zhChapter") or "").strip(),
            "zhDesc": str(row.get("zhDesc") or "").strip(),
            "page": page,
        }
        by_id[rid] = _empty_extract(rid) if status == "unmatched" else result
    out = []
    for job in jobs:
        result = by_id.get(job["id"], _empty_extract(job["id"]))
        if result["matchStatus"] != "unmatched" and not result.get("page"):
            for chunk in job.get("chunks") or []:
                page = _as_int(chunk.get("page")) if isinstance(chunk, dict) else None
                if page and page > 0:
                    result["page"] = page
                    break
        out.append(result)
    return out
