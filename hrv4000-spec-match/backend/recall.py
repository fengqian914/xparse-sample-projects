# -*- coding: utf-8 -*-
"""Aidocs chunk 召回：按英译字段检索已解析标书。"""

from __future__ import annotations

import asyncio
import logging
import os
from typing import Any

import httpx

logger = logging.getLogger("hrv.recall")

RECALL_URL = os.getenv("RECALL_URL", "http://insight.wps.cn/v7/aidocs/recall/chunk")
RECALL_FILE_ID = os.getenv("RECALL_FILE_ID", "552055768046")
RECALL_VERSION = int(os.getenv("RECALL_VERSION", "1"))
RECALL_TOP_K = int(os.getenv("RECALL_TOP_K", "3"))
RECALL_APP_ID = os.getenv("RECALL_APP_ID", "contract_data")
RECALL_WIKI_BRANCH = os.getenv("RECALL_WIKI_BRANCH", "func")
WPS_SID = os.getenv("WPS_SID", "")
RECALL_MIN_SCORE = float(os.getenv("RECALL_MIN_SCORE", "0.4"))


def _as_list(value: Any) -> list[Any]:
    if value is None:
        return []
    return value if isinstance(value, list) else [value]


def _first_str(obj: dict[str, Any], keys: tuple[str, ...]) -> str:
    for key in keys:
        val = obj.get(key)
        if isinstance(val, str) and val.strip():
            return val.strip()
    return ""


def _chunk_text(chunk: dict[str, Any]) -> str:
    return _first_str(chunk, ("content", "text", "chunk", "md", "markdown", "origin_text"))


def _chunk_title(chunk: dict[str, Any]) -> str:
    return _first_str(chunk, ("title_path", "title", "heading", "section", "chapter", "path"))


def _int_page(value: Any) -> int | None:
    if isinstance(value, (list, tuple)):
        value = value[0] if value else None
    try:
        page = int(value)
    except (TypeError, ValueError):
        return None
    return page if page > 0 else None


def _chunk_page(chunk: dict[str, Any]) -> int | None:
    """只信召回 page_num，例如 [642]。"""
    page = _int_page(chunk.get("page_num"))
    if page:
        return page
    meta = chunk.get("meta") or chunk.get("metadata")
    if isinstance(meta, dict):
        return _int_page(meta.get("page_num"))
    return None


def _chunk_score(chunk: dict[str, Any]) -> float | None:
    val = chunk.get("score")
    if val is None:
        return None
    try:
        return float(val)
    except (TypeError, ValueError):
        return None


def _field_groups(payload: Any) -> list[dict[str, Any]]:
    if isinstance(payload, list):
        return [x for x in payload if isinstance(x, dict)]
    if not isinstance(payload, dict):
        return []
    data = payload.get("data", payload.get("result", payload))
    if isinstance(data, list):
        return [x for x in data if isinstance(x, dict)]
    if not isinstance(data, dict):
        return []
    for key in ("fields", "list", "items", "results", "chunks_by_field"):
        if key in data:
            return [x for x in _as_list(data[key]) if isinstance(x, dict)]
    return [data] if "chunks" in data and "name" in data else []


def _chunks_of(group: dict[str, Any]) -> list[dict[str, Any]]:
    for key in ("chunks", "chunk_list", "recalls", "items", "docs"):
        raw = group.get(key)
        if isinstance(raw, list):
            return [x for x in raw if isinstance(x, dict)]
    return [group] if _chunk_text(group) else []


def serialize_chunks(chunks: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """压成 title / page(page_num) / score / content；丢掉低于阈值的 chunk。"""
    out = []
    for chunk in chunks:
        text = _chunk_text(chunk)
        if not text:
            continue
        score = _chunk_score(chunk)
        if score is not None and score < RECALL_MIN_SCORE:
            continue
        out.append(
            {
                "title": _chunk_title(chunk),
                "page": _chunk_page(chunk),
                "score": score,
                "content": text,
            }
        )
    return out


def _is_flat_chunk(obj: dict[str, Any]) -> bool:
    return bool(_chunk_text(obj)) and not obj.get("chunks") and not obj.get("chunk_list")


def parse_recall_groups(payload: Any, field_names: list[str] | None = None) -> dict[str, list[dict[str, Any]]]:
    """兼容两种返回：data 为扁平 chunk 列表，或按 name 分组。"""
    data = payload.get("data", payload.get("result", payload)) if isinstance(payload, dict) else payload
    if isinstance(data, list) and data and all(isinstance(x, dict) and _is_flat_chunk(x) for x in data):
        names = [n for n in (field_names or []) if n]
        if len(names) == 1:
            return {names[0]: data}
        return {"_": data}

    out: dict[str, list[dict[str, Any]]] = {}
    for group in _field_groups(payload):
        name = str(group.get("name") or group.get("field") or group.get("key") or "")
        if name:
            out[name] = _chunks_of(group)
    return out


async def recall_chunks(fields: list[dict[str, str]]) -> dict[str, Any]:
    if not WPS_SID:
        raise RuntimeError("未配置 WPS_SID，无法调用召回接口")
    headers = {
        "wiki-branch": RECALL_WIKI_BRANCH,
        "x-app-id": RECALL_APP_ID,
        "Cookie": f"wps_sid={WPS_SID}",
        "Content-Type": "application/json",
    }
    body = {
        "file_id": RECALL_FILE_ID,
        "version": RECALL_VERSION,
        "fields": fields,
        "top_k": RECALL_TOP_K,
    }
    logger.info("召回 file_id=%s fields=%s top_k=%s", RECALL_FILE_ID, len(fields), RECALL_TOP_K)
    async with httpx.AsyncClient(timeout=120.0) as client:
        resp = await client.post(RECALL_URL, headers=headers, json=body)
    logger.info("召回返回 HTTP %s", resp.status_code)
    if resp.status_code >= 400:
        raise RuntimeError(f"召回接口 HTTP {resp.status_code}: {resp.text[:500]}")
    try:
        payload = resp.json()
    except ValueError as exc:
        raise RuntimeError(f"召回接口返回非 JSON: {resp.text[:300]}") from exc
    if isinstance(payload, dict) and payload.get("code") not in (0, "0", None):
        raise RuntimeError(f"召回接口业务失败: {payload.get('msg') or payload.get('code')}")
    return payload


async def recall_by_fields(fields: list[dict[str, str]]) -> dict[str, list[dict[str, Any]]]:
    """每个 field 单独请求，并发召回。"""

    async def one(field: dict[str, str]) -> tuple[str, list[dict[str, Any]]]:
        name = field["name"]
        payload = await recall_chunks([{"name": name, "desc": field.get("desc") or ""}])
        parsed = parse_recall_groups(payload, [name])
        chunks = parsed.get(name) or parsed.get("_") or []
        logger.info("字段 %s 解析到 %s 个 chunk", name, len(chunks))
        return name, chunks

    if not fields:
        return {}
    pairs = await asyncio.gather(*[one(field) for field in fields])
    return dict(pairs)
