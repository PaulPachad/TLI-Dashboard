# ==============================================================================
# Authority Magazine 24/7 Cloud Auto Responder
# Production Dockerfile for Railway / Render / Google Cloud Run / VPS
# ==============================================================================

FROM python:3.11-slim

# Prevent python from writing pyc files and buffering stdout/stderr
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PORT=8080

WORKDIR /app

# Install system dependencies (curl for container health checks, ca-certificates for TLS)
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install python dependencies
COPY requirements-cloud.txt .
RUN pip install --no-cache-dir -r requirements-cloud.txt

# Copy application files
COPY . .

# Expose HTTP port for cloud runner health checks
EXPOSE 8080

# Health check probe
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:${PORT:-8080}/health || exit 1

# Launch the 24/7 cloud daemon
CMD ["python", "cloud_daemon.py"]
