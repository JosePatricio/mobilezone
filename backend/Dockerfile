# MobileZone API (FastAPI + Uvicorn)
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .
# Normalise line endings in case the repo was checked out on Windows with CRLF.
# /app/media holds uploaded images (mounted as a volume in docker-compose.yml).
RUN sed -i 's/\r$//' docker/entrypoint.sh && chmod +x docker/entrypoint.sh \
    && mkdir -p /app/media \
    && useradd --create-home --uid 1000 appuser && chown -R appuser /app
USER appuser

EXPOSE 8000

ENTRYPOINT ["docker/entrypoint.sh"]
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port 8000 --workers ${UVICORN_WORKERS:-2} --proxy-headers --forwarded-allow-ips='*'"]
