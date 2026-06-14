# AI Star Composer

AI Star Composer is a graduation-project prototype that transforms orbital velocity data from NASA Horizons into musical artifacts (MIDI + WAV), with a basic AI harmony layer and an API interface.

## What Is Implemented

**Backend (FastAPI):**
- NASA JPL Horizons ingestion with on-disk caching, retries and graceful offline fallback.
- Multivariate sonification: orbital speed → pitch, distance → register, radial motion → harmony.
- Hybrid audio: per-style WAV synthesis + optional FluidSynth HQ render + NASA background ducking.
- Symbolic AI harmony (`baseline` vs `ai`), with optional **trained LSTM blend** (style + planet conditioned).
- Reproducible statistical evaluation (`/evaluation/run`, Wilcoxon signed-rank, Cohen's d_z).
- Hardened endpoints: path-traversal protection, request-id correlation, retention sweep.
- Real Artemis I trajectory anchored to live Horizons Moon ephemeris.

**Web app (React + Vite + Three.js):**
- Studio (Generate / Compare / Live / Demo / Quality dashboards).
- 3D planet picker with Earth → Moon Artemis I animation.
- Encyclopedia: 8 planets · physics · missions · NASA imagery · ar/tr/en.
- Orbital Lab + Kepler's Laws Lab (synthetic Keplerian sonification).
- Compare Planets, Historic Missions timeline, Glossary.
- Daily Pulse, Daily Trivia, Achievements (localStorage, no accounts).
- Per-planet PDF export (printable classroom worksheet, fully client-side).
- TTS narration on every "Why it sounds this way" panel.
- **Cosmic Birthday Gift (`/birthday`):** turn a person's birth date into a
  personalized song from real NASA Horizons data spanning birth-to-today,
  with cosmic facts (age in planet-years, orbits completed, distance
  traveled). Five dedicated gift styles (`celebration`, `tender`, `anthem`,
  `waltz`, `nebula`) — each with its own scale, BPM and General-MIDI
  instrument trio (e.g. music-box + warm pad for `tender`, French horn +
  cello for `anthem`). Shareable `/gift/<token>` link auto-plays for the
  recipient and the audio is excluded from the 24h outputs retention sweep.

**ML pipeline (`ml/`):**
- `train_sequence_lstm.py`: pitch + duration LSTM, optional style/planet conditioning.
- `export_style_sequences.py` + `bundle_local_planet_exports.py`: NASA-derived training rows.
- `ingest_external_midi.py` + `merge_external_jsonl.py`: optional MAESTRO/Lakh ingestion (CC BY-NC-SA aware).
- `generate_from_lstm.py`, `symphony_from_lstm.py`: deterministic CLI sampling.

## Project Structure

- `scripts/data_fetcher.py`: fetch and parse vectors from NASA, save JSON datasets.
- `scripts/sonifier.py`: MIDI export; events from `services/harmony_engine.py`.
- `services/harmony_engine.py`: baseline vs AI note generation + `sonification_metrics`.
- `scripts/hybrid_audio.py`: render note events to WAV and optional WAV mixing.
- `scripts/bootstrap.py`: initialize directories and environment loading.
- `scripts/settings.py`: central app settings from environment variables.
- `backend/api.py`: FastAPI backend for generation and artifacts access.
- `main.py`: CLI pipeline for local generation.
- `docs/MULTIVARIATE_MAPPING.md`: formal mapping from planetary variables to music controls.
- `docs/AI_LAYER.md`: what “AI” means here (no neural training in Stage 4 baseline).
- `docs/STAGE_4_CHECKLIST.md`: Stage 4 acceptance criteria.
- `docs/SOUND_QUALITY.md`: how to get **professional** audio from MIDI (DAW / SoundFont).
- `docs/WOW_PIPELINE.md`: FluidSynth + `.sf2` for automatic `*_hq.wav` exports.

## Setup

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python scripts/bootstrap.py
```

Optional environment overrides in `.env`:

```bash
DATA_DIR=data
OUTPUTS_DIR=outputs
NASA_API_KEY=your_key_here
```

### High-quality audio (optional, recommended for defense)

1. Install [FluidSynth](https://www.fluidsynth.org/) and download a General MIDI `.sf2` (e.g. FluidR3 GM).
2. Set in `.env`: `SOUNDFONT_PATH` and optionally `FLUIDSYNTH_BIN`.
3. Call `GET /render/capabilities` to verify.
4. After `POST /generate`, use `melody_hq_wav` when present (`*_hq.wav`).

See `docs/WOW_PIPELINE.md`.

## Development (API + React web)

From the project root (with `requirements.txt` installed and `web/node_modules` present):

- **API only:** double-click `run_server.bat` or run `python -m uvicorn backend.api:app --host 127.0.0.1 --port 8000 --reload`
- **Frontend only:** `cd web` then `npm run dev` (Vite proxies `/api` to `http://127.0.0.1:8000` when the API is up)
- **Both:** double-click `dev_all.bat` — opens two terminals (FastAPI on port 8000, Vite on 5173)

Studio URL parameters (optional):

- Generate: `/studio?planet=Mars&days=30&mode=ai&style=calm&seed=42`
- Live: `/studio/live?planet=Mars&days=60&interval=280&mode=ai&style=pop&seed=42`

Share or bookmark a configuration; the 3D picker keeps `planet` in sync with the query string.

## CLI Usage

```bash
python main.py
```

The CLI asks for:
- planet name (example: `Mars`)
- days count (default: `30`)
- optional NASA background WAV path

Outputs are generated in:
- `data/` for NASA dataset snapshots
- `outputs/` for MIDI/WAV artifacts

## API Usage

Run server:

```bash
uvicorn backend.api:app --reload
```

Live streaming (WebSocket):

```bash
ws://127.0.0.1:8000/live/ws?planet=Mars&days=60&seed=42&interval_ms=350&mode=ai&style=pop
```

WebSocket messages:
- `session_start`: metadata and total events
- `note_event`: real-time note payload for live playback/visualization
- `session_end`: stream finished

Quick browser demo:

- Start both processes: `dev_all.bat` (or run the API and `cd web && npm run dev` separately).
- Open [http://127.0.0.1:5173/studio/demo](http://127.0.0.1:5173/studio/demo) — the curated 3-planet jury tour.
- For the WebSocket live stream: [http://127.0.0.1:5173/studio/live](http://127.0.0.1:5173/studio/live).

Health check:

```bash
GET /health
```

Generate artifacts:

```bash
POST /generate
{
  "planet": "Mars",
  "days": 30,
  "mode": "ai",
  "style": "calm",
  "nasa_background_wav": "C:/path/to/nasa.wav",
  "fg_gain": 0.85,
  "bg_gain": 0.35,
  "fade_ms": 80,
  "ducking": true,
  "ducking_strength": 0.45,
  "seed": 42
}
```

Use `"mode": "baseline"` for the direct physics-to-pitch reference (no scored AI transitions).

Musical preset: `"style": "calm" | "pop" | "study" | "cinematic" | "drone"` (drone = ambient "what the planet might sound like"). List labels: `GET /styles`.

Compare both modes on the **same** NASA window:

```bash
POST /compare
{
  "planet": "Mars",
  "days": 30,
  "seed": 42
}
```

Response includes `baseline` / `ai` artifacts, `sonification_metrics`, and `comparison_summary`.

## Reproduce the LSTM in 4 commands

```bash
python -m ml.bundle_local_planet_exports
python -m ml.train_sequence_lstm \
  --data data/ml/style_sequences_8planets.jsonl \
  --out  ml/checkpoints/note_lstm_style_planet.pt \
  --epochs 45 --batch 64 --seed 42
python -m ml.generate_from_lstm \
  --checkpoint ml/checkpoints/note_lstm_style_planet.pt \
  --style pop --planet Mars --seed 7 --steps 96 \
  --out outputs/lstm_smoke.mid
python -m scripts.evaluate_baseline_vs_ai \
  --planets Mars Earth --styles calm pop --seeds 7 13 19 --days 30
```

Wall-clock on an i5-12500H CPU: ~7 minutes for the full training run.

## Roadmap (post-defense)

- Quiz / assessment mode with auto-grading per planet topic.
- Lesson Plan Builder: drag planets into a 45-min class outline → PDF.
- Embeddable widget (`<iframe>` snippet) for school LMSs.
- Print-ready A3 posters per planet (classroom decoration).
- Docker + GitHub Actions CI (lint + typecheck + smoke tests).

## License

Code: MIT (see `LICENSE`).
Data:
- NASA JPL Horizons ephemeris: U.S. public domain.
- NASA imagery: public domain unless otherwise credited.
- MAESTRO v3.0.0 (optional research checkpoint only): CC BY-NC-SA 4.0 — **not redistributable in commercial deployments**.
