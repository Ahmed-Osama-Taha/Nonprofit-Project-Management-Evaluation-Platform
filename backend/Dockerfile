FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# System deps kept minimal; psycopg[binary] ships its own libpq.
RUN apt-get update && apt-get install -y --no-install-recommends \
        curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
# Install the CPU-only build of torch FIRST so sentence-transformers reuses it
# instead of pulling the multi-GB CUDA/NCCL packages (this app does CPU
# inference only). This keeps the image ~2.5 GB smaller.
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu
RUN pip install --no-cache-dir -r requirements.txt

# Optional observability deps (OpenTelemetry / Prometheus). Best-effort so the
# base image still builds if a version can't resolve; the app no-ops unless
# OTEL_ENABLED=true.
COPY requirements-observability.txt .
RUN pip install --no-cache-dir -r requirements-observability.txt || true

# Pre-cache the default multilingual embedding model so the first analysis does
# not cold-download it at runtime. Best-effort: if the build host has no network
# the model is fetched on first use instead.
RUN python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2')" || true

COPY . .

EXPOSE 8000

HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=5 \
    CMD curl -fsS http://localhost:8000/api/health || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
