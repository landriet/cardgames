from __future__ import annotations

import argparse
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

import numpy as np
from sb3_contrib import MaskablePPO

from engine import Action, Card, CardType, GameState, get_legal_actions
from scoundrel_env import ScoundrelEnv


def format_card(card: Optional[Card]) -> str:
    if card is None:
        return "-"
    return f"{card.card_type.value} {card.rank} of {card.suit.value}"


def format_action(action: Action, room: List[Card]) -> str:
    if action.action_type == "enterRoom":
        return "enterRoom"
    if action.action_type == "skipRoom":
        return "skipRoom"
    if action.action_type == "playCard":
        card = room[action.card_index] if 0 <= action.card_index < len(room) else None
        mode_suffix = f" ({action.mode})" if action.mode else ""
        return f"playCard[{action.card_index}] {format_card(card)}{mode_suffix}"
    return str(action)


def format_discrete_action(action_idx: int, room: List[Card]) -> str:
    if action_idx == 0:
        return "enterRoom"
    if action_idx == 1:
        return "skipRoom"
    if 2 <= action_idx <= 9:
        rel = action_idx - 2
        card_index = rel // 2
        mode = "weapon" if rel % 2 == 1 else "barehanded"
        card = room[card_index] if 0 <= card_index < len(room) else None
        return f"playCard[{card_index}] {format_card(card)} ({mode})"
    return f"unknown({action_idx})"


def render_state(step_idx: int, state: GameState) -> None:
    legal_actions = get_legal_actions(state)
    print(f"\nStep {step_idx}")
    print(
        "State: "
        f"health={state.health}/{state.max_health} "
        f"deck={len(state.deck)} "
        f"discard={len(state.discard)}"
    )
    print(f"Weapon: {format_card(state.equipped_weapon)}")
    if state.monsters_on_weapon:
        monsters_str = ", ".join(format_card(m) for m in state.monsters_on_weapon)
        print(f"Monsters on weapon: {monsters_str}")
    print("Room:")
    for idx, card in enumerate(state.room):
        print(f"  [{idx}] {format_card(card)}")
    print("Legal actions:")
    for action in legal_actions:
        print(f"  - {format_action(action, state.room)}")


def play(
    model_path: Path,
    seed: int,
    deterministic: bool,
    max_episode_steps: int,
    sleep_seconds: float,
    deck_seed: Optional[int],
    reward_mode: str,
    obs_version: int,
) -> None:
    env = ScoundrelEnv(
        max_episode_steps=max_episode_steps,
        deck_seed=deck_seed,
        reward_mode=reward_mode,
        obs_version=obs_version,
    )
    model = MaskablePPO.load(str(model_path))

    try:
        obs, _ = env.reset(seed=seed)
        done = False
        truncated = False
        step_idx = 0
        total_reward = 0.0

        while not done and not truncated:
            state = env._state
            if state is None:
                break
            render_state(step_idx, state)

            masks = env.action_masks()
            action, _ = model.predict(obs, action_masks=masks, deterministic=deterministic)
            action_idx = int(action)
            print(f"Chosen action: idx={action_idx} -> {format_discrete_action(action_idx, state.room)}")

            obs, reward, terminated, was_truncated, info = env.step(action_idx)
            total_reward += float(reward)
            done = bool(terminated)
            truncated = bool(was_truncated)
            print(f"Reward: {reward:.4f}")

            step_idx += 1
            if sleep_seconds > 0:
                time.sleep(sleep_seconds)

        print("\nEpisode complete")
        print(
            "Outcome: "
            f"victory={bool(info.get('victory', False))} "
            f"gameOver={bool(info.get('gameOver', False))} "
            f"truncated={bool(info.get('truncated', False))}"
        )
        final_state = env._state
        if final_state is not None:
            print(f"Final health: {final_state.health}/{final_state.max_health}")
        print(f"Final score: {info.get('score', 0)}")
        print(f"Total reward: {total_reward:.4f}")
        print(f"Steps: {step_idx}")
    finally:
        env.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Run and print a full game played by a trained Scoundrel PPO agent.")
    parser.add_argument("--model", type=Path, required=True, help="Path to trained .zip model.")
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--stochastic", action="store_true", help="Sample actions instead of deterministic inference.")
    parser.add_argument("--max-episode-steps", type=int, default=200)
    parser.add_argument("--deck-seed", type=int, default=None, help="Deterministic game deck seed.")
    parser.add_argument("--reward-mode", choices=("baseline", "dense_v1", "dense_v2"), default="baseline")
    parser.add_argument("--obs-version", type=int, choices=[1, 2], default=1, help="Observation version: 1 (74-dim) or 2 (84-dim).")
    parser.add_argument("--sleep", type=float, default=0.0, help="Seconds to wait between steps for readability.")
    args = parser.parse_args()

    play(
        model_path=args.model,
        seed=args.seed,
        deterministic=not args.stochastic,
        max_episode_steps=args.max_episode_steps,
        sleep_seconds=max(args.sleep, 0.0),
        deck_seed=args.deck_seed,
        reward_mode=args.reward_mode,
        obs_version=args.obs_version,
    )


if __name__ == "__main__":
    main()
