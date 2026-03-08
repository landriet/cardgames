from __future__ import annotations

from typing import Any, Dict, List, Optional, Tuple

import gymnasium as gym
import numpy as np
from gymnasium import spaces

from bridge_client import EngineWorkerClient

# 10 player features + 16 room slot features + 4 monster-on-weapon ranks + 44 seen-card bits
OBS_SIZE = 74


class ScoundrelEnv(gym.Env[np.ndarray, int]):
    metadata = {"render_modes": ["human"]}

    def __init__(
        self,
        worker_command: Optional[List[str]] = None,
        max_episode_steps: int = 200,
        deck_seed: Optional[int] = None,
        reward_mode: str = "baseline",
        reward_debug: bool = False,
    ) -> None:
        super().__init__()
        self.client = EngineWorkerClient(command=worker_command)
        self.session_id: Optional[str] = None
        self.last_health = 20.0
        self.max_episode_steps = max_episode_steps
        self.deck_seed = deck_seed
        self.reward_mode = reward_mode
        self.reward_debug = reward_debug
        self.episode_steps = 0

        self._last_obs = np.zeros(OBS_SIZE, dtype=np.float32)
        self._last_mask = np.zeros(10, dtype=bool)
        self._step_stats: Dict[str, Any] = {
            "health": 20.0,
            "maxHealth": 20.0,
            "score": 0.0,
            "victory": False,
            "gameOver": False,
            "discardCount": 0,
            "roomCount": 0,
            "lastActionWasDefer": False,
        }

        self.action_space = spaces.Discrete(10)
        self.observation_space = spaces.Box(low=0.0, high=1.0, shape=(OBS_SIZE,), dtype=np.float32)

    def reset(self, *, seed: Optional[int] = None, options: Optional[dict] = None):
        super().reset(seed=seed)
        if self.session_id is None:
            result = self.client.create_session_rl(deck_seed=self.deck_seed)
        else:
            result = self.client.reset_session_rl(self.session_id, deck_seed=self.deck_seed)

        self._apply_snapshot(result)
        self.last_health = float(self._step_stats.get("health", 20.0))
        self.episode_steps = 0
        return self._last_obs.copy(), {}

    def step(self, action: int):
        if self.session_id is None:
            raise RuntimeError("Environment not initialized. Call reset() first.")

        action = int(action)
        if action < 0 or action >= self._last_mask.size or not bool(self._last_mask[action]):
            return self._last_obs.copy(), -1.0, False, False, {"invalid_action": True}

        prev_stats = self._step_stats.copy()
        worker_action = self._discrete_to_worker_action(action)
        result = self.client.step_action_rl(self.session_id, worker_action)
        self._apply_snapshot(result)

        self.episode_steps += 1
        terminated = bool(self._step_stats.get("gameOver") or self._step_stats.get("victory"))
        truncated = self.episode_steps >= self.max_episode_steps and not terminated
        reward, reward_components = self._compute_reward(prev_stats, self._step_stats, terminated)

        info = {
            "score": float(self._step_stats.get("score", 0.0)),
            "victory": bool(self._step_stats.get("victory", False)),
            "gameOver": bool(self._step_stats.get("gameOver", False)),
            "truncated": truncated,
        }
        if self.reward_debug:
            info["rewardComponents"] = reward_components
        return self._last_obs.copy(), reward, terminated, truncated, info

    def render(self):
        print(
            {
                "health": float(self._step_stats.get("health", 0.0)),
                "possible_actions": np.where(self._last_mask)[0].tolist(),
            }
        )

    def close(self):
        if self.session_id is not None:
            try:
                self.client.close_session(self.session_id)
            except RuntimeError:
                pass
            self.session_id = None
        self.client.stop()

    def action_masks(self) -> np.ndarray:
        return self._last_mask.copy()

    def set_deck_seed(self, deck_seed: Optional[int]) -> None:
        self.deck_seed = deck_seed

    def _apply_snapshot(self, snapshot: Dict[str, Any]) -> None:
        self.session_id = str(snapshot["sessionId"])
        self._last_obs = np.asarray(snapshot["observation"], dtype=np.float32)
        self._last_mask = np.asarray(snapshot["actionMask"], dtype=bool)
        self._step_stats = {
            "health": float(snapshot.get("health", 20.0)),
            "maxHealth": float(snapshot.get("maxHealth", 20.0)),
            "score": float(snapshot.get("score", 0.0)),
            "victory": bool(snapshot.get("victory", False)),
            "gameOver": bool(snapshot.get("gameOver", False)),
            "discardCount": int(snapshot.get("discardCount", 0)),
            "roomCount": int(snapshot.get("roomCount", 0)),
            "lastActionWasDefer": bool(snapshot.get("lastActionWasDefer", False)),
        }

    def _compute_reward(
        self,
        prev_stats: Optional[Dict[str, Any]],
        curr_stats: Dict[str, Any],
        terminated: bool,
    ) -> Tuple[float, Dict[str, float]]:
        if self.reward_mode == "baseline":
            reward = self._compute_reward_baseline(curr_stats, terminated)
            return reward, {"total": reward}
        if self.reward_mode == "dense_v1":
            return self._compute_reward_dense_v1(prev_stats, curr_stats, terminated)
        raise ValueError(f"Unsupported reward_mode: {self.reward_mode}")

    def _compute_reward_baseline(self, curr_stats: Dict[str, Any], terminated: bool) -> float:
        health = float(curr_stats.get("health", self.last_health))
        health_delta = (health - self.last_health) / max(float(curr_stats.get("maxHealth", 20)), 1.0)
        self.last_health = health

        shaped = 0.05 * health_delta
        if not terminated:
            return shaped

        score = float(curr_stats.get("score", 0.0))
        terminal = np.clip(score / 100.0, -1.0, 1.0)
        return float(terminal + shaped)

    def _compute_reward_dense_v1(
        self,
        prev_stats: Optional[Dict[str, Any]],
        curr_stats: Dict[str, Any],
        terminated: bool,
    ) -> Tuple[float, Dict[str, float]]:
        health = float(curr_stats.get("health", self.last_health))
        health_delta = (health - self.last_health) / max(float(curr_stats.get("maxHealth", 20)), 1.0)
        self.last_health = health

        health_component = 0.1 * health_delta
        discard_delta = 0
        room_transition = 0.0
        skip_penalty = 0.0

        if prev_stats is not None:
            prev_discard = int(prev_stats.get("discardCount", 0))
            curr_discard = int(curr_stats.get("discardCount", 0))
            discard_delta = max(curr_discard - prev_discard, 0)

            prev_room_len = int(prev_stats.get("roomCount", 0))
            curr_room_len = int(curr_stats.get("roomCount", 0))
            if prev_room_len > 0 and curr_room_len == 4 and prev_room_len != 4:
                room_transition = 0.02

            if (
                not bool(prev_stats.get("lastActionWasDefer", False))
                and bool(curr_stats.get("lastActionWasDefer", False))
                and prev_room_len == 4
            ):
                skip_penalty = -0.02

        resolve_component = 0.01 * float(discard_delta)
        terminal_component = 0.0
        if terminated:
            score = float(curr_stats.get("score", 0.0))
            terminal_component = float(np.clip(score / 100.0, -1.0, 1.0))

        total = float(health_component + resolve_component + room_transition + skip_penalty + terminal_component)
        components = {
            "health": float(health_component),
            "resolve": float(resolve_component),
            "roomTransition": float(room_transition),
            "skipPenalty": float(skip_penalty),
            "terminal": float(terminal_component),
            "total": total,
        }
        return total, components

    def _discrete_to_worker_action(self, action_idx: int) -> Dict[str, Any]:
        if action_idx == 0:
            return {"actionType": "enterRoom"}
        if action_idx == 1:
            return {"actionType": "skipRoom"}

        if 2 <= action_idx <= 9:
            rel = action_idx - 2
            card_idx = rel // 2
            use_weapon = rel % 2 == 1
            payload: Dict[str, Any] = {"actionType": "playCard", "cardIdx": int(card_idx)}
            payload["mode"] = "weapon" if use_weapon else "barehanded"
            return payload

        raise RuntimeError(f"No worker action mapped for discrete action index {action_idx}.")


__all__ = ["ScoundrelEnv"]
