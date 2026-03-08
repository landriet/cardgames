"""Integration tests for ScoundrelEnv using the Python engine directly.

Verifies that the env correctly initialises, steps through actions, terminates
episodes, and exposes valid observations/masks — all without any IPC subprocess.
"""

from __future__ import annotations

import numpy as np
import pytest

from scoundrel_env import OBS_SIZES, ScoundrelEnv

# Keep backward-compatible alias so existing tests that reference OBS_SIZE still work.
OBS_SIZE = OBS_SIZES[1]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_env(**kwargs) -> ScoundrelEnv:
    """Create a ScoundrelEnv with a fixed deck seed for determinism."""
    return ScoundrelEnv(deck_seed=42, **kwargs)


def _pick_valid_action(env: ScoundrelEnv) -> int:
    """Return the first valid action index from the current mask."""
    mask = env.action_masks()
    valid = np.where(mask)[0]
    assert len(valid) > 0, "No valid actions available — environment may be in a terminal state."
    return int(valid[0])


# ---------------------------------------------------------------------------
# Test: reset returns a valid observation
# ---------------------------------------------------------------------------


class TestResetReturnsValidObs:
    def test_obs_shape(self):
        env = _make_env()
        obs, info = env.reset()
        assert obs.shape == (OBS_SIZE,), f"Expected obs shape ({OBS_SIZE},), got {obs.shape}"

    def test_obs_dtype(self):
        env = _make_env()
        obs, _ = env.reset()
        assert obs.dtype == np.float32

    def test_obs_in_bounds(self):
        env = _make_env()
        obs, _ = env.reset()
        assert np.all(obs >= 0.0) and np.all(obs <= 1.0), "Observation values must be in [0, 1]."

    def test_info_is_empty_dict(self):
        env = _make_env()
        _, info = env.reset()
        assert isinstance(info, dict)

    def test_deterministic_with_same_seed(self):
        env1 = _make_env()
        env2 = _make_env()
        obs1, _ = env1.reset()
        obs2, _ = env2.reset()
        np.testing.assert_array_equal(obs1, obs2)

    def test_different_seeds_differ(self):
        env1 = ScoundrelEnv(deck_seed=1)
        env2 = ScoundrelEnv(deck_seed=2)
        obs1, _ = env1.reset()
        obs2, _ = env2.reset()
        assert not np.array_equal(obs1, obs2), "Different seeds should produce different initial observations."


# ---------------------------------------------------------------------------
# Test: step with a valid action
# ---------------------------------------------------------------------------


class TestStepWithValidAction:
    def test_step_returns_five_tuple(self):
        env = _make_env()
        env.reset()
        action = _pick_valid_action(env)
        result = env.step(action)
        assert len(result) == 5, "step() must return (obs, reward, terminated, truncated, info)."

    def test_obs_shape_after_step(self):
        env = _make_env()
        env.reset()
        obs, reward, terminated, truncated, info = env.step(_pick_valid_action(env))
        assert obs.shape == (OBS_SIZE,)

    def test_reward_is_scalar(self):
        env = _make_env()
        env.reset()
        _, reward, _, _, _ = env.step(_pick_valid_action(env))
        assert isinstance(reward, float)

    def test_terminated_and_truncated_are_bool(self):
        env = _make_env()
        env.reset()
        _, _, terminated, truncated, _ = env.step(_pick_valid_action(env))
        assert isinstance(terminated, bool)
        assert isinstance(truncated, bool)

    def test_invalid_action_returns_penalty(self):
        env = _make_env()
        env.reset()
        mask = env.action_masks()
        # Find an action that is NOT valid.
        invalid_actions = np.where(~mask)[0]
        if len(invalid_actions) == 0:
            pytest.skip("All actions are valid in this state — cannot test invalid action.")
        _, reward, terminated, truncated, info = env.step(int(invalid_actions[0]))
        assert reward == -1.0
        assert not terminated
        assert not truncated
        assert info.get("invalid_action") is True

    def test_step_before_reset_raises(self):
        env = ScoundrelEnv(deck_seed=42)
        with pytest.raises(RuntimeError, match="reset"):
            env.step(0)


# ---------------------------------------------------------------------------
# Test: full episode completes
# ---------------------------------------------------------------------------


class TestFullEpisodeCompletes:
    def test_episode_terminates(self):
        """Play a full episode greedily (always first valid action) and confirm termination."""
        env = _make_env(max_episode_steps=500)
        env.reset()
        terminated = False
        truncated = False
        steps = 0
        while not terminated and not truncated:
            action = _pick_valid_action(env)
            _, _, terminated, truncated, _ = env.step(action)
            steps += 1
            assert steps <= 500, "Episode did not terminate within 500 steps."
        assert terminated or truncated

    def test_episode_info_has_score_on_terminal(self):
        """On a terminal step the info dict must carry a numeric score."""
        env = _make_env(max_episode_steps=500)
        env.reset()
        last_info: dict = {}
        terminated = False
        truncated = False
        while not terminated and not truncated:
            action = _pick_valid_action(env)
            _, _, terminated, truncated, last_info = env.step(action)
        assert "score" in last_info
        assert isinstance(last_info["score"], float)

    def test_reset_after_episode(self):
        """env.reset() after a completed episode should return a valid obs."""
        env = _make_env(max_episode_steps=500)
        env.reset()
        terminated = False
        truncated = False
        while not terminated and not truncated:
            _, _, terminated, truncated, _ = env.step(_pick_valid_action(env))
        obs, _ = env.reset()
        assert obs.shape == (OBS_SIZE,)
        assert np.all(obs >= 0.0) and np.all(obs <= 1.0)


# ---------------------------------------------------------------------------
# Test: action_masks shape and validity
# ---------------------------------------------------------------------------


class TestActionMasksShape:
    def test_mask_shape(self):
        env = _make_env()
        env.reset()
        mask = env.action_masks()
        assert mask.shape == (10,), f"Expected mask shape (10,), got {mask.shape}"

    def test_mask_dtype(self):
        env = _make_env()
        env.reset()
        mask = env.action_masks()
        assert mask.dtype == bool

    def test_mask_has_at_least_one_valid_action(self):
        env = _make_env()
        env.reset()
        mask = env.action_masks()
        assert mask.any(), "At least one action must be valid after reset."

    def test_mask_returns_copy(self):
        """action_masks() must return a fresh array, not a reference to internal state."""
        env = _make_env()
        env.reset()
        mask1 = env.action_masks()
        mask2 = env.action_masks()
        assert mask1 is not mask2


# ---------------------------------------------------------------------------
# Test: reward modes
# ---------------------------------------------------------------------------


class TestRewardModes:
    def _run_episode(self, reward_mode: str) -> list[float]:
        env = ScoundrelEnv(deck_seed=99, reward_mode=reward_mode, max_episode_steps=500)
        env.reset()
        rewards: list[float] = []
        terminated = False
        truncated = False
        while not terminated and not truncated:
            action = _pick_valid_action(env)
            _, reward, terminated, truncated, _ = env.step(action)
            rewards.append(reward)
        return rewards

    def test_baseline_mode_produces_rewards(self):
        rewards = self._run_episode("baseline")
        assert len(rewards) > 0
        # All intermediate rewards should be small (health-shaped: ±0.05 per step max)
        non_terminal = rewards[:-1]
        for r in non_terminal:
            assert abs(r) <= 0.1, f"Unexpectedly large intermediate reward in baseline mode: {r}"

    def test_dense_v1_mode_produces_rewards(self):
        rewards = self._run_episode("dense_v1")
        assert len(rewards) > 0

    def test_unsupported_mode_raises(self):
        env = ScoundrelEnv(deck_seed=42, reward_mode="nonexistent")
        env.reset()
        with pytest.raises(ValueError, match="Unsupported reward_mode"):
            env.step(_pick_valid_action(env))

    def test_baseline_and_dense_v1_differ(self):
        """The two reward modes should produce at least slightly different reward sequences."""
        r_baseline = self._run_episode("baseline")
        r_dense = self._run_episode("dense_v1")
        # Both use the same seed so episodes should have the same length.
        assert len(r_baseline) == len(r_dense)
        # They should not be identical.
        assert r_baseline != r_dense, "baseline and dense_v1 reward sequences should differ."

    def test_reward_debug_attaches_components(self):
        env = ScoundrelEnv(deck_seed=42, reward_mode="dense_v1", reward_debug=True, max_episode_steps=500)
        env.reset()
        _, _, _, _, info = env.step(_pick_valid_action(env))
        assert "rewardComponents" in info
        components = info["rewardComponents"]
        assert "total" in components
        assert "health" in components


# ---------------------------------------------------------------------------
# Test: obs_version parameter (v1 / v2)
# ---------------------------------------------------------------------------


class TestObsV2Integration:
    """Test ScoundrelEnv with obs_version=2 (84-dim observation)."""

    def test_v2_obs_shape(self):
        env = ScoundrelEnv(obs_version=2)
        obs, _ = env.reset()
        assert obs.shape == (84,), f"Expected obs shape (84,), got {obs.shape}"

    def test_v2_obs_space(self):
        env = ScoundrelEnv(obs_version=2)
        assert env.observation_space.shape == (84,)

    def test_v2_step_obs_shape(self):
        env = ScoundrelEnv(obs_version=2)
        obs, _ = env.reset()
        mask = env.action_masks()
        action = int(np.where(mask)[0][0])
        obs2, _, _, _, _ = env.step(action)
        assert obs2.shape == (84,), f"Expected obs shape (84,) after step, got {obs2.shape}"

    def test_v1_default_unchanged(self):
        """Default obs_version=1 must still produce a 74-dim observation."""
        env = ScoundrelEnv()
        obs, _ = env.reset()
        assert obs.shape == (74,), f"Expected default obs shape (74,), got {obs.shape}"

    def test_v2_full_episode(self):
        """Play a full episode with obs_version=2 and confirm all obs are 84-dim."""
        env = ScoundrelEnv(obs_version=2)
        obs, _ = env.reset()
        assert obs.shape == (84,)
        done = False
        steps = 0
        while not done and steps < 200:
            mask = env.action_masks()
            action = int(np.where(mask)[0][0])
            obs, _, terminated, truncated, _ = env.step(action)
            done = terminated or truncated
            steps += 1
            assert obs.shape == (84,), f"Step {steps}: expected obs shape (84,), got {obs.shape}"
