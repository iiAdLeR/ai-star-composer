"""
Statistical evaluation: baseline vs AI sonification.

For every (planet, style, seed) combination we run the same NASA Horizons
window through `generate_artifacts` twice (baseline + AI) and collect the
returned `sonification_metrics`. We then apply Wilcoxon signed-rank tests
on the paired per-metric values, plus matched-pair effect sizes
(Cohen's d_z and rank-biserial correlation), and emit a markdown report
with the per-metric verdict for the thesis committee.

Reproducibility: a single `--seeds` flag controls the seed list; the same
seeds always produce the same comparison. The NASA Horizons cache from
Sprint 1 means the second pass (and any reruns inside the same UTC day)
hit local JSON instead of the network.

Usage:
    python scripts/evaluate_baseline_vs_ai.py \
        --planets Earth Mars Jupiter \
        --styles calm cinematic \
        --seeds 42 7 13 19 23 \
        --days 30 \
        --report docs/evaluation_report.md \
        --plot-dir docs/plots
"""
from __future__ import annotations

import argparse
import json
import math
import statistics
import sys
import time
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Dict, List, Optional, Tuple


# --- import services ------------------------------------------------------

# Add project root so the script works when invoked directly.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from scripts.settings import load_settings  # noqa: E402
from services.generation_service import (  # noqa: E402
    MixOptions,
    generate_artifacts,
)

try:
    from scipy.stats import wilcoxon  # type: ignore[import-not-found]

    HAVE_SCIPY = True
except ImportError:
    HAVE_SCIPY = False


# --- statistics helpers ---------------------------------------------------


def _wilcoxon_manual(diffs: List[float]) -> Tuple[Optional[float], Optional[float]]:
    """Two-sided Wilcoxon signed-rank test (no SciPy fallback).

    Uses the normal approximation with tie correction. Returns (W, p).
    For small N (< 6) the normal approximation is unreliable; we report
    `None` for the p-value in that case so the report flags it.
    """
    nonzero = [d for d in diffs if d != 0.0]
    n = len(nonzero)
    if n < 6:
        return None, None
    abs_diffs = [abs(d) for d in nonzero]
    sorted_idx = sorted(range(n), key=lambda i: abs_diffs[i])
    # Assign ranks with mean rank for ties.
    ranks = [0.0] * n
    i = 0
    while i < n:
        j = i
        # Group ties.
        while j + 1 < n and abs_diffs[sorted_idx[j + 1]] == abs_diffs[sorted_idx[i]]:
            j += 1
        avg = (i + j) / 2.0 + 1.0  # 1-based mean rank
        for k in range(i, j + 1):
            ranks[sorted_idx[k]] = avg
        i = j + 1
    w_pos = sum(r for r, d in zip(ranks, nonzero) if d > 0)
    w_neg = sum(r for r, d in zip(ranks, nonzero) if d < 0)
    w = min(w_pos, w_neg)
    mean_w = n * (n + 1) / 4.0
    # Tie correction for variance.
    tie_term = 0.0
    counts: Dict[float, int] = {}
    for r in ranks:
        counts[r] = counts.get(r, 0) + 1
    for c in counts.values():
        if c > 1:
            tie_term += c**3 - c
    var_w = (n * (n + 1) * (2 * n + 1) - tie_term / 2.0) / 24.0
    if var_w <= 0:
        return w, None
    z = (w - mean_w) / math.sqrt(var_w)
    # Two-sided p-value from N(0,1).
    from math import erfc

    p = erfc(abs(z) / math.sqrt(2.0))
    return w, p


def _wilcoxon_test(diffs: List[float]) -> Tuple[Optional[float], Optional[float]]:
    if HAVE_SCIPY:
        try:
            # SciPy refuses to run when every paired difference is zero. That
            # outcome simply means baseline ≡ AI for this metric.
            non = [d for d in diffs if d != 0.0]
            if len(non) < 1:
                return None, 1.0
            res = wilcoxon(diffs, zero_method="wilcox", correction=False)
            return float(res.statistic), float(res.pvalue)
        except Exception:
            return _wilcoxon_manual(diffs)
    return _wilcoxon_manual(diffs)


def _cohens_dz(diffs: List[float]) -> Optional[float]:
    """Matched-pair Cohen's d_z = mean(diffs) / sd(diffs)."""
    nonzero = [d for d in diffs if d != 0.0]
    if len(nonzero) < 2:
        return None
    m = statistics.fmean(diffs)
    sd = statistics.pstdev(diffs)
    if sd == 0:
        return None
    return m / sd


def _rank_biserial(diffs: List[float]) -> Optional[float]:
    """Wilcoxon rank-biserial correlation: (W+ - W-) / sum(W).

    Bounded in [-1, +1]; sign tells direction (positive = AI > baseline on
    that metric).
    """
    nonzero = [d for d in diffs if d != 0.0]
    n = len(nonzero)
    if n < 1:
        return None
    abs_diffs = [abs(d) for d in nonzero]
    sorted_idx = sorted(range(n), key=lambda i: abs_diffs[i])
    ranks = [0.0] * n
    i = 0
    while i < n:
        j = i
        while j + 1 < n and abs_diffs[sorted_idx[j + 1]] == abs_diffs[sorted_idx[i]]:
            j += 1
        avg = (i + j) / 2.0 + 1.0
        for k in range(i, j + 1):
            ranks[sorted_idx[k]] = avg
        i = j + 1
    w_pos = sum(r for r, d in zip(ranks, nonzero) if d > 0)
    w_neg = sum(r for r, d in zip(ranks, nonzero) if d < 0)
    total = w_pos + w_neg
    if total <= 0:
        return None
    return (w_pos - w_neg) / total


# --- data structures ------------------------------------------------------


@dataclass
class PairResult:
    planet: str
    style: str
    seed: int
    days: int
    baseline_metrics: Dict[str, float]
    ai_metrics: Dict[str, float]
    nasa_cached: Tuple[bool, bool]
    walltime_sec: float


@dataclass
class MetricReport:
    metric: str
    n: int
    baseline_mean: float
    baseline_std: float
    ai_mean: float
    ai_std: float
    mean_delta: float
    wilcoxon_w: Optional[float]
    p_value: Optional[float]
    cohens_dz: Optional[float]
    rank_biserial: Optional[float]
    direction: str  # "AI>BL" / "BL>AI" / "≈"


# --- runner ---------------------------------------------------------------


def run_pair(
    settings,
    planet: str,
    style: str,
    seed: int,
    days: int,
) -> PairResult:
    """Run baseline + AI generation for one (planet, style, seed) cell."""
    mix = MixOptions()  # use defaults; we only care about symbolic metrics
    t0 = time.perf_counter()
    bl = generate_artifacts(
        planet=planet,
        days=days,
        seed=seed,
        data_dir=settings.data_dir,
        outputs_dir=settings.outputs_dir,
        mix_options=mix,
        mode="baseline",
        style_id=style,
        soundfont_path=None,
        fluidsynth_bin=settings.fluidsynth_bin,
    )
    ai = generate_artifacts(
        planet=planet,
        days=days,
        seed=seed,
        data_dir=settings.data_dir,
        outputs_dir=settings.outputs_dir,
        mix_options=mix,
        mode="ai",
        style_id=style,
        soundfont_path=None,
        fluidsynth_bin=settings.fluidsynth_bin,
    )
    dt = time.perf_counter() - t0
    return PairResult(
        planet=planet,
        style=style,
        seed=seed,
        days=days,
        baseline_metrics=dict(bl["sonification_metrics"]),
        ai_metrics=dict(ai["sonification_metrics"]),
        nasa_cached=(bool(bl.get("data_cached")), bool(ai.get("data_cached"))),
        walltime_sec=round(dt, 3),
    )


def aggregate_reports(pairs: List[PairResult], alpha: float = 0.05) -> List[MetricReport]:
    """Public API: turn paired generations into per-metric Wilcoxon reports."""
    return _aggregate(pairs, alpha=alpha)


def _aggregate(pairs: List[PairResult], alpha: float = 0.05) -> List[MetricReport]:
    if not pairs:
        return []
    metric_keys = sorted(
        {k for p in pairs for k in p.ai_metrics if isinstance(p.ai_metrics[k], (int, float))}
    )
    reports: List[MetricReport] = []
    for m in metric_keys:
        bl_vals: List[float] = []
        ai_vals: List[float] = []
        diffs: List[float] = []
        for p in pairs:
            b = float(p.baseline_metrics.get(m, math.nan))
            a = float(p.ai_metrics.get(m, math.nan))
            if not math.isfinite(b) or not math.isfinite(a):
                continue
            bl_vals.append(b)
            ai_vals.append(a)
            diffs.append(a - b)
        if not diffs:
            continue
        w, p = _wilcoxon_test(diffs)
        dz = _cohens_dz(diffs)
        rb = _rank_biserial(diffs)
        if p is not None and p < alpha and statistics.fmean(diffs) > 0:
            direction = "AI > BL *"
        elif p is not None and p < alpha and statistics.fmean(diffs) < 0:
            direction = "BL > AI *"
        else:
            direction = "≈"
        reports.append(
            MetricReport(
                metric=m,
                n=len(diffs),
                baseline_mean=round(statistics.fmean(bl_vals), 4),
                baseline_std=round(statistics.pstdev(bl_vals), 4) if len(bl_vals) > 1 else 0.0,
                ai_mean=round(statistics.fmean(ai_vals), 4),
                ai_std=round(statistics.pstdev(ai_vals), 4) if len(ai_vals) > 1 else 0.0,
                mean_delta=round(statistics.fmean(diffs), 4),
                wilcoxon_w=round(w, 4) if w is not None else None,
                p_value=round(p, 6) if p is not None else None,
                cohens_dz=round(dz, 4) if dz is not None else None,
                rank_biserial=round(rb, 4) if rb is not None else None,
                direction=direction,
            )
        )
    return reports


# --- plotting (optional matplotlib) ---------------------------------------


def _try_plot_metric_boxes(reports: List[MetricReport], pairs: List[PairResult], plot_dir: Path) -> List[str]:
    try:
        import matplotlib

        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
    except ImportError:
        return []

    saved: List[str] = []
    plot_dir.mkdir(parents=True, exist_ok=True)
    for r in reports:
        bl = [float(p.baseline_metrics.get(r.metric, math.nan)) for p in pairs]
        ai = [float(p.ai_metrics.get(r.metric, math.nan)) for p in pairs]
        bl = [v for v in bl if math.isfinite(v)]
        ai = [v for v in ai if math.isfinite(v)]
        if not bl or not ai:
            continue
        fig, ax = plt.subplots(figsize=(5.6, 4.2), dpi=120)
        # matplotlib 3.9+ renamed `labels` to `tick_labels`; fall back for older versions.
        try:
            bp = ax.boxplot(
                [bl, ai],
                tick_labels=["Baseline", "AI"],
                widths=0.5,
                patch_artist=True,
                medianprops={"color": "#0f172a", "linewidth": 1.5},
            )
        except TypeError:
            bp = ax.boxplot(
                [bl, ai],
                labels=["Baseline", "AI"],
                widths=0.5,
                patch_artist=True,
                medianprops={"color": "#0f172a", "linewidth": 1.5},
            )
        for patch, color in zip(bp["boxes"], ["#94a3b8", "#22d3ee"]):
            patch.set_facecolor(color)
            patch.set_alpha(0.7)
        title = r.metric
        if r.p_value is not None:
            title += f"  (p={r.p_value:.4g}, d_z={r.cohens_dz})"
        ax.set_title(title, fontsize=10)
        ax.grid(True, axis="y", alpha=0.2, linestyle=":")
        fig.tight_layout()
        out = plot_dir / f"{r.metric}.png"
        fig.savefig(out)
        plt.close(fig)
        saved.append(str(out))
    return saved


# --- markdown report ------------------------------------------------------


def _render_report(
    reports: List[MetricReport],
    pairs: List[PairResult],
    *,
    alpha: float,
    plot_paths: List[str],
    report_path: Path,
) -> None:
    backend = "scipy" if HAVE_SCIPY else "fallback (normal approximation)"
    lines: List[str] = []
    lines.append("# Baseline vs AI — Statistical Evaluation\n")
    lines.append(
        "This report compares the symbolic sonification metrics produced by the "
        "**baseline** (direct physics → note mapping) and the **AI** (transition-scored) "
        "branches on the same NASA Horizons windows. "
        "Each row of the table below is a Wilcoxon signed-rank test on paired "
        "(baseline, AI) values, accompanied by effect-size estimators that are robust "
        "to non-normal distributions.\n"
    )
    lines.append("## Setup\n")
    planets = sorted({p.planet for p in pairs})
    styles = sorted({p.style for p in pairs})
    seeds = sorted({p.seed for p in pairs})
    days_set = sorted({p.days for p in pairs})
    lines.append(f"- **Planets**: {', '.join(planets)}")
    lines.append(f"- **Styles**: {', '.join(styles)}")
    lines.append(f"- **Seeds**: {', '.join(str(s) for s in seeds)}")
    lines.append(f"- **Horizons window (days)**: {', '.join(str(d) for d in days_set)}")
    lines.append(f"- **Sample pairs N**: {len(pairs)}")
    lines.append(f"- **Significance α**: {alpha}")
    lines.append(f"- **Test backend**: {backend}")
    nasa_hits = sum(1 for p in pairs if any(p.nasa_cached))
    lines.append(f"- **NASA cache hits during run**: {nasa_hits}/{len(pairs)}")
    lines.append("")
    lines.append("## Per-metric verdict\n")
    lines.append(
        "| Metric | n | Baseline (μ ± σ) | AI (μ ± σ) | Δ (AI−BL) | W | p-value | d_z | rank-biserial | Direction |"
    )
    lines.append(
        "|---|---:|---:|---:|---:|---:|---:|---:|---:|---|"
    )
    for r in reports:
        lines.append(
            "| `{m}` | {n} | {bm:.4f} ± {bs:.4f} | {am:.4f} ± {as_:.4f} | {dm:+.4f} | {w} | {pv} | {dz} | {rb} | {dir} |".format(
                m=r.metric,
                n=r.n,
                bm=r.baseline_mean,
                bs=r.baseline_std,
                am=r.ai_mean,
                as_=r.ai_std,
                dm=r.mean_delta,
                w=("—" if r.wilcoxon_w is None else f"{r.wilcoxon_w:.2f}"),
                pv=("—" if r.p_value is None else f"{r.p_value:.4g}"),
                dz=("—" if r.cohens_dz is None else f"{r.cohens_dz:.3f}"),
                rb=("—" if r.rank_biserial is None else f"{r.rank_biserial:.3f}"),
                dir=r.direction,
            )
        )
    lines.append("")
    lines.append(
        "`*` next to *Direction* marks p-values below the α threshold (statistical "
        "significance under matched-pair Wilcoxon).\n"
    )

    if plot_paths:
        lines.append("## Box-plots per metric\n")
        for path in plot_paths:
            rel = Path(path)
            try:
                rel = rel.relative_to(report_path.parent)
            except ValueError:
                pass
            lines.append(f"![{rel.stem}]({rel.as_posix()})")
        lines.append("")

    lines.append("## Raw per-pair table\n")
    metric_keys = sorted(reports, key=lambda r: r.metric)
    metric_names = [m.metric for m in metric_keys]
    header = ["planet", "style", "seed", "branch"] + metric_names
    lines.append("| " + " | ".join(header) + " |")
    lines.append("|" + "|".join(["---"] * len(header)) + "|")
    for p in pairs:
        for branch in ("baseline", "ai"):
            cells = [p.planet, p.style, str(p.seed), branch]
            src = p.baseline_metrics if branch == "baseline" else p.ai_metrics
            for m in metric_names:
                v = src.get(m)
                cells.append(f"{v:.4f}" if isinstance(v, (int, float)) else "—")
            lines.append("| " + " | ".join(cells) + " |")
    lines.append("")
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text("\n".join(lines), encoding="utf-8")
    print(f"Wrote report -> {report_path}")


# --- main -----------------------------------------------------------------


def main() -> None:
    ap = argparse.ArgumentParser(description="Baseline vs AI Wilcoxon evaluation.")
    ap.add_argument("--planets", nargs="+", default=["Earth", "Mars", "Jupiter"])
    ap.add_argument("--styles", nargs="+", default=["calm", "cinematic"])
    ap.add_argument("--seeds", nargs="+", type=int, default=[7, 13, 19, 23, 42])
    ap.add_argument("--days", type=int, default=30)
    ap.add_argument("--alpha", type=float, default=0.05)
    ap.add_argument("--report", default="docs/evaluation_report.md")
    ap.add_argument("--plot-dir", default="docs/plots")
    ap.add_argument(
        "--raw-json",
        default=None,
        help="Optional: dump every PairResult to this JSON path for further analysis.",
    )
    args = ap.parse_args()

    settings = load_settings()

    cells: List[Tuple[str, str, int]] = [
        (planet, style, seed)
        for planet in args.planets
        for style in args.styles
        for seed in args.seeds
    ]
    if not cells:
        raise SystemExit("Empty grid — give at least one planet, style, and seed.")
    print(f"Running {len(cells)} (planet, style, seed) cells × 2 branches…")
    pairs: List[PairResult] = []
    for idx, (planet, style, seed) in enumerate(cells, 1):
        print(f"  [{idx:>3}/{len(cells)}] {planet:8s} | {style:10s} | seed={seed}", end="", flush=True)
        t0 = time.perf_counter()
        pr = run_pair(settings, planet, style, seed, args.days)
        print(f"  -> {time.perf_counter() - t0:.1f}s   cached={pr.nasa_cached}")
        pairs.append(pr)

    reports = _aggregate(pairs, alpha=args.alpha)
    plot_paths = _try_plot_metric_boxes(reports, pairs, Path(args.plot_dir))
    report_path = Path(args.report)
    _render_report(
        reports,
        pairs,
        alpha=args.alpha,
        plot_paths=plot_paths,
        report_path=report_path,
    )

    if args.raw_json:
        raw_path = Path(args.raw_json)
        raw_path.parent.mkdir(parents=True, exist_ok=True)
        raw_path.write_text(
            json.dumps({"pairs": [asdict(p) for p in pairs], "reports": [asdict(r) for r in reports]}, indent=2),
            encoding="utf-8",
        )
        print(f"Wrote raw JSON -> {raw_path}")


if __name__ == "__main__":
    main()
