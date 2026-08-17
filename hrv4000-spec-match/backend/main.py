# -*- coding: utf-8 -*-
"""HRV4000 需求条目匹配回填 API。标书已前置解析，本服务只做勾选抽取。"""

import asyncio
import json
import logging
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

from llm import chat
from pipeline import extract_selected

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(name)s] %(message)s")

DATA_DIR = Path(__file__).parent / "data"
ITEMS: list[dict[str, Any]] = json.loads((DATA_DIR / "items.json").read_text(encoding="utf-8"))
PDF_PATH = DATA_DIR / "hrv4000-pbts.pdf"

app = FastAPI(title="HRV4000 Spec Match Demo")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


class ExtractRequest(BaseModel):
    item_ids: list[int]


class TranslateRequest(BaseModel):
    texts: list[str]


def _pick_items(item_ids: list[int]) -> list[dict[str, Any]]:
    selected = []
    for item_id in item_ids:
        hit = next((x for x in ITEMS if x["id"] == item_id), None)
        if not hit:
            raise HTTPException(404, f"unknown item_id {item_id}")
        selected.append(hit)
    return selected


@app.get("/api/health")
async def health():
    return {"ok": True, "parsed": True}


@app.get("/api/items")
async def list_items():
    return {"items": ITEMS, "source": "交付项目需求条目管理（副本）· 需求条目 70 行"}


@app.get("/api/document")
async def document_file():
    if not PDF_PATH.exists():
        raise HTTPException(404, "PDF not found")
    return FileResponse(PDF_PATH, media_type="application/pdf", filename="hrv4000-pbts.pdf")


@app.post("/api/extract")
async def extract_items(body: ExtractRequest):
    """SSE：边跑边推过程日志，最后一条 type=done 带 results。"""
    if not body.item_ids:
        raise HTTPException(400, "item_ids 不能为空")
    selected = _pick_items(body.item_ids)

    async def events():
        queue: asyncio.Queue[dict[str, Any] | None] = asyncio.Queue()

        async def emit(message: str) -> None:
            await queue.put({"type": "log", "message": message})

        async def run() -> None:
            try:
                result = await extract_selected(selected, emit=emit)
                await queue.put({"type": "done", "results": result["results"]})
            except Exception as exc:
                await queue.put({"type": "error", "message": str(exc)})
            finally:
                await queue.put(None)

        task = asyncio.create_task(run())
        try:
            while True:
                item = await queue.get()
                if item is None:
                    break
                yield f"data: {json.dumps(item, ensure_ascii=False)}\n\n"
        finally:
            await task

    return StreamingResponse(
        events(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.post("/api/translate")
async def translate(body: TranslateRequest):
    try:
        translations = []
        for text in body.texts:
            target = await chat(
                f"将下面文本译成英文。数字、单位、标准号保持原样。只输出译文。\n\n{text}",
                context="你是技术规格书翻译助手。",
            )
            translations.append({"source": text, "target": target.strip()})
        return {"translations": translations}
    except RuntimeError as exc:
        raise HTTPException(502, str(exc)) from exc
