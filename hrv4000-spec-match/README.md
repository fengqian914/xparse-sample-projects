# 洛杉矶 HRV4000 技术规格书解读 Demo

把洛杉矶标书（HRV 4000 PBTS）按基准库每一行的问法做语义匹配，把命中的章节、英文原文、中文译文填回该行，给下游做应标评估。

只做 **2.2 需求条目智能匹配**。标书解析已前置完成，页面不演示解析。

## 整体流程

```text
基准库 70 行（只读）                 标书 PDF（已解析入库）
        | 勾选若干行                          |
        v                                     |
POST /api/extract                             |
  1. LLM 翻译：条目 + 解释/示例 → 英文 name/desc
  2. 召回：name/desc → aidocs recall/chunk <---+
  3. LLM 回填：条目 + chunk → 匹配 + 绿色列
        |
        v
表格：章节(英) / 原文(英) / 章节(中) / 原文(中) / 页码
右侧 PDF 按页码跳转
```

| 步骤 | 谁做 | 输入 | 输出 |
| --- | --- | --- | --- |
| 前置解析 | 线下已完成 | 657 页 PDF | `file_id` 可召回 |
| 翻译 query | AI Gateway | 中文 name + desc | `name_en` / `desc_en` |
| 召回 | aidocs `/v7/aidocs/recall/chunk` | 英文字段 | 每条 top_k 个 chunk |
| 回填 | AI Gateway | 原条目 + chunk | `matchStatus` + 绿色列 |

未匹配行绿色列留空，不编造章节号。数字 / 标准号必须能在召回原文里找到。

## 数据源

| 角色 | 文档 |
| --- | --- |
| 预置基准库 | [交付项目需求条目管理（副本）](https://365.kdocs.cn/l/cqgyTj7abCYI) · 70 行 |
| 标书 | [HRV 4000 PBTS - Conformed 5-22-17](https://365.kdocs.cn/l/cuOZdT2HC1Fc) |
| 方案 | [洛杉矶HRV4000-技术规格书解读](https://365.kdocs.cn/l/cvMZA0rKGP2E) |

## 代码结构

| 文件 | 职责 |
| --- | --- |
| `backend/main.py` | HTTP：基准库、PDF、抽取入口 |
| `backend/pipeline.py` | 抽取三步编排 |
| `backend/llm.py` | 网关调用、翻译 prompt、回填 prompt |
| `backend/recall.py` | 召回请求与 chunk 解析 |
| `frontend/src/App.tsx` | 左表右预览、勾选回填 |

## 本地启动

```bash
cd hrv4000-spec-match
cp .env.example .env   # 填 WPS_SID、AI_GATEWAY_TOKEN
cd backend
/Users/fengqian/miniconda3/envs/py310/bin/uvicorn main:app --port 8007 --reload
```

```bash
cd hrv4000-spec-match/frontend
npm install
npm run dev
```

打开 http://localhost:5180 。凭据只放 `.env`，不要提交仓库。
