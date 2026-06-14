# Musical style presets

| id | intent | scale / feel |
|----|--------|----------------|
| `calm` | هادئة / ambient | Minor pentatonic, slow steps, long notes, soft velocity |
| `pop` | بوب | Major pentatonic, faster steps, short punchy notes, brighter harmony (major 3rd) |
| `study` | دراسة / deep focus | Dorian (wider), very long sustains, sparse harmony (often fifth-only) |
| `cinematic` | سينمائي | Full natural minor, medium–dramatic motion, rich harmony |

API: `style` on `POST /generate` and `POST /compare`, and `style` query on WebSocket `/live/ws`.

List presets: `GET /styles`.
