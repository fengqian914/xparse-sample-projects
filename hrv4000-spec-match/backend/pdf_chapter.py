# -*- coding: utf-8 -*-
"""从源文件页眉 / 小节号取章节，不靠模型猜。"""

from __future__ import annotations

import logging
import re
from pathlib import Path

from pypdf import PdfReader

logger = logging.getLogger("hrv.pdf")

PDF_PATH = Path(__file__).resolve().parent / "data" / "hrv4000-pbts.pdf"

TS_LINE = re.compile(r"^(TS[-\s]*\d+)\s*:\s*(.+)$", re.I)
PAGE_TAIL = re.compile(r"\s+PAGE\s+[\d\-]+\s*$", re.I)
SEC_LINE = re.compile(r"^(\d{2}\.\d{2}(?:\.\d{2})?)\s+([A-Z][A-Z0-9 /,&()'\-]{2,90})$")
TS_CODE = re.compile(r"TS-(\d+)", re.I)

TS_ZH = {
    "01": "总则",
    "02": "车辆设计要求",
    "03": "车体",
    "04": "车钩与缓冲装置",
    "05": "司机室设备",
    "06": "客室车门与控制",
    "07": "采暖通风与空调",
    "08": "照明",
    "09": "辅助电源设备",
    "10": "牵引与电阻制动",
    "11": "转向架",
    "12": "摩擦制动与气动系统",
    "13": "通信与乘客信息系统",
    "14": "内装与外装",
    "15": "列车自动控制与列车保护",
    "16": "事件记录器",
    "17": "监测与诊断系统",
    "18": "列车线与网络",
    "19": "软件系统",
    "20": "材料与工艺",
    "21": "质量保证与质量控制",
    "22": "验证与试验",
    "23": "管理与计划控制",
    "24": "系统保证",
    "25": "安全、安防与法规要求",
}

_index: list[dict[str, str | list[str]]] | None = None


def _norm_ts_code(raw: str) -> str:
    digits = re.sub(r"\D", "", raw)
    return f"TS-{int(digits):02d}" if digits else raw.strip().upper()


def _clean_ts_title(title: str) -> str:
    title = PAGE_TAIL.sub("", title).strip(" :")
    title = re.sub(r"\s+", " ", title)
    return title


def _load_index() -> list[dict[str, str | list[str]]]:
    global _index
    if _index is not None:
        return _index
    if not PDF_PATH.exists():
        logger.warning("源文件不存在，无法按页取章节: %s", PDF_PATH)
        _index = []
        return _index

    reader = PdfReader(str(PDF_PATH))
    best_ts: dict[str, str] = {}
    pages: list[dict[str, str | list[str]]] = []
    start_sec = ""
    for page in reader.pages:
        ts_code = ""
        ts_title = ""
        sections: list[str] = []
        for raw in (page.extract_text() or "").splitlines():
            line = raw.strip()
            hit = TS_LINE.match(line)
            if hit and "TABLE OF CONTENTS" not in line.upper():
                ts_code = _norm_ts_code(hit.group(1))
                ts_title = _clean_ts_title(hit.group(2))
                if ts_title and len(ts_title) > len(best_ts.get(ts_code, "")):
                    best_ts[ts_code] = ts_title
            hit = SEC_LINE.match(line)
            if hit:
                name = re.sub(r"\s+", " ", hit.group(2)).strip()
                sections.append(f"{hit.group(1)} {name}")
        pages.append({"ts": ts_code, "start": start_sec, "sections": sections})
        if sections:
            start_sec = sections[-1]

    for row in pages:
        code = str(row["ts"] or "")
        if code and best_ts.get(code):
            row["ts"] = f"{code}: {best_ts[code]}"
    _index = pages
    logger.info("已索引源文件章节 %s 页", len(_index))
    return _index


def chapter_at(file_page: int, quote: str = "", chunk_text: str = "") -> str:
    """file_page 为 react-pdf 页（召回页 +1）。优先摘录里出现的小节，否则用该页开头沿用的小节。"""
    pages = _load_index()
    if not file_page or file_page < 1 or file_page > len(pages):
        return ""
    row = pages[file_page - 1]
    ts = str(row.get("ts") or "")
    start = str(row.get("start") or "")
    sections = [str(s) for s in (row.get("sections") or [])]
    blob = f"{quote}\n{chunk_text}".upper()
    picked = ""
    for sec in sections:
        num = sec.split()[0]
        if num and num in blob:
            picked = sec
            break
    if not picked:
        picked = start
    if ts and picked:
        return f"{ts}\n{picked}"
    return ts or picked


def zh_chapter(src_chapter: str) -> str:
    if not src_chapter:
        return ""
    lines = [ln.strip() for ln in src_chapter.splitlines() if ln.strip()]
    out: list[str] = []
    for line in lines:
        hit = TS_CODE.search(line)
        if hit and line.upper().startswith("TS-"):
            name = TS_ZH.get(f"{int(hit.group(1)):02d}", "")
            code = _norm_ts_code(hit.group(0))
            out.append(f"{code}：{name}" if name else line)
        else:
            out.append(line)
    return "\n".join(out)
