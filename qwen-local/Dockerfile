FROM python:3.11-slim

ENV HF_HOME=/models/cache
ENV TRANSFORMERS_CACHE=/models/cache
ENV HF_ENDPOINT=https://huggingface.co

RUN pip install --no-cache-dir vllm==0.6.4

COPY start.sh /start.sh
RUN chmod +x /start.sh

ENTRYPOINT ["/start.sh"]
