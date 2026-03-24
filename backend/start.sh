#!/bin/sh
set -e

echo "========================="
echo "START.SH EXECUTED"
echo "========================="

PORT_VALUE=${PORT:-8000}

echo "Using PORT: $PORT_VALUE"

exec uvicorn app.main:app \
  --host 0.0.0.0 \
  --port $PORT_VALUE \
  --workers 2