import os
from dataclasses import dataclass


@dataclass
class AppSettings:
    data_dir: str = "data"
    outputs_dir: str = "outputs"
    nasa_api_key: str = ""
    soundfont_path: str = ""
    fluidsynth_bin: str = "fluidsynth"
    lstm_checkpoint_path: str = ""


def load_settings():
    return AppSettings(
        data_dir=os.getenv("DATA_DIR", "data"),
        outputs_dir=os.getenv("OUTPUTS_DIR", "outputs"),
        nasa_api_key=os.getenv("NASA_API_KEY", ""),
        soundfont_path=os.getenv("SOUNDFONT_PATH", "").strip(),
        fluidsynth_bin=os.getenv("FLUIDSYNTH_BIN", "fluidsynth").strip() or "fluidsynth",
        lstm_checkpoint_path=os.getenv("LSTM_CHECKPOINT_PATH", "").strip(),
    )
