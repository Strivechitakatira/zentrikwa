RUN echo "build version 2"
FROM python:3.12-slim

# Create non-root user
RUN groupadd -r appuser && useradd -r -g appuser appuser

WORKDIR /app

# System deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Install Python deps
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Force rebuild when code changes
COPY backend/start.sh /app/start.sh
COPY backend/ /app/

# Permissions
RUN chown -R appuser:appuser /app && chmod +x /app/start.sh

USER appuser

EXPOSE 8000

# Single source of truth
ENTRYPOINT ["/app/start.sh"]