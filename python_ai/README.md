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

Parallel training (default already auto-detects workers as `cpu_count - 1`):

```bash
python3 python_ai/train_ppo.py \
  --resume-from python_ai/models/ai4.zip \
  --timesteps 1000000 \
  --num-envs 8 \
  --vec-env subproc \
  --start-method spawn \
  --model-out python_ai/models/ai4
```

Resume training from an existing checkpoint:

```bash
python3 python_ai/train_ppo.py --resume-from python_ai/models/ai4.zip --timesteps 1000000 --model-out python_ai/models/ai4
```

## Evaluate trained model

```bash
python3 python_ai/evaluate_agent.py --model python_ai/models/scoundrel_maskable_ppo.zip --games 10000 --out python_ai/results/eval.json
```

Parallel evaluation:

```bash
python3 python_ai/evaluate_agent.py \
  --model python_ai/models/scoundrel_maskable_ppo.zip \
  --games 10000 \
  --num-envs 8 \
  --vec-env subproc \
  --start-method spawn \
  --out python_ai/results/eval.json
```

## Random baseline

```bash
python3 python_ai/baseline_random.py --games 10000 --out python_ai/results/random_baseline.json
```

Parallel baseline:

```bash
python3 python_ai/baseline_random.py \
  --games 10000 \
  --num-envs 8 \
  --vec-env subproc \
  --start-method spawn \
  --out python_ai/results/random_baseline.json
```

Both JSON outputs include `completed_games` and `truncated_games`; score and win-rate metrics are computed from completed games only.

## Compare eval vs baseline

```bash
python3 python_ai/compare_results.py \
  --baseline python_ai/results/random_baseline.json \
  --eval python_ai/results/eval.json \
  --target-lift 30
```

## Watch one full agent game (step-by-step)

```bash
python3 python_ai/watch_agent_game.py \
  --model python_ai/models/scoundrel_maskable_ppo.zip \
  --seed 42 \
  --sleep 0.2
```

Use `--stochastic` if you want sampled (non-deterministic) actions.

## Notes

- No REST API dependency for training/eval. The Python client spawns the Node worker process directly.
- `--num-envs` defaults to `cpu_count - 1` (min `1`).
- `--vec-env` defaults to `subproc` when `num_envs > 1`, otherwise `dummy`.
- With parallel training, PPO per-env `n_steps` is scaled to keep total rollout size close to the previous single-env default.
- Environment uses action masks and a rich observation including seen-card bitset.
- Primary optimization target is average score (score-first).
- Detailed internals doc: `docs/in-process-ai-training-flow.md`.
