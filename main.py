from scripts.bootstrap import ensure_project_layout, init_environment
from scripts.data_fetcher import fetch_velocity_dataset, save_velocity_dataset
from scripts.hybrid_audio import mix_with_nasa_background, render_events_to_wav
from scripts.settings import load_settings
from scripts.sonifier import save_advanced_composition
from services.harmony_engine import compute_sonification_metrics
from services.music_styles import get_style

print("--- AI Star Composer ---")
ensure_project_layout(".")
init_environment(".")
settings = load_settings()
planet = input("اختر الكوكب (مثلاً Mars أو Jupiter): ").strip() or "Mars"
days = input("عدد الأيام (الافتراضي 30): ").strip() or "30"
mode_in = (input("الوضع: baseline أو ai (افتراضي ai): ").strip().lower() or "ai")
mode = "baseline" if mode_in.startswith("b") else "ai"
print("النمط الموسيقي: calm | pop | study | cinematic | drone")
style_id = (input("النمط (افتراضي calm): ").strip().lower() or "calm")
if style_id not in ("calm", "pop", "study", "cinematic", "drone"):
    style_id = "calm"
background_path = input("مسار WAV خلفية ناسا (اختياري): ").strip()
fg_gain = input("قوة اللحن foreground (افتراضي 0.85): ").strip() or "0.85"
bg_gain = input("قوة الخلفية background (افتراضي 0.35): ").strip() or "0.35"
fade_ms = input("Fade بالميلي ثانية (افتراضي 80): ").strip() or "80"
ducking = (input("تفعيل ducking؟ (y/n, الافتراضي y): ").strip().lower() or "y") != "n"
ducking_strength = input("قوة ducking (افتراضي 0.45): ").strip() or "0.45"

try:
    dataset = fetch_velocity_dataset(planet_name=planet, days_count=int(days))
    if not dataset["points"]:
        raise ValueError("No velocity points received from NASA.")

    json_path = save_velocity_dataset(dataset, data_dir=settings.data_dir)
    midi_path, events = save_advanced_composition(
        dataset["points"],
        planet_name=planet,
        outputs_dir=settings.outputs_dir,
        mode=mode,
        style_id=style_id,
    )
    artifact = f"{planet.lower()}_{mode}_{style_id}"
    st = get_style(style_id)
    melody_wav_path = render_events_to_wav(
        events,
        f"{settings.outputs_dir}/{artifact}_melody.wav",
        bpm=st.bpm,
        style_id=style_id,
    )
    metrics = compute_sonification_metrics(events)

    stats = dataset.get("metadata", {}).get("parse_stats", {})
    print(f"📡 تم استلام {dataset['count']} نقطة بيانات مدارية.")
    print(
        "📊 Speed[min/avg/max]: "
        f"{stats.get('speed_min', 0):.6f} / {stats.get('speed_avg', 0):.6f} / {stats.get('speed_max', 0):.6f}"
    )
    print(f"🎛 الوضع: {mode} | النمط: {style_id}")
    print(f"📈 مقاييس السونيفيكيشن: {metrics}")
    print(f"🧪 ملف البيانات: {json_path}")
    print(f"🎼 ملف MIDI: {midi_path}")
    print(f"🔊 ملف WAV المولد: {melody_wav_path}")

    if background_path:
        hybrid_path = mix_with_nasa_background(
            generated_wav=melody_wav_path,
            background_wav=background_path,
            output_path=f"{settings.outputs_dir}/{artifact}_hybrid.wav",
            fg_gain=float(fg_gain),
            bg_gain=float(bg_gain),
            fade_ms=int(fade_ms),
            ducking=ducking,
            ducking_strength=float(ducking_strength),
        )
        print(f"🌌 ملف Hybrid النهائي: {hybrid_path}")
except Exception as exc:
    print(f"❌ فشل التنفيذ: {exc}")
