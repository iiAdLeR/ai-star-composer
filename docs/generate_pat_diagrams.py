# -*- coding: utf-8 -*-
"""Generate project diagrams as PNG files for PAT report."""
from __future__ import annotations

from pathlib import Path

import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch


OUT = Path(__file__).resolve().parent / "diagrams"


def _box(ax, x, y, w, h, text, fc="#10233d", ec="#4aa3ff", fs=10):
    patch = FancyBboxPatch(
        (x, y),
        w,
        h,
        boxstyle="round,pad=0.02,rounding_size=0.02",
        linewidth=1.5,
        edgecolor=ec,
        facecolor=fc,
    )
    ax.add_patch(patch)
    ax.text(x + w / 2, y + h / 2, text, ha="center", va="center", color="white", fontsize=fs)


def _arrow(ax, x1, y1, x2, y2, text=""):
    ax.annotate("", xy=(x2, y2), xytext=(x1, y1), arrowprops=dict(arrowstyle="->", lw=1.8, color="#9bd1ff"))
    if text:
        ax.text((x1 + x2) / 2, (y1 + y2) / 2 + 0.02, text, color="#d8efff", fontsize=9, ha="center")


def _base_fig(title: str):
    fig, ax = plt.subplots(figsize=(14, 8))
    fig.patch.set_facecolor("#0b1320")
    ax.set_facecolor("#0b1320")
    ax.set_xlim(0, 1)
    ax.set_ylim(0, 1)
    ax.axis("off")
    ax.text(0.5, 0.96, title, ha="center", va="center", color="white", fontsize=16, fontweight="bold")
    return fig, ax


def draw_architecture():
    fig, ax = _base_fig("AI Star Composer - Yuksek Seviye Mimari")
    _box(ax, 0.05, 0.63, 0.22, 0.2, "Web UI\n(React + Vite)\nPlanetPicker3D\nStudio/Live")
    _box(ax, 0.38, 0.63, 0.24, 0.2, "Backend API\n(FastAPI)\nREST + WebSocket")
    _box(ax, 0.72, 0.70, 0.22, 0.13, "Data Sources\nNASA/JPL + Local JSON")
    _box(ax, 0.72, 0.52, 0.22, 0.13, "ML Assets\nJSONL + Checkpoints")
    _box(ax, 0.38, 0.32, 0.24, 0.2, "Service Layer\nharmony_engine\nlstm_blend\nsonifier")
    _box(ax, 0.05, 0.32, 0.22, 0.2, "Output Layer\nMIDI / WAV\nFinal Files")
    _arrow(ax, 0.27, 0.73, 0.38, 0.73, "HTTP/WS")
    _arrow(ax, 0.50, 0.63, 0.50, 0.52, "Orchestration")
    _arrow(ax, 0.62, 0.74, 0.72, 0.76, "Fetch/Cache")
    _arrow(ax, 0.62, 0.42, 0.72, 0.58, "Model Read")
    _arrow(ax, 0.38, 0.42, 0.27, 0.42, "Write MIDI/WAV")
    _arrow(ax, 0.16, 0.52, 0.16, 0.63, "Download/Preview")
    fig.savefig(OUT / "architecture_overview.png", dpi=180, bbox_inches="tight")
    plt.close(fig)


def draw_end_to_end_flow():
    fig, ax = _base_fig("End-to-End Uretim Akisi")
    nodes = [
        (0.05, 0.64, 0.18, 0.16, "1) Kullanici\nGezegen+Stil secer"),
        (0.28, 0.64, 0.18, 0.16, "2) API istegi\n/generate veya /live"),
        (0.51, 0.64, 0.2, 0.16, "3) Veri cozumu\ncache -> NASA fallback"),
        (0.76, 0.64, 0.18, 0.16, "4) Event uretimi\nharmony_engine"),
        (0.16, 0.34, 0.22, 0.16, "5) Opsiyonel LSTM\npitch blend"),
        (0.44, 0.34, 0.22, 0.16, "6) MIDI yazimi\nsymphony_from_lstm"),
        (0.72, 0.34, 0.22, 0.16, "7) Cikti donusu\nindirme + oynatma"),
    ]
    for n in nodes:
        _box(ax, *n)
    _arrow(ax, 0.23, 0.72, 0.28, 0.72)
    _arrow(ax, 0.46, 0.72, 0.51, 0.72)
    _arrow(ax, 0.71, 0.72, 0.76, 0.72)
    _arrow(ax, 0.85, 0.64, 0.27, 0.50, "events")
    _arrow(ax, 0.38, 0.42, 0.44, 0.42)
    _arrow(ax, 0.66, 0.42, 0.72, 0.42)
    fig.savefig(OUT / "end_to_end_flow.png", dpi=180, bbox_inches="tight")
    plt.close(fig)


def draw_ml_pipeline():
    fig, ax = _base_fig("ML Pipeline (Veriden Checkpoint'e)")
    _box(ax, 0.05, 0.68, 0.24, 0.16, "nasa_planets/*.json\n(8 gezegen)")
    _box(ax, 0.35, 0.68, 0.24, 0.16, "export/bundle\nstyle_idx + planet_idx")
    _box(ax, 0.65, 0.68, 0.28, 0.16, "style_sequences_8planets.jsonl\n(2048 satir)")
    _box(ax, 0.1, 0.40, 0.32, 0.16, "train_sequence_lstm\n--epochs 45 --batch 64")
    _box(ax, 0.52, 0.40, 0.38, 0.16, "note_lstm_style_planet.pt\nuse_style=True, use_planet=True")
    _box(ax, 0.1, 0.14, 0.32, 0.16, "generate_from_lstm\nsymphony_from_lstm")
    _box(ax, 0.52, 0.14, 0.38, 0.16, "outputs/*_final_*_lstm_symphony_planet.mid")
    _arrow(ax, 0.29, 0.76, 0.35, 0.76)
    _arrow(ax, 0.59, 0.76, 0.65, 0.76)
    _arrow(ax, 0.79, 0.68, 0.28, 0.56)
    _arrow(ax, 0.42, 0.48, 0.52, 0.48)
    _arrow(ax, 0.71, 0.40, 0.26, 0.30)
    _arrow(ax, 0.42, 0.22, 0.52, 0.22)
    fig.savefig(OUT / "ml_pipeline_flow.png", dpi=180, bbox_inches="tight")
    plt.close(fig)


def draw_live_sequence():
    fig, ax = _base_fig("Live Akis Sequence Diyagrami")
    cols = [0.12, 0.35, 0.58, 0.82]
    labels = ["Kullanici", "Web UI", "API", "Service Layer"]
    for x, lb in zip(cols, labels):
        ax.text(x, 0.88, lb, ha="center", color="white", fontsize=11, fontweight="bold")
        ax.plot([x, x], [0.18, 0.84], "--", color="#4a6d8f", lw=1)

    def msg(i, j, y, text):
        _arrow(ax, cols[i], y, cols[j], y)
        ax.text((cols[i] + cols[j]) / 2, y + 0.02, text, ha="center", color="#d8efff", fontsize=9)

    msg(0, 1, 0.78, "Gezegen/Stil sec")
    msg(1, 2, 0.70, "WS /live payload")
    msg(2, 3, 0.62, "generate_events + blend")
    msg(3, 2, 0.54, "notes/meta")
    msg(2, 1, 0.46, "stream response")
    msg(1, 0, 0.38, "UI update + audio preview")
    ax.text(0.5, 0.24, "Not: Baglanti kesilirse istemci yeniden deneme veya fallback uygular.", ha="center", color="#9ecfff", fontsize=9)
    fig.savefig(OUT / "live_sequence.png", dpi=180, bbox_inches="tight")
    plt.close(fig)


def draw_use_case():
    fig, ax = _base_fig("AI Star Composer - Use Case Diagram")
    # System boundary
    boundary = FancyBboxPatch(
        (0.26, 0.20),
        0.68,
        0.66,
        boxstyle="round,pad=0.02,rounding_size=0.02",
        linewidth=1.6,
        edgecolor="#8fc7ff",
        facecolor="#111f32",
    )
    ax.add_patch(boundary)
    ax.text(0.60, 0.84, "AI Star Composer Sistemi", color="white", fontsize=12, ha="center", fontweight="bold")

    # Actor
    ax.text(0.09, 0.73, "Kullanici", color="white", fontsize=11, ha="center", fontweight="bold")
    ax.add_patch(plt.Circle((0.09, 0.66), 0.025, fill=False, ec="#d9ecff", lw=1.7))
    ax.plot([0.09, 0.09], [0.635, 0.56], color="#d9ecff", lw=1.7)
    ax.plot([0.06, 0.12], [0.60, 0.60], color="#d9ecff", lw=1.7)
    ax.plot([0.09, 0.06], [0.56, 0.51], color="#d9ecff", lw=1.7)
    ax.plot([0.09, 0.12], [0.56, 0.51], color="#d9ecff", lw=1.7)

    def oval(cx, cy, w, h, text):
        e = plt.matplotlib.patches.Ellipse((cx, cy), w, h, edgecolor="#9fd3ff", facecolor="#173457", lw=1.5)
        ax.add_patch(e)
        ax.text(cx, cy, text, ha="center", va="center", color="white", fontsize=9)

    oval(0.43, 0.72, 0.26, 0.1, "Gezegen Sec")
    oval(0.72, 0.72, 0.30, 0.1, "Stil/Mod Sec")
    oval(0.43, 0.57, 0.30, 0.1, "Muzik Uret (MIDI)")
    oval(0.72, 0.57, 0.34, 0.1, "LSTM Aktif/Pasif Ayarla")
    oval(0.43, 0.40, 0.30, 0.1, "Canli Akisi Baslat")
    oval(0.72, 0.40, 0.30, 0.1, "Ciktiyi Indir / Dinle")
    oval(0.58, 0.27, 0.36, 0.1, "Sistem Durumu ve Hata Mesaji Gor")

    # Actor associations
    for x, y in [(0.30, 0.72), (0.57, 0.72), (0.28, 0.57), (0.55, 0.57), (0.28, 0.40), (0.57, 0.40), (0.42, 0.27)]:
        _arrow(ax, 0.13, 0.60, x, y)

    fig.savefig(OUT / "use_case_diagram.png", dpi=180, bbox_inches="tight")
    plt.close(fig)


def draw_gantt():
    fig, ax = plt.subplots(figsize=(14, 8))
    fig.patch.set_facecolor("#0b1320")
    ax.set_facecolor("#0b1320")

    tasks = [
        ("IP-1 Planlama", 1, 2),
        ("IP-2 Veri Toplama", 1, 2),
        ("IP-3 Veri On Isleme", 3, 2),
        ("IP-4 Parametre Donusumu", 3, 2),
        ("IP-5 LSTM Egitimi", 5, 2),
        ("IP-6 Web/Entegrasyon", 5, 3),
        ("IP-7 Test ve Raporlama", 8, 3),
    ]
    y = list(range(len(tasks)))
    colors = ["#4aa3ff", "#6ac8ff", "#8fe3ff", "#50b7f5", "#7dd3fc", "#38bdf8", "#0ea5e9"]

    for i, (name, start, dur) in enumerate(tasks):
        ax.barh(i, dur, left=start, height=0.58, color=colors[i % len(colors)], edgecolor="#d8efff")
        end_week = start + dur - 1
        label = f"{start}. hafta" if dur == 1 else f"{start}-{end_week}. haftalar"
        ax.text(start + dur / 2, i, label, va="center", ha="center", color="#062238", fontsize=9, fontweight="bold")

    ax.set_yticks(y)
    ax.set_yticklabels([t[0] for t in tasks], color="white", fontsize=10)
    ax.set_xticks(range(1, 12))
    ax.set_xticklabels([f"H{i}" for i in range(1, 12)], color="white")
    ax.invert_yaxis()
    ax.grid(axis="x", color="#35506f", linestyle="--", linewidth=0.7, alpha=0.7)
    ax.set_xlabel("Hafta", color="white", fontsize=11)
    ax.set_title("AI Star Composer - Is Paketi Zaman Cizelgesi (Gantt)", color="white", fontsize=15, fontweight="bold", pad=12)

    for s in ax.spines.values():
        s.set_color("#4a6d8f")

    fig.savefig(OUT / "gantt_is_paketi.png", dpi=180, bbox_inches="tight")
    plt.close(fig)


def draw_module_relationship():
    fig, ax = _base_fig("AI Star Composer - Sinif/Modul Iliski Diyagrami")

    # Core modules
    _box(ax, 0.05, 0.68, 0.22, 0.14, "web/src/pages\nStudio / Live / Welcome")
    _box(ax, 0.05, 0.48, 0.22, 0.14, "web/components\nPlanetPicker3D")
    _box(ax, 0.36, 0.68, 0.24, 0.14, "backend/api.py\nREST + WebSocket")
    _box(ax, 0.36, 0.48, 0.24, 0.14, "services/harmony_engine.py\nEvent generation")
    _box(ax, 0.36, 0.28, 0.24, 0.14, "services/lstm_blend.py\nCheckpoint resolve + blend")
    _box(ax, 0.67, 0.68, 0.28, 0.14, "ml/generate_from_lstm.py\nSample pitches")
    _box(ax, 0.67, 0.48, 0.28, 0.14, "ml/train_sequence_lstm.py\nTrain LSTM")
    _box(ax, 0.67, 0.28, 0.28, 0.14, "scripts/sonifier.py\nWrite MIDI/WAV")

    # Flows
    _arrow(ax, 0.27, 0.75, 0.36, 0.75, "request")
    _arrow(ax, 0.27, 0.55, 0.36, 0.55, "planet/style")
    _arrow(ax, 0.48, 0.68, 0.48, 0.62, "calls")
    _arrow(ax, 0.48, 0.48, 0.48, 0.42, "optional")
    _arrow(ax, 0.60, 0.35, 0.67, 0.75, "uses model")
    _arrow(ax, 0.60, 0.55, 0.67, 0.35, "render")
    _arrow(ax, 0.79, 0.62, 0.79, 0.55, "checkpoint")
    _arrow(ax, 0.79, 0.48, 0.79, 0.42, "final output")

    fig.savefig(OUT / "module_relationship_diagram.png", dpi=180, bbox_inches="tight")
    plt.close(fig)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    draw_architecture()
    draw_end_to_end_flow()
    draw_ml_pipeline()
    draw_live_sequence()
    draw_use_case()
    draw_gantt()
    draw_module_relationship()
    print(f"Wrote diagrams to: {OUT}")


if __name__ == "__main__":
    main()

