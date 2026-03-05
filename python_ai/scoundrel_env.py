from __future__ import annotations

from typing import Any, Dict, List, Optional, Tuple

import gymnasium as gym
import numpy as np
from gymnasium import spaces

from bridge_client import EngineWorkerClient

CARD_SUITS = ["hearts", "diamonds", "clubs", "spades"]
CARD_TYPES = ["monster", "weapon", "potion"]
MAX_RANK = 14

# 44-card canonical deck order for seen-card bitset.
CANONICAL_DECK: List[Tuple[str, str, int]] = []
for suit in CARD_SUITS:
    for rank in range(2, 15):
        if suit in ("hearts", "diamonds") and rank in (11, 12, 13, 14):
            continue
        card_type = "monster"
        if suit == "hearts":
            card_type = "potion"
        elif suit == "diamonds":
            card_type = "weapon"
        CANONICAL_DECK.append((card_type, suit, rank))

CARD_INDEX = {card: i for i, card in enumerate(CANONICAL_DECK)}


class ScoundrelEnv(gym.Env[np.ndarray, int]):
    metadata = {"render_modes": ["human"]}

    def __init__(self, worker_command: Optional[List[str]] = None) -> None:
        super().__init__()
        self.client = EngineWorkerClient(command=worker_command)
        self.session_id: Optional[str] = None
        self.state: Optional[Dict[str, Any]] = None
        self.possible_actions: List[Dict[str, Any]] = []
        self.last_health = 20.0
        self.seen_cards = np.zeros(len(CANONICAL_DECK), dtype=np.float32)

        self.action_space = spaces.Discrete(10)
        # 10 player features + 16 room slot features + 4 monster-on-weapon ranks + 44 seen-card bits
        self.observation_space = spaces.Box(low=0.0, high=1.0, shape=(74,), dtype=np.float32)

    def reset(self, *, seed: Optional[int] = None, options: Optional[dict] = None):
        super().reset(seed=seed)
        if self.session_id is None:
            result = self.client.create_session()
        else:
            result = self.client.reset_session(self.session_id)

        self.session_id = result["sessionId"]
        self.state = result["state"]
        self.possible_actions = result["possibleActions"]
        self.last_health = float(self.state.get("health", 20))
        self.seen_cards = np.zeros(len(CANONICAL_DECK), dtype=np.float32)
        self._update_seen_cards(self.state)

        return self._encode_state(self.state), {}

    def step(self, action: int):
        if self.state is None or self.session_id is None:
            raise RuntimeError("Environment not initialized. Call reset() first.")

        mask = self.action_masks()
        if action < 0 or action >= len(mask) or not mask[action]:
            obs = self._encode_state(self.state)
            return obs, -1.0, False, False, {"invalid_action": True}

        worker_action = self._discrete_to_worker_action(action)
        result = self.client.step_action(self.session_id, worker_action)

        self.state = result["state"]
        self.possible_actions = result["possibleActions"]
        self._update_seen_cards(self.state)

        terminated = bool(self.state.get("gameOver") or self.state.get("victory"))
        truncated = False
        reward = self._compute_reward(self.state, terminated)
        obs = self._encode_state(self.state)

        info = {
            "score": self.state.get("score", 0),
            "victory": bool(self.state.get("victory", False)),
            "gameOver": bool(self.state.get("gameOver", False)),
        }
        return obs, reward, terminated, truncated, info

    def render(self):
        if self.state is None:
            print("No state")
            return
        print(
            {
                "health": self.state.get("health"),
                "room": self.state.get("currentRoom", {}).get("cards", []),
                "possible_actions": self.possible_actions,
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
        mask = np.zeros(10, dtype=bool)
        for action in self.possible_actions:
            idx = self._possible_action_to_discrete(action)
            if idx is not None:
                mask[idx] = True
        return mask

    def _compute_reward(self, state: Dict[str, Any], terminated: bool) -> float:
        health = float(state.get("health", self.last_health))
        health_delta = (health - self.last_health) / max(float(state.get("maxHealth", 20)), 1.0)
        self.last_health = health

        shaped = 0.05 * health_delta
        if not terminated:
            return shaped

        score = float(state.get("score", 0))
        # Score-first terminal objective with clipping for stable learning.
        terminal = np.clip(score / 100.0, -1.0, 1.0)
        return float(terminal + shaped)

    def _encode_state(self, state: Dict[str, Any]) -> np.ndarray:
        features: List[float] = []

        health = float(state.get("health", 0))
        max_health = float(state.get("maxHealth", 20))
        equipped = state.get("equippedWeapon")
        last_defeated = state.get("lastMonsterDefeated")
        monsters_on_weapon = state.get("monstersOnWeapon", [])
        room_cards = state.get("currentRoom", {}).get("cards", [])

        features.extend(
            [
                health / max(max_health, 1.0),
                max_health / 20.0,
                (float(equipped.get("rank", 0)) if equipped else 0.0) / MAX_RANK,
                (float(last_defeated.get("rank", 0)) if last_defeated else 0.0) / MAX_RANK,
                min(len(monsters_on_weapon), 4) / 4.0,
                1.0 if state.get("potionTakenThisTurn") else 0.0,
                1.0 if state.get("canDeferRoom") else 0.0,
                1.0 if state.get("lastActionWasDefer") else 0.0,
                min(float(len(state.get("deck", []))), 44.0) / 44.0,
                min(float(len(room_cards)), 4.0) / 4.0,
            ]
        )

        for i in range(4):
            if i < len(room_cards):
                card = room_cards[i]
                ctype = card.get("type")
                rank = float(card.get("rank", 0)) / MAX_RANK
                features.extend(
                    [
                        1.0 if ctype == "monster" else 0.0,
                        1.0 if ctype == "weapon" else 0.0,
                        1.0 if ctype == "potion" else 0.0,
                        rank,
                    ]
                )
            else:
                features.extend([0.0, 0.0, 0.0, 0.0])

        for i in range(4):
            if i < len(monsters_on_weapon):
                features.append(float(monsters_on_weapon[i].get("rank", 0)) / MAX_RANK)
            else:
                features.append(0.0)

        features.extend(self.seen_cards.tolist())

        return np.asarray(features, dtype=np.float32)

    def _update_seen_cards(self, state: Dict[str, Any]) -> None:
        def mark(card: Dict[str, Any]) -> None:
            key = (card.get("type"), card.get("suit"), int(card.get("rank", 0)))
            idx = CARD_INDEX.get(key)
            if idx is not None:
                self.seen_cards[idx] = 1.0

        for card in state.get("discard", []):
            mark(card)
        for card in state.get("currentRoom", {}).get("cards", []):
            mark(card)

        equipped = state.get("equippedWeapon")
        if equipped:
            mark(equipped)

        for card in state.get("monstersOnWeapon", []):
            mark(card)

    def _possible_action_to_discrete(self, action: Dict[str, Any]) -> Optional[int]:
        action_type = action.get("actionType")
        if action_type == "enterRoom":
            return 0
        if action_type == "skipRoom":
            return 1
        if action_type != "playCard":
            return None

        card_idx = int(action.get("cardIdx", -1))
        if card_idx < 0 or card_idx > 3:
            return None

        mode = action.get("mode")
        base = 2 + card_idx * 2
        if mode == "weapon":
            return base + 1
        return base

    def _discrete_to_worker_action(self, action_idx: int) -> Dict[str, Any]:
        if action_idx == 0:
            return {"actionType": "enterRoom"}
        if action_idx == 1:
            return {"actionType": "skipRoom"}

        play_idx = action_idx - 2
        card_idx = play_idx // 2
        use_weapon = play_idx % 2 == 1
        if use_weapon:
            return {"actionType": "playCard", "cardIdx": card_idx, "mode": "weapon"}
        return {"actionType": "playCard", "cardIdx": card_idx, "mode": "barehanded"}


__all__ = ["ScoundrelEnv"]
