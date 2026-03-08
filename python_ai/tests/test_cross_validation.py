"""Cross-validation tests: Python engine vs TypeScript engine.

Both engines are initialised with identical deck seeds and driven with
identical random action sequences (selected by sampling the Python action
mask).  At every step the test asserts that observation, action mask,
health, score, gameOver, and victory match between the two engines.

The TypeScript engine (via bridge_client.EngineWorkerClient) is the
source of truth.
"""

from __future__ import annotations

import random
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional

import numpy as np
import numpy.testing as npt
import pytest

# ---------------------------------------------------------------------------
# Make sure the python_ai package root is on sys.path so `engine` and
# `bridge_client` can be imported without installation.
# ---------------------------------------------------------------------------
_PYTHON_AI_ROOT = Path(__file__).resolve().parents[1]
if str(_PYTHON_AI_ROOT) not in sys.path:
    sys.path.insert(0, str(_PYTHON_AI_ROOT))

from bridge_client import EngineWorkerClient  # noqa: E402
from engine import (  # noqa: E402
    Action,
    build_action_mask,
    calculate_score,
    encode_observation,
    enter_room,
    avoid_room,
    get_legal_actions,
    init_game,
    play_card,
)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# Seeds used for cross-validation games.
SEEDS: List[int] = list(range(20))  # seeds 0–19

# Maximum steps per game to avoid infinite loops on pathological seeds.
MAX_STEPS = 200

# Floating-point tolerance for observation comparison.
OBS_ATOL = 1e-6


# ---------------------------------------------------------------------------
# Action index → TS bridge action helper
# ---------------------------------------------------------------------------


def _discrete_to_ts_action(action_idx: int) -> Dict[str, Any]:
    """Convert a discrete action index (0-9) to a TS worker action dict."""
    if action_idx == 0:
        return {"actionType": "enterRoom"}
    if action_idx == 1:
        return {"actionType": "skipRoom"}
    # Indices 2-9 map to card plays.
    card_idx = (action_idx - 2) // 2
    mode = "weapon" if (action_idx - 2) % 2 == 1 else "barehanded"
    return {"actionType": "playCard", "cardIdx": card_idx, "mode": mode}


def _discrete_to_py_action(action_idx: int) -> Action:
    """Convert a discrete action index (0-9) to a Python Action object."""
    if action_idx == 0:
        return Action(action_type="enterRoom")
    if action_idx == 1:
        return Action(action_type="skipRoom")
    card_idx = (action_idx - 2) // 2
    mode = "weapon" if (action_idx - 2) % 2 == 1 else "barehanded"
    return Action(action_type="playCard", card_index=card_idx, mode=mode)


def _apply_py_action(state, action: Action):
    """Dispatch a Python Action to the correct engine function."""
    if action.action_type == "enterRoom":
        return enter_room(state)
    if action.action_type == "skipRoom":
        return avoid_room(state)
    if action.action_type == "playCard":
        return play_card(state, card_index=action.card_index, mode=action.mode)
    raise ValueError(f"Unknown action type: {action.action_type}")


# ---------------------------------------------------------------------------
# Module-scoped TS client fixture (started once per test session)
# ---------------------------------------------------------------------------


@pytest.fixture(scope="module")
def ts_client() -> EngineWorkerClient:
    """Start the TypeScript engine worker once and tear it down after all tests."""
    client = EngineWorkerClient()
    client.start()
    yield client
    client.stop()


# ---------------------------------------------------------------------------
# Helper: play one game with both engines in lock-step
# ---------------------------------------------------------------------------


def _run_cross_validation_game(
    seed: int,
    ts_client: EngineWorkerClient,
    rng: random.Random,
) -> None:
    """Run a single game with seed *seed*, asserting agreement at every step.

    Parameters
    ----------
    seed:
        Deck seed passed to both engines.
    ts_client:
        Already-started TS engine worker client.
    rng:
        Seeded Python Random instance used to pick among legal actions so that
        the sequence is deterministic and reproducible.
    """
    # --- Initialise both engines ---
    py_state = init_game(seed=seed)
    ts_snap = ts_client.create_session_rl(deck_seed=seed)
    session_id: str = ts_snap["sessionId"]

    try:
        for step in range(MAX_STEPS):
            # --- Encode Python side ---
            py_obs = encode_observation(py_state)
            py_mask = build_action_mask(py_state)
            py_score = calculate_score(py_state)

            # --- Extract TS side ---
            ts_obs = np.array(ts_snap["observation"], dtype=np.float32)
            ts_mask = np.array(ts_snap["actionMask"], dtype=bool)
            ts_score = ts_snap["score"]
            ts_health = ts_snap["health"]
            ts_game_over = ts_snap["gameOver"]
            ts_victory = ts_snap["victory"]

            # --- Assert agreement ---
            assert py_state.health == ts_health, (
                f"seed={seed} step={step}: health mismatch "
                f"py={py_state.health} ts={ts_health}"
            )
            assert py_state.game_over == ts_game_over, (
                f"seed={seed} step={step}: gameOver mismatch "
                f"py={py_state.game_over} ts={ts_game_over}"
            )
            assert py_state.victory == ts_victory, (
                f"seed={seed} step={step}: victory mismatch "
                f"py={py_state.victory} ts={ts_victory}"
            )
            # The TS engine only populates `score` on terminal states
            # (gameOver or victory); for in-progress states it returns 0.
            # We therefore only compare score once the game is terminal.
            if py_state.game_over or py_state.victory:
                assert py_score == ts_score, (
                    f"seed={seed} step={step}: score mismatch "
                    f"py={py_score} ts={ts_score}"
                )
            npt.assert_array_equal(
                py_mask,
                ts_mask,
                err_msg=(
                    f"seed={seed} step={step}: actionMask mismatch\n"
                    f"  py={py_mask.tolist()}\n  ts={ts_mask.tolist()}"
                ),
            )
            npt.assert_allclose(
                py_obs,
                ts_obs,
                atol=OBS_ATOL,
                err_msg=(
                    f"seed={seed} step={step}: observation mismatch\n"
                    f"  py={py_obs.tolist()}\n  ts={ts_obs.tolist()}"
                ),
            )

            # --- Terminal check ---
            if py_state.game_over or py_state.victory:
                break

            # --- Pick a random legal action ---
            legal_indices = [i for i, m in enumerate(py_mask) if m]
            assert len(legal_indices) > 0, (
                f"seed={seed} step={step}: no legal actions but game is not terminal"
            )
            chosen_idx = rng.choice(legal_indices)

            ts_action = _discrete_to_ts_action(chosen_idx)
            py_action = _discrete_to_py_action(chosen_idx)

            # --- Step both engines ---
            py_state = _apply_py_action(py_state, py_action)
            ts_snap = ts_client.step_action_rl(session_id, ts_action)

    finally:
        # Always clean up the TS session.
        try:
            ts_client.close_session(session_id)
        except Exception:
            pass


# ---------------------------------------------------------------------------
# Parametrised test
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("seed", SEEDS)
def test_cross_validation_seed(seed: int, ts_client: EngineWorkerClient) -> None:
    """Play one full game for *seed* through both engines and assert agreement."""
    # Use a fixed per-seed RNG so that action choices are reproducible.
    rng = random.Random(seed + 10_000)
    _run_cross_validation_game(seed=seed, ts_client=ts_client, rng=rng)
