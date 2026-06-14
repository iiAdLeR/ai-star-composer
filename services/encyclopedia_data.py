"""Encyclopedia content service.

Reads `data/planet_facts.json` and exposes:

* `get_all_planets()` — full catalog (used for hub page + search).
* `get_planet(name)` — single planet's facts, normalized for the UI.

The JSON is read once and cached in-process. Editing the file requires a
service restart (acceptable because it is shipped with the codebase, not
user data).
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from threading import Lock
from typing import Any, Dict, Optional

logger = logging.getLogger("ai_star_composer")

_FACTS_PATH = Path(__file__).resolve().parent.parent / "data" / "planet_facts.json"

_CACHE: Optional[Dict[str, Any]] = None
_CACHE_LOCK = Lock()


def _load() -> Dict[str, Any]:
    global _CACHE
    with _CACHE_LOCK:
        if _CACHE is not None:
            return _CACHE
        if not _FACTS_PATH.is_file():
            logger.error("planet_facts.json missing at %s", _FACTS_PATH)
            _CACHE = {"schema_version": 0, "planets": {}}
            return _CACHE
        try:
            _CACHE = json.loads(_FACTS_PATH.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            logger.exception("planet_facts.json invalid: %s", exc)
            _CACHE = {"schema_version": 0, "planets": {}}
        return _CACHE


def get_all_planets() -> Dict[str, Any]:
    """Return the full catalog with a stable shape for the API."""
    data = _load()
    planets = data.get("planets", {})
    # Order matches our canonical solar-system order (innermost to outermost).
    canonical_order = [
        "Mercury", "Venus", "Earth", "Mars",
        "Jupiter", "Saturn", "Uranus", "Neptune",
    ]
    ordered = [planets[name] for name in canonical_order if name in planets]
    return {
        "schema_version": data.get("schema_version", 1),
        "generated_at": data.get("generated_at"),
        "license": data.get("license"),
        "count": len(ordered),
        "planets": ordered,
    }


def get_planet(name: str) -> Optional[Dict[str, Any]]:
    data = _load()
    planets = data.get("planets", {})
    # Case-insensitive key lookup so the URL `/encyclopedia/planets/mars`
    # matches the canonical "Mars" key without a 404.
    for key, value in planets.items():
        if key.lower() == name.lower():
            return value
    return None
