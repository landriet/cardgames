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

Stronger training run with periodic eval/checkpoints and schedules:

```bash
python3 python_ai/train_ppo.py \
  --timesteps 3000000 \
  --model-out python_ai/models/scoundrel_maskable_ppo \
  --save-freq 100000 \
  --eval-freq 100000 \
  --eval-games 200 \
  --eval-seeds 101,202,303,404,505,606,707,808 \
  --lr-start 3e-4 \
  --lr-end 1e-4 \
  --ent-start 0.02 \
  --ent-end 0.002 \
  --num-envs 8 \
  --vec-env subproc \
  --start-method spawn \
  --reward-mode dense_v1
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

Deterministic deck comparison (same deck as frontend `?seed=<N>`):

```bash
python3 python_ai/evaluate_agent.py \
  --model python_ai/models/scoundrel_maskable_ppo.zip \
  --games 1000 \
  --deck-seed 123 \
  --out python_ai/results/eval_seed_123.json
```

Multi-seed deterministic deck evaluation with confidence intervals:

```bash
python3 python_ai/evaluate_agent.py \
  --model python_ai/models/scoundrel_maskable_ppo.zip \
  --games 200 \
  --seed-list 101,202,303,404,505,606,707,808 \
  --reward-mode dense_v1 \
  --out python_ai/results/eval_multiseed.json
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
  --deck-seed 123 \
  --reward-mode dense_v1 \
  --sleep 0.2
```

Use `--stochastic` if you want sampled (non-deterministic) actions.

## Notes

- No REST API dependency for training/eval. The Python client spawns the Node worker process directly.
- `--num-envs` defaults to `cpu_count - 1` (min `1`).
- `--vec-env` defaults to `subproc` when `num_envs > 1`, otherwise `dummy`.
- With parallel training, PPO per-env `n_steps` is scaled to keep total rollout size close to the previous single-env default.
- Environment uses action masks and a rich observation including seen-card bitset.
- Reward modes:
  - `baseline` (existing score-first objective),
  - `dense_v1` (score-first terminal + denser shaping).
- Primary optimization target is average score (score-first), with win-rate used as tie-breaker for best checkpoint selection.
- Detailed internals doc: `docs/in-process-ai-training-flow.md`.
