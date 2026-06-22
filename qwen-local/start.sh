#!/bin/bash
set -e

MODEL_NAME="Qwen/Qwen2.5-0.5B-Instruct"

python -m vllm.entrypoints.openai.api_server \
  --model "$MODEL_NAME" \
  --host 0.0.0.0 \
  --port 8000
