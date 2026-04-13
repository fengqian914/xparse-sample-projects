# Bank Statement Extract

Sample project for parsing bank statements with TextIn and extracting structured fields with an OpenAI-compatible LLM.

## Stack

- Backend: Python + FastAPI
- Frontend: React + Vite + Tailwind CSS
- Document parsing: TextIn API
- Extraction: OpenAI-compatible chat completions API

## Project Structure

```text
bank-statement-extract/
|-- backend/
|   |-- main.py
|   `-- requirements.txt
|-- frontend/
|   |-- src/
|   |-- package.json
|   `-- vite.config.js
|-- .env.example
|-- .gitignore
`-- README.md
```

## Environment Variables

Copy `.env.example` to `.env` in the project root:

```bash
cp .env.example .env
```

Required variables:

```env
TEXTIN_APP_ID=your_app_id_here
TEXTIN_SECRET_CODE=your_secret_code_here
OPENAI_API_KEY=your_api_key_here
OPENAI_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
OPENAI_MODEL=qwen-plus
```

## Run Backend

```bash
cd backend
pip install -r requirements.txt
python main.py
```

The backend listens on `http://localhost:8000`.

## Run Frontend

```bash
cd frontend
npm install
npm run dev
```

The frontend uses Vite and runs on `http://localhost:5173` by default.

## API Endpoints

### `POST /api/parse`

Uploads a file to TextIn and returns:

```json
{
  "markdown": "...",
  "pages": []
}
```

### `POST /api/extract`

Sends markdown plus a prompt to the configured LLM and returns parsed JSON.

### `GET /api/image`

Proxies TextIn page image download by `image_id`.
