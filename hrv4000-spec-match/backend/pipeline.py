# -*- coding: utf-8 -*-
"""抽取主链路：翻译 query → 并行召回 → 按行并行回填。"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Awaitable, Callable
from typing import Any

from llm import empty_extract, extract_one_job, translate_items
from recall import RECALL_MIN_SCORE, recall_by_fields, serialize_chunks

logger = logging.getLogger("hrv.extract")

Emit = Callable[[str], Awaitable[None]]
OnRow = Callable[[dict[str, Any]], Awaitable[None]]


def item_desc(item: dict[str, Any]) -> str:
    return "；".join(p for p in (item.get("explain") or "", item.get("example") or "") if p)


def _recall_fields(translated: list[dict[str, str]]) -> list[dict[str, str]]:
    fields: list[dict[str, str]] = []
    used: set[str] = set()
    for row in translated:
        name = row["name_en"] or f"item-{row['id']}"
        if name in used:
            name = f"{name} (#{row['id']})"
            row["name_en"] = name
        used.add(name)
        fields.append({"name": name, "desc": row["desc_en"]})
    return fields


def _raw_chunks(name_en: str, grouped: dict[str, list]) -> list:
    return grouped.get(name_en) or []


async def extract_selected(
    items: list[dict[str, Any]],
    emit: Emit | None = None,
    on_row: OnRow | None = None,
) -> dict[str, Any]:
    async def log(message: str) -> None:
        logger.info(message)
        if emit:
            await emit(message)

    async def push_row(result: dict[str, Any]) -> None:
        if on_row:
            await on_row(result)

    names = "、".join(f"{it.get('seq')}.{it.get('item')}" for it in items)
    await log(f"开始抽取 {len(items)} 条：{names}")

    await log("步骤 1/3 翻译 query（需求条目 + 解释/示例 → 英文）")
    translated = await translate_items(items)
    for row, item in zip(translated, items):
        await log(
            f"  译完 #{item.get('seq')} {item.get('item')} → name: {row['name_en']} | desc: {row['desc_en'][:80]}"
        )

    fields = _recall_fields(translated)
    await log(f"步骤 2/3 并行召回 {len(fields)} 个字段")
    grouped = await recall_by_fields(fields)
    await log(f"  召回解析完成，{sum(1 for v in grouped.values() if v)} 条有 chunk")

    empty_rows = [row for row in translated if not serialize_chunks(_raw_chunks(row["name_en"], grouped))]
    if empty_rows:
        await log(f"  {len(empty_rows)} 条 chunk 为 0，desc 置空并行再召一次")
        retry_grouped = await recall_by_fields(
            [{"name": row["name_en"], "desc": ""} for row in empty_rows]
        )
        for row in empty_rows:
            retry_chunks = _raw_chunks(row["name_en"], retry_grouped)
            if retry_chunks:
                grouped[row["name_en"]] = retry_chunks
                await log(f"  重试命中 #{row['id']} {row['name_en']} → {len(serialize_chunks(retry_chunks))} 个 chunk")
            else:
                await log(f"  重试仍为 0 #{row['id']} {row['name_en']}")

    jobs = []
    results_by_id: dict[int, dict[str, Any]] = {}
    for item, row in zip(items, translated):
        chunks = serialize_chunks(_raw_chunks(row["name_en"], grouped))
        pages = [str(c.get("page")) for c in chunks if c.get("page")]
        scores = [f"{c.get('score'):.3f}" for c in chunks if c.get("score") is not None]
        await log(
            f"  #{item.get('seq')} {row['name_en']} 有效 chunk {len(chunks)}"
            + (f"，页码 {', '.join(pages)}" if pages else "")
            + (f"，score {', '.join(scores)}" if scores else "")
        )
        if not chunks:
            await log(f"  #{item.get('seq')} 无 chunk 或均低于 {RECALL_MIN_SCORE}，直接未匹配")
            empty = empty_extract(item["id"])
            results_by_id[item["id"]] = empty
            await push_row(empty)
            continue
        jobs.append(
            {
                "id": item["id"],
                "seq": item.get("seq"),
                "name": item.get("item") or "",
                "desc": item_desc(item),
                "name_en": row["name_en"],
                "desc_en": row["desc_en"],
                "chunks": chunks,
            }
        )

    await log(f"步骤 3/3 并行回填 {len(jobs)} 条，先完成的先上表")

    async def fill_one(job: dict[str, Any]) -> dict[str, Any]:
        result = await extract_one_job(job)
        await log(
            f"  #{job.get('seq')} {result.get('matchStatus')} "
            f"章节={result.get('srcChapter') or '空'} 页码={result.get('page') or '空'}"
        )
        await push_row(result)
        return result

    if jobs:
        filled = await asyncio.gather(*[fill_one(job) for job in jobs])
        for row in filled:
            results_by_id[row["id"]] = row

    results = [results_by_id.get(item["id"], empty_extract(item["id"])) for item in items]
    await log("抽取完成")
    return {"results": results, "translated": translated}
