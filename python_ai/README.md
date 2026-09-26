# Scoundrel RL

Python training stack using `sb3-contrib` MaskablePPO with a pure Python game engine (`engine.py`). The Python engine is a training-only replica of the TypeScript engine, cross-validated for correctness — no subprocess or IPC overhead.

## Architecture

```
python_ai/
  engine.py              # Pure Python Scoundrel engine (state machine + obs encoding)
  scoundrel_env.py       # Gymnasium env wrapping engine.py directly
  train_ppo.py           # MaskablePPO training with eval/checkpointing
  evaluate_agent.py      # Evaluate trained models with CI metrics
  baseline_random.py     # Random legal-action baseline
  compare_results.py     # Compare eval vs baseline metrics
  watch_agent_game.py    # Step-by-step game visualization (uses Python env)
  bridge_client.py       # IPC client to TS engine (used by cross-validation tests)
  vec_env_utils.py       # Vectorized env construction helpers
  utils.py               # Shared utilities (bootstrap CI)
  tests/
    test_engine.py             # Python engine unit tests
    test_game_variants.py      # Registry, rules, aliases, and v3 observations
    test_bridge_variants.py    # RL bridge request shape
    test_cross_validation.py   # Seeded cross-validation tests (Python vs TS)
    test_env_integration.py    # ScoundrelEnv integration tests
```

The Python engine replicates the TS engine's mulberry32 PRNG, deck creation, game rules, observation encoding, and action masking. Both engines load the same game variant registry and use the same effective rule settings.

## Game variants and rules

The shared registry is `src/engine-lib/src/game-variants.json`. It defines the base deck, named variants' added and removed cards, and rule overrides. Edit that file to add or change deck variants; both engines validate and read it directly. Python's `get_game_variant(variant_id)` returns the resolved cards and rules for a registered variant.

Select a variant with `--variant queen_hearts` or `--variant jack_diamonds`. The older `--deck-variant` option remains an alias. The Python API likewise prefers `variant_id` and still accepts `deck_variant` on deck creation, game initialization, environments, and training/evaluation helpers.

The current configurable rules are `startingHealth`, `maxHealth`, `potionsPerRoom`, `canSkipRooms`, `canSkipConsecutive`, and `weaponKillLimit`. Use `init_game(..., rules_override={...})` to test rule combinations. Adding a new rule or game mechanic requires implementation and tests in both the TypeScript and Python engines; adding a registry field alone does not change gameplay.

Observation v1 (74 features) and v2 (84 features) keep their existing shapes for saved models. Use v3 (98 features) for all 52 suit/rank identities, active-variant deck features, and effective-rule features. Example:

```bash
python3 python_ai/evaluate_agent.py \
  --model python_ai/models/scoundrel_maskable_ppo.zip \
  --variant jack_diamonds \
  --obs-version 3 \
  --games 1000
```

## Setup

```bash
cd python_ai
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
npm install  # needed for TS engine cross-validation tests
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

Evaluate the existing 74-feature model on the Queen of Hearts variant:

```bash
cd python_ai
.venv/bin/python evaluate_agent.py \
  --model models/p_dense_v2_30M.zip \
  --games 200 \
  --seed-list 101,202,303,404,505,606,707,808 \
  --deck-variant queen_hearts \
  --obs-version 1 \
  --out results/p_dense_v2_30M_queen_hearts.json
```

The command prints aggregate win/score metrics and a per-seed table. The `--out` JSON file retains the full per-game scores and details.

Evaluate the existing model with J♦ added as a rank-11 weapon:

```bash
cd python_ai
.venv/bin/python evaluate_agent.py \
  --model models/p_dense_v2_30M.zip \
  --games 200 \
  --seed-list 101,202,303,404,505,606,707,808 \
  --deck-variant jack_diamonds \
  --obs-version 1 \
  --out results/p_dense_v2_30M_jack_diamonds.json
```

Fine-tune that checkpoint on the variant while keeping its compatible 74-feature observation:

```bash
cd python_ai
.venv/bin/python train_ppo.py \
  --resume-from models/p_dense_v2_30M.zip \
  --timesteps 5000000 \
  --model-out models/p_dense_v2_queen_hearts_5M \
  --save-dir models/p_dense_v2_queen_hearts_5M_artifacts \
  --seed 12 \
  --num-envs 8 \
  --vec-env subproc \
  --start-method spawn \
  --eval-freq 500000 \
  --eval-games 20 \
  --num-eval-seeds 8 \
  --reward-mode dense_v2 \
  --obs-version 1 \
  --deck-variant queen_hearts
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

## Tests

```bash
cd python_ai
.venv/bin/python -m pytest tests/ -v
```

Cross-validation tests require Node.js (they run the TS engine via `bridge_client` for comparison).

## Notes

- Training and evaluation use the pure Python engine — no Node.js subprocess needed.
- Cross-validation tests use the TS bridge (`bridge_client.py`); `watch_agent_game.py` uses the pure-Python environment.
- `--num-envs` defaults to `cpu_count - 1` (min `1`).
- `--vec-env` defaults to `subproc` when `num_envs > 1`, otherwise `dummy`.
- With parallel training, PPO per-env `n_steps` is scaled to keep total rollout size close to the previous single-env default.
- Environment uses action masks and a rich observation including seen-card bitset.
- Observation versions:
  - `--obs-version 1` (default): 74-dim vector (player stats, room features, seen-card bits).
  - `--obs-version 2`: 84-dim vector (v1 + unseen card counts, weapon effectiveness, health risk, deck progress, survival margin).
  - `--obs-version 3`: 98-dim vector (bounded player features, all suit/rank seen bits, variant-aware derived features, and effective rules).
- Reward modes:
  - `baseline` (existing score-first objective),
  - `dense_v1` (score-first terminal + denser shaping),
  - `dense_v2` (better terminal scaling /40, weapon-use bonus, survival bonus, victory bonus, no skip penalty).
- Primary optimization target is average score (score-first), with win-rate used as tie-breaker for best checkpoint selection.
- When game rules change, update both engines and run cross-validation tests to ensure parity.
