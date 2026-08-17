# -*- coding: utf-8 -*-
"""AI Gateway：翻译 query、从召回 chunk 回填表格。"""

from __future__ import annotations

import json
import logging
import os
import re
from typing import Any

import httpx

from pdf_chapter import chapter_at, zh_chapter

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
- srcDesc：客户原始描述。必须从某个 chunk.content 原文摘录，不要改写、不要拼接未出现的句子；数字/标准号不改
- chunkIds：srcDesc 用到的 chunk.i，按摘录主次排列。只用了哪几条就填哪几条
- zhDesc：srcDesc 的中文翻译，数字/标准号不改
- srcChapter、zhChapter、page：不要填，服务按所用 chunk 的页从源文件页眉/小节号回填
- unmatched 时 srcDesc、zhDesc 必须为空字符串，chunkIds 必须为 []，禁止编造

输出 JSON 数组，每项字段：id, matchStatus, srcDesc, zhDesc, chunkIds

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


def empty_extract(item_id: int) -> dict[str, Any]:
    return {
        "id": item_id,
        "matchStatus": "unmatched",
        "srcChapter": "",
        "srcDesc": "",
        "zhChapter": "",
        "zhDesc": "",
        "page": None,
    }


def _chunk_page(chunk: dict[str, Any]) -> int | None:
    page = _as_int(chunk.get("page"))
    return page if page and page > 0 else None


def _norm_text(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", text.lower()).strip()


def _parse_chunk_ids(raw: Any, n: int) -> list[int]:
    if raw is None:
        return []
    values = raw if isinstance(raw, list) else [raw]
    out: list[int] = []
    for val in values:
        idx = _as_int(val)
        if idx is None or idx < 0 or idx >= n or idx in out:
            continue
        out.append(idx)
    return out


def _chunks_for_quote(chunks: list[dict[str, Any]], quote: str) -> list[dict[str, Any]]:
    """模型没回 chunkIds 时，用摘录和 chunk 正文重叠找来源。"""
    q = _norm_text(quote)
    if not q:
        return []
    scored: list[tuple[int, dict[str, Any]]] = []
    q_tokens = set(q.split())
    for chunk in chunks:
        body = _norm_text(str(chunk.get("content") or ""))
        if not body:
            continue
        if q in body or body in q:
            scored.append((10_000 + len(body), chunk))
            continue
        overlap = len(q_tokens & set(body.split()))
        if overlap >= 6:
            scored.append((overlap, chunk))
    scored.sort(key=lambda x: x[0], reverse=True)
    return [c for _, c in scored[:2]]


def _used_chunks(
    chunks: list[dict[str, Any]],
    chunk_ids: list[int],
    quote: str,
) -> list[dict[str, Any]]:
    by_i = {int(c["i"]): c for c in chunks if c.get("i") is not None}
    used = [by_i[i] for i in chunk_ids if i in by_i]
    return used or _chunks_for_quote(chunks, quote)


def _numbered_chunks(raw_chunks: list[Any]) -> list[dict[str, Any]]:
    numbered = []
    for chunk in raw_chunks:
        if not isinstance(chunk, dict):
            continue
        numbered.append(
            {
                "i": len(numbered),
                "title": chunk.get("title") or "",
                "page": chunk.get("page"),
                "score": chunk.get("score"),
                "content": chunk.get("content") or "",
            }
        )
    return numbered


async def extract_one_job(job: dict[str, Any]) -> dict[str, Any]:
    """单行回填。页码取 srcDesc 所用 chunk 的召回 page。"""
    chunks = _numbered_chunks(job.get("chunks") or [])
    payload = [
        {
            "id": job["id"],
            "name": job.get("name") or "",
            "desc": job.get("desc") or "",
            "name_en": job.get("name_en") or "",
            "desc_en": job.get("desc_en") or "",
            "chunks": chunks,
        }
    ]
    raw = await chat(EXTRACT_PROMPT + json.dumps(payload, ensure_ascii=False), context=EXTRACT_CONTEXT)
    parsed = _parse_json_array(raw)
    row = next((x for x in parsed if isinstance(x, dict) and _as_int(x.get("id")) == job["id"]), None)
    if not row and parsed and isinstance(parsed[0], dict):
        row = parsed[0]
    if not row:
        return empty_extract(job["id"])
    status = str(row.get("matchStatus") or row.get("match_status") or "").strip().lower()
    if status not in ("matched", "partial", "unmatched"):
        status = "unmatched"
    if status == "unmatched":
        return empty_extract(job["id"])
    src_desc = str(row.get("srcDesc") or "").strip()
    chunk_ids = _parse_chunk_ids(row.get("chunkIds") or row.get("chunk_ids"), len(chunks))
    used = _used_chunks(chunks, chunk_ids, src_desc)
    recall_page = next((p for c in used if (p := _chunk_page(c))), None)
    file_page = recall_page + 1 if recall_page else None
    chunk_text = "\n".join(str(c.get("content") or "") for c in used)
    src_chapter = chapter_at(file_page or 0, src_desc, chunk_text) if file_page else ""
    return {
        "id": job["id"],
        "matchStatus": status,
        "srcChapter": src_chapter,
        "srcDesc": src_desc,
        "zhChapter": zh_chapter(src_chapter),
        "zhDesc": str(row.get("zhDesc") or "").strip(),
        "page": file_page,
    }
