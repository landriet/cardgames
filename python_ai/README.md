# Scoundrel RL (In-Process Worker Bridge)

Python training stack using `sb3-contrib` MaskablePPO against a persistent local Node worker (`src/engine-lib/worker/engineWorker.ts`).

## Setup

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r python_ai/requirements.txt
npm install
```

## Train

```bash
python3 python_ai/train_ppo.py --timesteps 1000000 --model-out python_ai/models/scoundrel_maskable_ppo
```

Resume training from an existing checkpoint:

```bash
python3 python_ai/train_ppo.py --resume-from python_ai/models/scoundrel_maskable_ppo.zip --timesteps 500000 --model-out python_ai/models/scoundrel_maskable_ppo
```

## Evaluate trained model

```bash
python3 python_ai/evaluate_agent.py --model python_ai/models/scoundrel_maskable_ppo.zip --games 10000 --out python_ai/results/eval.json
```

## Random baseline

```bash
python3 python_ai/baseline_random.py --games 10000 --out python_ai/results/random_baseline.json
```

Both JSON outputs include `completed_games` and `truncated_games`; score and win-rate metrics are computed from completed games only.

## Compare eval vs baseline

```bash
python3 python_ai/compare_results.py \
  --baseline python_ai/results/random_baseline.json \
  --eval python_ai/results/eval.json \
  --target-lift 30
```

## Notes

- No REST API dependency for training/eval. The Python client spawns the Node worker process directly.
- Environment uses action masks and a rich observation including seen-card bitset.
- Primary optimization target is average score (score-first).
- Detailed internals doc: `docs/in-process-ai-training-flow.md`.
