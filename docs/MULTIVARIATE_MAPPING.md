# Multivariate Mapping (Physics -> Music)

This project now maps multiple planetary variables instead of speed-only sonification.

## Physical Inputs Used

- `x, y, z`: heliocentric position components from NASA Horizons vectors.
- `vx, vy, vz`: velocity components from NASA Horizons vectors.
- `speed`: magnitude of velocity vector.
- `radius`: distance from the Sun (`sqrt(x^2 + y^2 + z^2)`).
- `radial_velocity`: motion toward/away from the Sun.
- `heading_xy`: orbital heading in XY plane (`atan2(y, x)`).
- `speed_delta`: local change in speed between samples.
- `light_intensity_proxy`: inverse-square proxy (`1 / radius^2`).

## Musical Mapping

- `speed` -> base pitch on constrained scale (`C minor`).
- `Markov transitions` -> melodic continuity between consecutive notes.
- `light_intensity_proxy` -> note loudness (MIDI velocity).
- `radial_velocity` -> note duration (articulation).
- `heading_xy` -> stereo pan (MIDI CC10).
- `speed_delta` -> ornament note around main melody.
- Harmony notes (`minor third + fifth`) -> chord texture.

## Why This Is Better

- Preserves scientific grounding while improving musical richness.
- Produces distinguishable planetary signatures beyond one-dimensional speed mapping.
- Provides stronger academic argument for "interactive learning through multivariate data sonification".
