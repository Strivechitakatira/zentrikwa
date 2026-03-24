FROM python:3.12-slim
RUN echo "build version 2"
# Create non-root user
RUN groupadd -r appuser && useradd -r -g appuser appuser
WORKDIR /app
# System deps
RUN apt-get update && apt-get install -y --no-install-recommends \
 gcc \
 libpq-dev \
 && rm -rf /var/lib/apt/lists/*
# Install Python deps
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
# Force rebuild when code changes
COPY start.sh /app/start.sh
COPY . /app/
# Permissions
RUN chown -R appuser:appuser /app && chmod +x /app/start.sh
USER appuser
EXPOSE 8000
# Single source of truth
ENTRYPOINT ["/app/start.sh"]