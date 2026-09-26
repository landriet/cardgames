from __future__ import annotations

from typing import Any, Dict, Optional, Tuple

import gymnasium as gym
import numpy as np
from gymnasium import spaces

from engine import (
    DeckVariant,
    GameState,
    avoid_room,
    build_action_mask,
    calculate_score,
    encode_observation,
    encode_observation_v2,
    enter_room,
    encode_observation_v3,
    init_game,
    play_card,
    resolve_game_variant_id,
)

# Observation sizes keyed by version:
#   v1 (74): 10 player + 16 room slot + 4 monster-on-weapon ranks + 44 seen-card bits
#   v2 (84): v1 + 10 additional room-context features
#   v3 (98): full card identities, variant deck features, and effective rules
OBS_SIZES: dict[int, int] = {1: 74, 2: 84, 3: 98}


class ScoundrelEnv(gym.Env[np.ndarray, int]):
    metadata = {"render_modes": ["human"]}

    def __init__(
        self,
        max_episode_steps: int = 200,
        deck_seed: Optional[int] = None,
        reward_mode: str = "baseline",
        reward_debug: bool = False,
        obs_version: int = 1,
        variant_id: Optional[str] = None,
        deck_variant: Optional[DeckVariant] = None,
    ) -> None:
        super().__init__()
        if obs_version not in OBS_SIZES:
            raise ValueError(f"Unsupported obs_version: {obs_version}. Must be one of {sorted(OBS_SIZES.keys())}.")
        resolved_variant = resolve_game_variant_id(variant_id, deck_variant)
        self.obs_version = obs_version
        self.variant_id = resolved_variant
        self.deck_variant = resolved_variant  # compatibility alias for existing callers
        obs_size = OBS_SIZES[obs_version]
        self._state: Optional[GameState] = None
        self.last_health = 20.0
        self.max_episode_steps = max_episode_steps
        self.deck_seed = deck_seed
        self.reward_mode = reward_mode
        self.reward_debug = reward_debug
        self.episode_steps = 0

        self._last_obs = np.zeros(obs_size, dtype=np.float32)
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
        self.observation_space = spaces.Box(low=0.0, high=1.0, shape=(obs_size,), dtype=np.float32)

    def reset(self, *, seed: Optional[int] = None, options: Optional[dict] = None):
        super().reset(seed=seed)
        game_seed = self.deck_seed
        if game_seed is None:
            game_seed = seed if seed is not None else int(self.np_random.integers(0, 2**32, dtype=np.uint32))
        self._state = init_game(seed=game_seed, variant_id=self.variant_id)
        self._sync_from_state(self._state)
        self.last_health = float(self._step_stats["health"])
        self.episode_steps = 0
        return self._last_obs.copy(), {}

    def step(self, action: int):
        if self._state is None:
            raise RuntimeError("Environment not initialized. Call reset() first.")

        action = int(action)
        if action < 0 or action >= self._last_mask.size or not bool(self._last_mask[action]):
            return self._last_obs.copy(), -1.0, False, False, {"invalid_action": True}

        prev_stats = self._step_stats.copy()

        # Apply the action to get a new state.
        self._state = self._apply_discrete_action(self._state, action)
        self._sync_from_state(self._state)

        self.episode_steps += 1
        terminated = bool(self._step_stats.get("gameOver") or self._step_stats.get("victory"))
        truncated = self.episode_steps >= self.max_episode_steps and not terminated
        reward, reward_components = self._compute_reward(prev_stats, self._step_stats, terminated)

        info: Dict[str, Any] = {
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
        self._state = None

    def action_masks(self) -> np.ndarray:
        return self._last_mask.copy()

    def set_deck_seed(self, deck_seed: Optional[int]) -> None:
        self.deck_seed = deck_seed

    def _apply_discrete_action(self, state: GameState, action_idx: int) -> GameState:
        """Translate a discrete action index (0–9) into an engine call and return the new state."""
        if action_idx == 0:
            return enter_room(state)
        if action_idx == 1:
            return avoid_room(state)

        # action_idx 2–9: play card
        # rel = 0..7; card_index = rel // 2; weapon = rel % 2 == 1
        rel = action_idx - 2
        card_index = rel // 2
        mode = "weapon" if rel % 2 == 1 else "barehanded"
        return play_card(state, card_index=card_index, mode=mode)

    def _sync_from_state(self, state: GameState) -> None:
        """Recompute obs vector, action mask, and step stats from a GameState."""
        terminal = state.game_over or state.victory
        if self.obs_version == 2:
            self._last_obs = encode_observation_v2(state)
        elif self.obs_version == 3:
            self._last_obs = encode_observation_v3(state)
        else:
            self._last_obs = encode_observation(state)
        self._last_mask = build_action_mask(state)
        self._step_stats = {
            "health": float(state.health),
            "maxHealth": float(state.max_health),
            # Score is only meaningful (and expensive to compute) at terminal states.
            "score": float(calculate_score(state)) if terminal else 0.0,
            "victory": state.victory,
            "gameOver": state.game_over,
            "discardCount": len(state.discard),
            "roomCount": len(state.room),
            "lastActionWasDefer": state.last_action_was_defer,
            "hasWeapon": state.equipped_weapon is not None,
            "weaponMonsterCount": len(state.monsters_on_weapon),
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
        if self.reward_mode == "dense_v2":
            return self._compute_reward_dense_v2(prev_stats, curr_stats, terminated)
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

    def _compute_reward_dense_v2(
        self,
        prev_stats: Optional[Dict[str, Any]],
        curr_stats: Dict[str, Any],
        terminated: bool,
    ) -> Tuple[float, Dict[str, float]]:
        health = float(curr_stats.get("health", self.last_health))
        health_delta = (health - self.last_health) / max(float(curr_stats.get("maxHealth", 20)), 1.0)
        self.last_health = health

        # Larger health coefficient than dense_v1 (0.15 vs 0.10) to make
        # damage avoidance a stronger signal without overpowering the terminal reward.
        health_component = 0.15 * health_delta

        # Weapon-use bonus: reward equipping a new weapon and landing hits with it.
        weapon_component = 0.0
        if prev_stats is not None:
            prev_weapon = bool(prev_stats.get("hasWeapon", False))
            curr_weapon = bool(curr_stats.get("hasWeapon", False))
            if not prev_weapon and curr_weapon:
                # Agent just equipped a weapon this step.
                weapon_component = 0.03

            prev_weapon_monsters = int(prev_stats.get("weaponMonsterCount", 0))
            curr_weapon_monsters = int(curr_stats.get("weaponMonsterCount", 0))
            if curr_weapon_monsters > prev_weapon_monsters:
                # Weapon was used to kill a monster.
                weapon_component += 0.02

        # Small per-step survival bonus to encourage longer, healthier play.
        survival_component = 0.005 if not terminated else 0.0

        # Resolve bonus: reward actually playing/discarding cards (same as dense_v1,
        # but without any skip penalty — this mode does not discourage deferring).
        resolve_component = 0.0
        if prev_stats is not None:
            prev_discard = int(prev_stats.get("discardCount", 0))
            curr_discard = int(curr_stats.get("discardCount", 0))
            discard_delta = max(curr_discard - prev_discard, 0)
            resolve_component = 0.01 * float(discard_delta)

        # Terminal reward: score normalised over 40 (tighter scale than baseline's
        # /100) plus an explicit victory bonus to strongly incentivise winning.
        terminal_component = 0.0
        if terminated:
            score = float(curr_stats.get("score", 0.0))
            terminal_component = float(np.clip(score / 40.0, -1.0, 1.0))
            if bool(curr_stats.get("victory", False)):
                terminal_component += 0.5

        total = float(
            health_component + weapon_component + survival_component
            + resolve_component + terminal_component
        )
        components = {
            "health": float(health_component),
            "weapon": float(weapon_component),
            "survival": float(survival_component),
            "resolve": float(resolve_component),
            "terminal": float(terminal_component),
            "total": total,
        }
        return total, components

    def discrete_to_worker_action(self, action_idx: int) -> Dict[str, Any]:
        """Translate a discrete action index to a worker-action dict.

        Kept for compatibility with watch_agent_game.py which uses this mapping
        to display human-readable action labels.
        """
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


__all__ = ["OBS_SIZES", "ScoundrelEnv"]
