FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    DATA_DIR=data \
    OUTPUTS_DIR=outputs

# fluidsynth is needed for optional *_hq.wav rendering. ffmpeg/libsndfile not
# strictly required (we only write 16-bit PCM) but kept for forward compat.
RUN apt-get update && apt-get install -y --no-install-recommends \
        fluidsynth \
        ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --upgrade pip && pip install -r requirements.txt

COPY . .

RUN mkdir -p data data/cache data/gifts data/missions outputs assets/backgrounds assets/soundfonts

EXPOSE 8000

# Render injects $PORT; default to 8000 for local docker runs.
CMD ["sh", "-c", "uvicorn backend.api:app --host 0.0.0.0 --port ${PORT:-8000}"]
