# In-Process AI Training and Evaluation Flow

This document explains the full RL pipeline used in this branch, from command execution to worker RPC, action masking, rewards, and result interpretation.

## 1) What Runs Where

- Python (`python_ai/`) handles RL training, evaluation, and baselines.
- Node/TypeScript (`src/engine-lib/worker/`) hosts the game engine worker process.
- Communication is newline-delimited JSON over stdin/stdout (NDJSON), not HTTP.

## 2) Entrypoints

### Commands

- `npm run ai:train -- --timesteps <n> --model-out <path>`
- `npm run ai:train -- --resume-from <model.zip> --timesteps <n> --model-out <path>`
- `npm run ai:eval -- --model <model.zip> --games <n> --out <path>`
- `npm run ai:baseline -- --games <n> --out <path>`
- `npm run ai:compare -- --baseline <path> --eval <path> --target-lift <pct>`
- `npm run engine:worker` (manual worker run)

### Script files

- Training: `python_ai/train_ppo.py`
- Evaluation: `python_ai/evaluate_agent.py`
- Random baseline: `python_ai/baseline_random.py`
- Result comparison: `python_ai/compare_results.py`
- Env: `python_ai/scoundrel_env.py`
- Python worker client: `python_ai/bridge_client.py`

## 3) Worker Protocol

Defined in `src/engine-lib/worker/protocol.ts`.

Request envelope:

```json
{
  "id": "uuid",
  "method": "create_session",
  "params": {}
}
```

Success response:

```json
{
  "id": "uuid",
  "ok": true,
  "result": { "...": "..." }
}
```

Error response:

```json
{
  "id": "uuid",
  "ok": false,
  "error": { "code": "WORKER_ERROR", "message": "..." }
}
```

Supported methods:

- `health`
- `create_session`
- `reset_session`
- `get_state`
- `get_possible_actions`
- `step_action`
- `close_session`

## 4) Session Lifecycle

1. Python env calls `create_session` on reset.
2. Worker creates a game state via adapter `initGame()`.
3. Worker returns `sessionId`, `state`, `possibleActions`.
4. Each step sends `step_action` with the selected action.
5. Worker validates legality, applies action, and returns next state + next legal actions.
6. At end, env calls `close_session` and worker deletes in-memory session.

## 5) Canonical Engine Path

Worker logic is in `src/engine-lib/worker/engineWorkerService.ts` and uses adapter functions from `src/features/scoundrel/logic/engineAdapter.ts`:

- `initGame`
- `enterRoom`
- `avoidRoom`
- `handleCardAction`
- `getPossibleActions`

This keeps worker gameplay behavior aligned with the frontend adapter path.

## 6) Legal Actions and Masking

The environment action space is `Discrete(10)`:

- `0` = `enterRoom`
- `1` = `skipRoom`
- `2..9` = `playCard` variants by room slot and mode

Action masking flow:

1. Env receives canonical legal actions from worker.
2. Env converts each legal action to a discrete index.
3. `action_masks()` returns a boolean mask of legal indices.
4. `MaskablePPO` samples only from legal actions.

Important behavior:

- Discrete -> worker action conversion is resolved from current legal action payloads (not guessed), so mode handling is always valid.

## 7) Observation Encoding

Implemented in `python_ai/scoundrel_env.py::_encode_state`.

Observation size: 74 floats.

Sections:

1. Player/game summary features (10 values)
2. Room card features (4 slots x 4 values = 16)
3. Monsters-on-weapon ranks (4 values)
4. Seen-card bitset over canonical 44-card deck (44 values)

Seen-card bitset updates from:

- `discard`
- `currentRoom.cards`
- `equippedWeapon`
- `monstersOnWeapon`

## 8) Reward Function

Implemented in `python_ai/scoundrel_env.py::_compute_reward`.

- Intermediate shaping: small normalized health delta bonus/penalty.
- Terminal reward: score-based term (`score / 100`, clipped to `[-1, 1]`) plus shaping.

This is score-first optimization.

## 9) Episode Termination

The env returns `terminated=True` when game has `victory` or `gameOver`.

It also applies a truncation guard via `max_episode_steps` (default `200`) to prevent pathological long episodes:

- `truncated=True` if step cap is reached before terminal state.

## 10) Training Loop Internals

`python_ai/train_ppo.py`:

1. Builds env with `ActionMasker`.
2. Creates a new `MaskablePPO(MlpPolicy, ...)` model, or loads an existing checkpoint when `--resume-from` is provided.
3. Runs `model.learn(total_timesteps=...)`.
4. Saves model zip at `--model-out`.
5. Runs a small deterministic post-save sanity rollout.

## 11) Evaluation Flow

`python_ai/evaluate_agent.py`:

1. Loads model zip.
2. Runs `N` episodes with deterministic policy and legal action masks.
3. Stores JSON metrics:
   - `avg_score`
   - `median_score`
   - `win_rate`
   - `scores`

## 12) Random Baseline Flow

`python_ai/baseline_random.py`:

1. Runs same env and termination logic.
2. Chooses random action from legal mask each step.
3. Writes same metrics schema as eval.

## 13) How to Compare Results

Given:

- `python_ai/results/random_*.json`
- `python_ai/results/eval_*.json`

Primary metric:

- `avg_score`

Lift formula:

```text
lift_pct = (eval_avg_score - random_avg_score) / abs(random_avg_score) * 100
```

Interpretation:

- Positive lift = trained policy beats random baseline.
- Target for current milestone: at least +30% avg-score lift.

Helper command:

```bash
npm run ai:compare -- --baseline python_ai/results/random_baseline.json --eval python_ai/results/eval.json --target-lift 30
```

The compare script prints:

- baseline/eval average score
- score lift percentage
- baseline/eval win rates
- target PASS/FAIL status

## 14) Troubleshooting

### `TypeError: Object of type int64 is not JSON serializable`

- Cause: NumPy integer sent directly in JSON payload.
- Fix: cast action to Python `int` before request.

### `Illegal action for current state`

- Cause: discrete action mapped to invalid worker payload.
- Fix: map discrete action by reusing current legal action payloads from worker.

### Eval hangs or takes too long

- Cause: no hard episode cap.
- Fix: enforce `max_episode_steps` truncation in env.

### `python: command not found`

- Use `python3` scripts and virtualenv created with `python3 -m venv`.

## 15) Suggested Run Sequence

1. `source .venv/bin/activate`
2. `npm run ai:train -- --timesteps 10000 --model-out python_ai/models/smoke_ppo`
3. `npm run ai:baseline -- --games 200 --out python_ai/results/random_smoke.json`
4. `npm run ai:eval -- --model python_ai/models/smoke_ppo.zip --games 200 --out python_ai/results/eval_smoke.json`
5. `npm run ai:compare -- --baseline python_ai/results/random_smoke.json --eval python_ai/results/eval_smoke.json --target-lift 30`

Resume training from a saved checkpoint:

```bash
npm run ai:train -- --resume-from python_ai/models/smoke_ppo.zip --timesteps 50000 --model-out python_ai/models/smoke_ppo
```

For serious training runs, increase to `--timesteps 1000000` and `--games 10000` for eval/baseline.
