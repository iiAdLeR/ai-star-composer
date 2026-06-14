# Pipeline للواو الحقيقي (عرض تخرّج قوي)

## المستوى A — مدمج بالمشروع (تلقائي بعد الإعداد)

1. ثبّت **FluidSynth** على الجهاز وأضفه لـ `PATH`، أو عيّن المسار الكامل في `.env`:
   - `FLUIDSYNTH_BIN=fluidsynth` أو `C:\...\fluidsynth.exe`
2. حمّل SoundFont عام **GM** (مثل FluidR3 GM) وضعه محليًا.
3. في `.env`:
   - `SOUNDFONT_PATH=C:/path/to/FluidR3_GM.sf2`
4. شغّل `POST /generate` كالعادة. إذا نجح التصدير، يظهر ملف:
   - `*_hq.wav` — **هذا هو الصوت الاحترافي** مقارنة بـ `*_melody.wav` (الاصطناعي).

يمكنك أيضًا تمرير مسار مؤقت في جسم الطلب: `"soundfont_path": "C:/path/to/font.sf2"`.

تحقق سريع:

- `GET /render/capabilities` — هل FluidSynth ظاهر؟ هل المسار مضبوط في الإعدادات؟

## المستوى B — يدوي (مرن للمونتاج)

1. خذ `*.mid` من `outputs/`.
2. افتحه في **MuseScore / Reaper / FL Studio** واختر أصوات أفضل من الـ GM الافتراضي.
3. صدّر **WAV/MP3** للجنة.

## المستوى C — للتمييز البحثي

- سجل في المذكرة: *النواة الخوارزمية تولّد MIDI؛ الجودة السمعية النهائية عبر SoundFont/DAW* (هذا معيار مشروعات sonification احترافية).

## أمر مساعد

```bash
python scripts/render_midi_fluidsynth.py outputs/mars_ai_pop_symphony.mid outputs/test.wav C:/audio/font.sf2
```
