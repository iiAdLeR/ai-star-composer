# EK-1 — Egitim ve Calistirma Loglari

Bu ekte, proje sirasinda calistirilan temel egitim komutlari ve terminal cikti ozetleri yer almaktadir.

## 1) 8 Gezegen Veri Birlestirme (JSONL)

Komut:

```bash
python -m ml.bundle_local_planet_exports
```

Ozet terminal ciktilari:

- `earth.json -> +256 rows (planet=Earth)`
- `jupiter.json -> +256 rows (planet=Jupiter)`
- `mars.json -> +256 rows (planet=Mars)`
- `mercury.json -> +256 rows (planet=Mercury)`
- `neptune.json -> +256 rows (planet=Neptune)`
- `saturn.json -> +256 rows (planet=Saturn)`
- `uranus.json -> +256 rows (planet=Uranus)`
- `venus.json -> +256 rows (planet=Venus)`
- `Total 2048 rows -> data/ml/style_sequences_8planets.jsonl`

## 2) LSTM (Style + Planet) Egitimi

Komut:

```bash
python -m ml.train_sequence_lstm --data data/ml/style_sequences_8planets.jsonl --out ml/checkpoints/note_lstm_style_planet.pt --epochs 45 --batch 64
```

Ozet terminal ciktilari:

- `epoch 1/45 [style+planet]  loss=1.5566`
- `epoch 10/45 [style+planet] loss=0.2523`
- `epoch 20/45 [style+planet] loss=0.1835`
- `epoch 30/45 [style+planet] loss=0.1480`
- `epoch 45/45 [style+planet] loss=0.1171`
- `Saved ml/checkpoints/note_lstm_style_planet.pt  use_style=True  use_planet=True`

## 3) Baseline (RandomForest) Egitimi

Komut:

```bash
python -m ml.train_baseline_sklearn --data data/ml/train.jsonl --out ml/checkpoints/pitch_rf.joblib
```

Ozet terminal ciktilari:

- `accuracy: 0.88`
- `macro avg f1-score: 0.78`
- `weighted avg f1-score: 0.88`
- `Saved ml/checkpoints/pitch_rf.joblib`

## 4) Harici Veri (MAESTRO) LSTM Egitimi

Komut:

```bash
python -m ml.train_sequence_lstm --data data/ml/external_notes_maestro.jsonl --out ml/checkpoints/note_lstm_external_maestro.pt --epochs 20 --batch 64 --style-conditioned off --planet-conditioned off
```

Ozet terminal ciktilari:

- `epoch 1/20  loss=3.4822`
- `epoch 10/20 loss=2.1979`
- `epoch 20/20 loss=1.9661`
- `Saved ml/checkpoints/note_lstm_external_maestro.pt  use_style=False  use_planet=False`

## 5) Dogrulama (Smoke) Uretimi

Ornek komut:

```bash
python -m ml.generate_from_lstm --checkpoint ml/checkpoints/note_lstm_style_planet.pt --out outputs/lstm_8planets_after_retrain.mid --steps 96 --style pop --planet Mars --seed 7
```

Ornek cikti:

- `Wrote outputs/lstm_8planets_after_retrain.mid (96 notes) style=pop`

