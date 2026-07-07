# -*- coding: utf-8 -*-
"""
临床受试者智能筛选系统 - FastAPI 后端

四步漏斗：
  ① 接数据    GET  /api/patients   —— 20 个 mock 病患的原始病历（病患库）
  ② 建画像    POST /api/interpret  —— LLM 病历解读，抽取结构化「病人画像」
  ③ AI 筛查   POST /api/prescreen  —— 规则对硬指标做「浅判断」快速初筛
              POST /api/match      —— LLM 逐条精细匹配 + 匹配度评分 + 原文依据 + 缺失项
  （保留）    POST /api/parse      —— TextIn OCR，供「外院上传拍照件」入口

病人本体 Ontology（全局 1 份）在 backend 定义为 profile 的结构；
病人画像 Profile（每人 1 份）由 /api/interpret 从病历文本填充。
"""

import asyncio
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

app = FastAPI(title="Clinical Trial Intelligent Screening API")

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

# 并发上限，避免 20 个病患同时打爆 LLM 速率限制
LLM_CONCURRENCY = int(os.getenv("LLM_CONCURRENCY", "5"))

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


# ══════════════════════════════════════════════════════════════════════════════
# ① 接数据 —— 病患库（20 个 mock 病患的原始病历文本）
# ══════════════════════════════════════════════════════════════════════════════
# 数据源模拟 HIS/EMR 门诊小结。刻意包含「正话反说」「信息缺失」等抽取挑战。

MOCK_PATIENTS = [
    {
        "id": "PT-1001", "name": "张某", "age": 68, "gender": "男", "dept": "肿瘤内科",
        "record": (
            "门诊小结：右肺腺癌 IV 期。2022 年确诊，EGFR 基因检测提示 19 号外显子缺失突变（19del）阳性。"
            "一线口服吉非替尼（易瑞沙）250mg qd 治疗约 2 年，近期复查提示病情进展。"
            "ECOG 体力状态 1 分。肝功能：ALT 30 U/L，AST 26 U/L。未行头颅 MRI，脑部情况不详。"
        ),
    },
    {
        "id": "PT-1002", "name": "李某", "age": 55, "gender": "女", "dept": "肿瘤内科",
        "record": (
            "左肺腺癌，病理确诊。基因：EGFR 21 外显子 L858R 突变阳性。既往一线厄洛替尼治疗后疾病进展。"
            "头颅增强 MRI 未见明确转移灶。ECOG 1 分。肝功能正常（ALT 22 U/L，AST 19 U/L）。"
            "既往体健，否认自身免疫性疾病史。"
        ),
    },
    {
        "id": "PT-1003", "name": "王某", "age": 72, "gender": "男", "dept": "呼吸与危重症",
        "record": (
            "肺腺癌（右下肺），EGFR 19del 阳性。一线服用吉非替尼后出现影像学进展。头颅 CT 平扫未见转移。"
            "ECOG 2 分。血生化：ALT 41 U/L，AST 38 U/L。无既往靶向药三代用药史。"
        ),
    },
    {
        "id": "PT-1004", "name": "赵某", "age": 60, "gender": "男", "dept": "胸外科",
        "record": (
            "右肺鳞状细胞癌（肺鳞癌），III 期。基因检测未见 EGFR 敏感突变。既往行放化疗。"
            "ECOG 1 分。肝肾功能未见明显异常。"
        ),
    },
    {
        "id": "PT-1005", "name": "刘某", "age": 48, "gender": "女", "dept": "肿瘤内科",
        "record": (
            "肺腺癌。基因检测：EGFR 野生型（阴性），ALK 融合阳性。既往克唑替尼治疗中。"
            "ECOG 0 分。肝功能正常。头颅 MRI 未见转移。"
        ),
    },
    {
        "id": "PT-1006", "name": "陈某", "age": 79, "gender": "男", "dept": "肿瘤内科",
        "record": (
            "肺腺癌 IV 期，EGFR 19del 阳性。一线吉非替尼后进展。ECOG 1 分。肝功能正常。"
            "头颅 MRI 未见转移。患者高龄，家属陪同就诊。"
        ),
    },
    {
        "id": "PT-1007", "name": "孙某", "age": 63, "gender": "女", "dept": "肿瘤内科",
        "record": (
            "左肺腺癌，EGFR L858R 阳性。一线吉非替尼治疗后进展，后续二线口服奥希替尼（三代 EGFR-TKI）"
            "治疗约半年，目前再次评估。ECOG 1 分。肝功能正常。头颅 MRI 未见转移。"
        ),
    },
    {
        "id": "PT-1008", "name": "周某", "age": 66, "gender": "男", "dept": "肿瘤内科",
        "record": (
            "右肺腺癌，EGFR 19del 阳性，一线埃克替尼后进展。合并慢性乙型病毒性肝炎，活动期。"
            "肝功能：ALT 128 U/L，AST 96 U/L（参考上限 ALT 40 U/L）。Child-Pugh 分级 B 级。ECOG 1 分。"
            "头颅 MRI 未见转移。"
        ),
    },
    {
        "id": "PT-1009", "name": "吴某", "age": 58, "gender": "女", "dept": "肿瘤内科",
        "record": (
            "肺腺癌，EGFR 19del 阳性，一线吉非替尼后进展。既往类风湿性关节炎，目前处于活动期，"
            "长期口服免疫抑制剂。ECOG 1 分。肝功能正常。头颅 MRI 未见转移。"
        ),
    },
    {
        "id": "PT-1010", "name": "郑某", "age": 70, "gender": "男", "dept": "肿瘤内科",
        "record": (
            "肺腺癌 IV 期，EGFR 19del 阳性，一线吉非替尼后进展。头颅 MRI 提示多发脑转移，"
            "部分病灶周围水肿明显，目前正行全脑放疗，症状未完全控制。ECOG 2 分。肝功能正常。"
        ),
    },
    {
        "id": "PT-1011", "name": "冯某", "age": 52, "gender": "女", "dept": "肿瘤内科",
        "record": (
            "右肺腺癌，EGFR 21 L858R 阳性。一线吉非替尼治疗 18 个月后进展。ECOG 1 分。"
            "肝功能：ALT 28 U/L，AST 25 U/L。本次未安排头部检查。"
        ),
    },
    {
        "id": "PT-1012", "name": "蒋某", "age": 61, "gender": "男", "dept": "肿瘤内科",
        "record": (
            "肺腺癌，EGFR 19del 阳性。一线吉非替尼后疾病进展。ECOG 0 分。头颅增强 MRI 未见转移灶，"
            "全身骨扫描阴性。肝功能正常（ALT 20 U/L，AST 18 U/L）。否认自身免疫疾病。无三代靶向药使用史。"
        ),
    },
    {
        "id": "PT-1013", "name": "沈某", "age": 45, "gender": "女", "dept": "肿瘤内科",
        "record": (
            "小细胞肺癌（SCLC），广泛期。行 EP 方案化疗。ECOG 1 分。肝功能正常。"
        ),
    },
    {
        "id": "PT-1014", "name": "韩某", "age": 74, "gender": "男", "dept": "肿瘤内科",
        "record": (
            "肺腺癌，EGFR L858R 阳性，一线吉非替尼后进展。近期一般情况差，卧床为主，生活需人照顾，"
            "ECOG 3 分。肝功能正常。头颅 MRI 未见转移。"
        ),
    },
    {
        "id": "PT-1015", "name": "杨某", "age": 57, "gender": "女", "dept": "肿瘤内科",
        "record": (
            "肺腺癌。二代测序：EGFR、ALK、ROS1、KRAS 均未见明确驱动突变（阴性）。"
            "既往含铂双药化疗。ECOG 1 分。肝功能正常。"
        ),
    },
    {
        "id": "PT-1016", "name": "朱某", "age": 65, "gender": "男", "dept": "肿瘤内科",
        "record": (
            "初诊肺腺癌 IV 期，EGFR 19del 阳性。尚未开始任何抗肿瘤治疗，拟制定初始方案。"
            "ECOG 1 分。肝功能正常。头颅 MRI 未见转移。"
        ),
    },
    {
        "id": "PT-1017", "name": "秦某", "age": 69, "gender": "女", "dept": "肿瘤内科",
        "record": (
            "左肺腺癌，EGFR 19del 阳性。一线埃克替尼治疗后影像学进展。头颅 MRI 阴性，未见转移。"
            "ECOG 1 分。肝功能正常（ALT 24 U/L，AST 21 U/L）。否认自身免疫疾病史，无奥希替尼等三代药物使用史。"
        ),
    },
    {
        "id": "PT-1018", "name": "许某", "age": 62, "gender": "男", "dept": "肿瘤内科",
        "record": (
            "右肺腺癌，EGFR 19del 阳性，一线吉非替尼后进展。患者自诉无头痛头晕，否认脑转移，"
            "但本次未行头颅影像学检查。ECOG 1 分。肝功能正常。"
        ),
    },
    {
        "id": "PT-1019", "name": "何某", "age": 50, "gender": "女", "dept": "肿瘤内科",
        "record": (
            "肺腺癌，EGFR L858R 阳性，一线吉非替尼后进展。既往桥本甲状腺炎病史，目前甲功稳定、病情非活动期，"
            "仅口服左甲状腺素替代。ECOG 1 分。肝功能正常。头颅 MRI 未见转移。"
        ),
    },
    {
        "id": "PT-1020", "name": "吕某", "age": 71, "gender": "男", "dept": "肿瘤内科",
        "record": (
            "肺腺癌，EGFR 19del 阳性，一线吉非替尼后进展。头颅 CT 未见转移。ECOG 1 分。"
            "肝功能：ALT 45 U/L，AST 40 U/L（参考上限 ALT 40 U/L，AST 40 U/L）。无三代靶向药史，否认自身免疫疾病。"
        ),
    },
]


# ══════════════════════════════════════════════════════════════════════════════
# 试验标准 —— 硬指标（浅判断）+ 纳入/排除（精细匹配）
# ══════════════════════════════════════════════════════════════════════════════

HARD_INDICATORS = [
    {"id": "H1", "label": "年龄 18–75 岁"},
    {"id": "H2", "label": "病理确诊肺腺癌（NSCLC）"},
    {"id": "H3", "label": "EGFR 敏感突变阳性（19del / L858R）"},
    {"id": "H4", "label": "一线 EGFR-TKI 治疗后疾病进展"},
]


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


async def _call_ai_gateway(prompt: str) -> str:
    if not AI_GATEWAY_TOKEN:
        raise HTTPException(status_code=500, detail="AI_GATEWAY_TOKEN not configured.")
    payload = {
        "model": AI_GATEWAY_MODEL,
        "provider": AI_GATEWAY_PROVIDER,
        "version": "",
        "context": "",
        "examples": [],
        "messages": [{"role": "user", "content": prompt, "name": ""}],
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
        raise HTTPException(status_code=resp.status_code, detail=f"AI Gateway error: {resp.text[:300]}")
    data = resp.json()
    if data.get("code") and data["code"] != "Success":
        raise HTTPException(status_code=502, detail=f"AI Gateway error: {data.get('message', 'unknown')}")
    try:
        return data["choices"][0]["text"]
    except (KeyError, IndexError, TypeError) as exc:
        raise HTTPException(status_code=502, detail=f"Unexpected AI Gateway response: {exc}")


async def _call_openai_compatible(prompt: str) -> str:
    if not OPENAI_API_KEY:
        raise HTTPException(status_code=500, detail="OPENAI_API_KEY not configured.")
    base = OPENAI_BASE_URL.rstrip("/")
    async with httpx.AsyncClient(timeout=300.0) as client:
        resp = await client.post(
            f"{base}/chat/completions",
            headers={"Authorization": f"Bearer {OPENAI_API_KEY}", "Content-Type": "application/json"},
            json={"model": OPENAI_MODEL, "messages": [{"role": "user", "content": prompt}], "temperature": 0.1},
        )
    if not resp.is_success:
        raise HTTPException(status_code=resp.status_code, detail=f"LLM error: {resp.text[:300]}")
    return resp.json()["choices"][0]["message"]["content"]


async def _llm(prompt: str) -> str:
    if AI_GATEWAY_URL:
        return await _call_ai_gateway(prompt)
    return await _call_openai_compatible(prompt)


# ══════════════════════════════════════════════════════════════════════════════
# ① 接数据
# ══════════════════════════════════════════════════════════════════════════════

@app.get("/api/patients")
async def list_patients():
    """返回病患库（20 个 mock 病患的原始病历）。"""
    return {
        "patients": MOCK_PATIENTS,
        "hard_indicators": HARD_INDICATORS,
    }


# ══════════════════════════════════════════════════════════════════════════════
# ② 建画像 —— 病历解读（LLM 抽取结构化画像，统一术语）
# ══════════════════════════════════════════════════════════════════════════════

INTERPRET_SCHEMA = """{
  "age": 数字或 null,
  "gender": "男"/"女"/null,
  "diagnosis": { "site": "部位如右肺", "histology": "组织学型，如 腺癌/鳞癌/小细胞癌", "stage": "分期或 null" },
  "genes": [ { "gene": "EGFR", "variant": "19del/L858R/野生型等", "status": "阳性/阴性" } ],
  "medications": [ { "name": "通用名", "drug_class": "一代EGFR-TKI/二代/三代EGFR-TKI/化疗等", "line": 治疗线数或 null, "progressed": true/false/null } ],
  "labs": [ { "item": "ALT", "value": 数字或字符串, "unit": "U/L" } ],
  "ecog": 数字或 null,
  "brain_metastasis": "yes"（有活动性/未控制脑转移）/"no"（影像明确无转移）/"unknown"（未做影像或仅患者自诉）,
  "child_pugh": "A"/"B"/"C"/null,
  "autoimmune_active": true（活动性自身免疫病）/false（无或稳定/非活动）/null,
  "prior_third_gen_tki": true（用过奥希替尼等三代 EGFR-TKI）/false/null
}"""


def _interpret_prompt(record: str) -> str:
    return f"""你是临床数据抽取助手。请从下面这份病历文本中，按「病人本体」结构抽取出结构化「病人画像」，以 JSON 返回。

要求：
- 严格按下方 JSON 结构输出，字段无法确认时填 null（数组则填 []）。
- 统一术语：如「易瑞沙/吉非替尼」归一为通用名吉非替尼并标注 drug_class；「奥希替尼」属三代 EGFR-TKI。
- brain_metastasis 判定要谨慎：只有影像学明确「有转移」才填 "yes"；影像明确「无转移」填 "no"；
  若未做头部影像、或仅凭患者自诉「否认脑转移」而无影像，一律填 "unknown"（不得臆断为 no）。
- autoimmune_active：既往稳定/非活动期的自身免疫病（如稳定的桥本甲状腺炎）填 false；活动期填 true。
- 不得编造病历中没有的信息。

JSON 结构：
{INTERPRET_SCHEMA}

## 病历文本
{record}

直接输出 JSON 对象，不要加任何解释。
"""


class InterpretItem(BaseModel):
    id: str
    record: str


class InterpretRequest(BaseModel):
    items: list[InterpretItem]


@app.post("/api/interpret")
async def interpret_records(req: InterpretRequest):
    """病历解读：为每个病患抽取结构化画像（并发调用 LLM）。"""
    sem = asyncio.Semaphore(LLM_CONCURRENCY)

    async def one(item: InterpretItem):
        async with sem:
            raw = await _llm(_interpret_prompt(item.record))
        profile = _parse_json(raw)
        if not isinstance(profile, dict):
            profile = {}
        return {"id": item.id, "profile": profile}

    profiles = await asyncio.gather(*(one(it) for it in req.items))
    return {"profiles": profiles}


# ══════════════════════════════════════════════════════════════════════════════
# ③a 指标初筛 —— 规则对硬指标做「浅判断」（确定、无需 LLM）
# ══════════════════════════════════════════════════════════════════════════════

SENSITIZING_VARIANTS = ("19del", "l858r", "19 外显子", "21", "l858")


def _prescreen_one(profile: dict) -> dict:
    """对硬指标 H1-H4 做规则判断。返回 pass 与未通过项。"""
    failed = []

    # H1 年龄 18–75
    age = profile.get("age")
    if not (isinstance(age, (int, float)) and 18 <= age <= 75):
        failed.append({"id": "H1", "label": "年龄 18–75 岁", "reason": f"年龄为 {age}，不在范围内"})

    # H2 病理确诊肺腺癌
    histology = ((profile.get("diagnosis") or {}).get("histology") or "")
    if "腺癌" not in str(histology):
        failed.append({"id": "H2", "label": "病理确诊肺腺癌（NSCLC）", "reason": f"组织学型为「{histology or '未知'}」，非腺癌"})

    # H3 EGFR 敏感突变阳性
    genes = profile.get("genes") or []
    egfr_ok = False
    for g in genes:
        if not isinstance(g, dict):
            continue
        gene = str(g.get("gene", "")).upper()
        variant = str(g.get("variant", "")).lower()
        status = str(g.get("status", ""))
        if gene == "EGFR" and "阳性" in status and any(k in variant for k in SENSITIZING_VARIANTS):
            egfr_ok = True
            break
    if not egfr_ok:
        failed.append({"id": "H3", "label": "EGFR 敏感突变阳性（19del / L858R）", "reason": "未见 EGFR 敏感突变阳性"})

    # H4 一线 EGFR-TKI 后进展
    meds = profile.get("medications") or []
    tki_progressed = False
    for m in meds:
        if not isinstance(m, dict):
            continue
        cls = str(m.get("drug_class", ""))
        line = m.get("line")
        progressed = m.get("progressed")
        if "EGFR-TKI" in cls and (line == 1 or line == "1") and progressed is True:
            tki_progressed = True
            break
    if not tki_progressed:
        failed.append({"id": "H4", "label": "一线 EGFR-TKI 治疗后疾病进展", "reason": "无一线 EGFR-TKI 治疗后进展的记录"})

    return {"pass": len(failed) == 0, "failed": failed}


class PrescreenItem(BaseModel):
    id: str
    profile: dict


class PrescreenRequest(BaseModel):
    items: list[PrescreenItem]


@app.post("/api/prescreen")
async def prescreen(req: PrescreenRequest):
    """指标初筛：规则浅判断，快速淘汰明显不符者。"""
    results = [{"id": it.id, **_prescreen_one(it.profile)} for it in req.items]
    return {"results": results}


# ══════════════════════════════════════════════════════════════════════════════
# ③b 精细匹配 —— LLM 逐条判断 + 匹配度评分 + 原文依据 + 缺失项
# ══════════════════════════════════════════════════════════════════════════════

class Criterion(BaseModel):
    id: str
    text: str
    type: str  # "inclusion" | "exclusion"


def _match_prompt(profile: dict, criteria: list[Criterion]) -> str:
    criteria_text = "\n".join(f"- [{c.type.upper()} {c.id}] {c.text}" for c in criteria)
    profile_text = json.dumps(profile, ensure_ascii=False, indent=2)
    return f"""根据下方「病人画像」，逐条核查每项临床试验标准，输出 JSON 数组。

每条结果格式：
{{
  "id": "标准ID",
  "pass": true / false / null,
  "evidence": "从画像中摘录的判断依据，1-2 句"
}}

判定规则：
- 纳入标准：pass=true 表示满足，pass=false 表示不满足。
- 排除标准：pass=true 表示「未触发」（好），pass=false 表示「触发排除条件」（坏）。
- 信息不足、无法判断时 pass=null（例如脑转移状态为 unknown）。
- 不得臆断画像中没有的信息；evidence 必须引用画像里的具体字段/数值。

## 试验标准
{criteria_text}

## 病人画像（JSON）
{profile_text}

直接输出 JSON 数组，不要加其他说明。
"""


def _score(checks: list, criteria: list[Criterion]) -> dict:
    """由逐条结果计算匹配度评分与推荐结论。"""
    by_id = {c.id: c for c in criteria}
    total = len(criteria)
    points = 0.0
    has_fail = False
    uncertain = []
    for ck in checks:
        cid = ck.get("id")
        crit = by_id.get(cid)
        p = ck.get("pass")
        if p is True:
            points += 1
        elif p is None:
            points += 0.5
            if crit:
                uncertain.append(crit.text)
        elif p is False:
            has_fail = True
    score = round(points / total * 100) if total else 0

    if has_fail:
        recommendation = "excluded"      # 不符合，淘汰
    elif uncertain:
        recommendation = "uncertain"     # 候选（待确认/需核查）
    else:
        recommendation = "candidate"     # 候选（符合）
    return {"score": score, "recommendation": recommendation, "missing": uncertain}


class MatchItem(BaseModel):
    id: str
    profile: dict


class MatchRequest(BaseModel):
    items: list[MatchItem]
    criteria: list[Criterion]


@app.post("/api/match")
async def match(req: MatchRequest):
    """精细匹配：LLM 逐条判断 + 评分 + 原文依据 + 缺失项（并发）。"""
    sem = asyncio.Semaphore(LLM_CONCURRENCY)

    async def one(item: MatchItem):
        async with sem:
            raw = await _llm(_match_prompt(item.profile, req.criteria))
        checks = _parse_json(raw)
        if not isinstance(checks, list):
            checks = []
        scored = _score(checks, req.criteria)
        return {"id": item.id, "checks": checks, **scored}

    results = await asyncio.gather(*(one(it) for it in req.items))
    # 按匹配度降序返回，便于前端直接展示候选名单
    results.sort(key=lambda r: r["score"], reverse=True)
    return {"results": results}


# ══════════════════════════════════════════════════════════════════════════════
# （保留）外院上传拍照件入口 —— TextIn OCR
# ══════════════════════════════════════════════════════════════════════════════

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


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8010, reload=True)
