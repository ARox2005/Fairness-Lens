# ── Stage 1: Builder ──
FROM python:3.11-slim as builder

WORKDIR /app

# Install build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc g++ && \
    rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

# ── Stage 2: Runtime ──
FROM python:3.11-slim

WORKDIR /app

# Copy installed packages from builder
COPY --from=builder /install /usr/local

# Copy application code
COPY . .

# Cloud Run sets PORT env variable
ENV PORT=8000
ENV APP_ENV=production
ENV PYTHONUNBUFFERED=1

EXPOSE ${PORT}

# From the document: --memory 2Gi --cpu 2 for AIF360/Fairlearn computation
# Set with: gcloud run deploy --memory 2Gi --cpu 2 --min-instances=1
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT}"]
