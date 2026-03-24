echo "START.SH EXECUTED"
env | grep PORT

#!/bin/sh

# Fail fast if anything breaks
set -e

# Default port if Railway doesn't inject one
PORT=${PORT:-8000}

echo "Starting server on port $PORT..."

exec uvicorn app.main:app --host 0.0.0.0 --port $PORT --workers 2