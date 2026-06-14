# Live Mode (Real-Time Planet Sonification)

## Purpose

Provide live note events that follow the selected planet's motion-derived data, suitable for real-time listening and visualization.

## Endpoint

- `WebSocket /live/ws`
- Query params:
  - `planet` (default: `Mars`)
  - `days` (default: `60`)
  - `seed` (default: `42`)
  - `interval_ms` (default: `350`)

## Anti-Repetition Strategy

- Note events are first generated from multivariate planetary data.
- A repetition guard in `services/live_stream_service.py` avoids immediate repeated base notes.
- When repetition is detected, a constrained pitch shift is applied while preserving harmony texture.

## Client Integration

Each `note_event` message contains:
- `base_note`, `lead_note`, `harmony`
- `duration`, `velocity`, `pan`
- physical traces (`speed`, `radius`, `radial_velocity`)

The frontend can feed these directly to Web Audio (oscillator/sampler) and synchronize with planet visuals.
