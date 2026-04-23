# Resume Extract

A standalone demo that uses [TextIn](https://www.textin.com) OCR + an OpenAI-compatible LLM to extract structured fields from resumes (PDF, DOC, DOCX, images).

## Features

- Automatic document classification (is it a resume? what style?)
- Structured field extraction: basic info, work experience, education, projects, skills, certificates
- Normalized fields: phone, email, degree, years of experience calculation
- Resume completeness scoring (0–100)
- Side-by-side document image viewer and extraction result panel
- JSON / CSV export
- Supports PDF, DOC, DOCX, JPG, PNG, BMP, TIFF, WEBP

## Architecture

```
┌─────────────────┐    ┌──────────────────────────┐    ┌─────────────┐
│  Browser (Vite) │───▶│  FastAPI Backend (Python) │───▶│  TextIn API │
│  React + Tailwind│    │  /api/parse               │    │  OCR        │
│                 │    │  /api/extract              │───▶│  LLM        │
│                 │◀───│  /api/image                │    │             │
└─────────────────┘    └──────────────────────────┘    └─────────────┘
```

The frontend calls `/api/extract` **twice**:
1. Classification call — determines if it's a resume and its style
2. Extraction call — extracts all standard fields using the classification as context

## Prerequisites

- Python 3.10+
- Node.js 18+
- A [TextIn](https://www.textin.com) account (for OCR API credentials)
- An OpenAI-compatible LLM API key (e.g., Alibaba Cloud Dashscope / OpenAI)

## Setup

### 1. Configure environment

```bash
cp .env.example .env
```

Edit `.env`:

```
TEXTIN_APP_ID=your_app_id
TEXTIN_SECRET_CODE=your_secret_code
OPENAI_API_KEY=your_api_key
OPENAI_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
OPENAI_MODEL=qwen-plus
```

### 2. Start the backend

```bash
cd backend
python -m venv .venv
.venv/Scripts/activate   # Windows
# source .venv/bin/activate  # macOS/Linux
pip install -r requirements.txt
python main.py
```

Backend runs at `http://localhost:8000`.

### 3. Start the frontend

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173` in your browser.

## Project Structure

```
resume-extract/
├── .env.example
├── .gitignore
├── README.md
├── backend/
│   ├── main.py           # FastAPI: /api/parse, /api/extract, /api/image
│   └── requirements.txt
└── frontend/
    ├── index.html
    ├── package.json
    ├── vite.config.js
    └── src/
        ├── App.jsx
        ├── constants.js   # Prompts + file constraints
        ├── api/
        │   ├── textin.js  # OCR parse + image download
        │   └── llm.js     # classify + extractFields + unwrap
        ├── utils/
        │   ├── normalize.js  # Phone/email/degree/date normalization
        │   └── validation.js # Resume completeness scoring
        └── components/
            ├── UploadZone.jsx
            ├── StepIndicator.jsx
            ├── ClassificationCard.jsx
            ├── ExtractionPanel.jsx   # Timeline cards for work/edu/project
            ├── PageImageViewer.jsx
            ├── ParsePanel.jsx
            ├── ExportActions.jsx
            └── ResultLayout.jsx
```
