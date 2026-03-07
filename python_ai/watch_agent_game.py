from __future__ import annotations

import argparse
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

from sb3_contrib import MaskablePPO

from scoundrel_env import ScoundrelEnv


def format_card(card: Optional[Dict[str, Any]]) -> str:
    if not card:
        return "-"
    return f"{card.get('type')} {card.get('rank')} of {card.get('suit')}"


def format_worker_action(action: Dict[str, Any], room_cards: List[Dict[str, Any]]) -> str:
    action_type = action.get("actionType")
    if action_type == "enterRoom":
        return "enterRoom"
    if action_type == "skipRoom":
        return "skipRoom"
    if action_type != "playCard":
        return str(action)

    card_idx = int(action.get("cardIdx", -1))
    mode = action.get("mode")
    card = room_cards[card_idx] if 0 <= card_idx < len(room_cards) else None
    mode_suffix = f" ({mode})" if mode else ""
    return f"playCard[{card_idx}] {format_card(card)}{mode_suffix}"


def render_state(step_idx: int, state: Dict[str, Any], possible_actions: List[Dict[str, Any]]) -> None:
    room_cards = state.get("currentRoom", {}).get("cards", [])
    print(f"\nStep {step_idx}")
    print(
        "State: "
        f"health={state.get('health')}/{state.get('maxHealth')} "
        f"score={state.get('score', 0)} "
        f"deck={len(state.get('deck', []))} "
        f"discard={len(state.get('discard', []))}"
    )
    print(f"Weapon: {format_card(state.get('equippedWeapon'))}")
    print("Room:")
    for idx, card in enumerate(room_cards):
        print(f"  [{idx}] {format_card(card)}")
    print("Legal actions:")
    for action in possible_actions:
        print(f"  - {format_worker_action(action, room_cards)}")


def play(
    model_path: Path,
    seed: int,
    deterministic: bool,
    max_episode_steps: int,
    sleep_seconds: float,
    deck_seed: Optional[int],
    reward_mode: str,
) -> None:
    env = ScoundrelEnv(max_episode_steps=max_episode_steps, deck_seed=deck_seed, reward_mode=reward_mode)
    model = MaskablePPO.load(str(model_path))

    try:
        _obs, _ = env.reset(seed=seed)
        done = False
        truncated = False
        step_idx = 0
        total_reward = 0.0

        while not done and not truncated:
            assert env.state is not None
            render_state(step_idx, env.state, env.possible_actions)

            masks = env.action_masks()
            action, _ = model.predict(_obs, action_masks=masks, deterministic=deterministic)
            action_idx = int(action)
            selected_action = env._discrete_to_worker_action(action_idx)
            print(f"Chosen action: idx={action_idx} -> {format_worker_action(selected_action, env.state.get('currentRoom', {}).get('cards', []))}")

            _obs, reward, terminated, was_truncated, info = env.step(action_idx)
            total_reward += float(reward)
            done = bool(terminated)
            truncated = bool(was_truncated)
            print(f"Reward: {reward:.4f}")

            step_idx += 1
            if sleep_seconds > 0:
                time.sleep(sleep_seconds)

        assert env.state is not None
        print("\nEpisode complete")
        print(
            "Outcome: "
            f"victory={bool(info.get('victory', False))} "
            f"gameOver={bool(info.get('gameOver', False))} "
            f"truncated={bool(info.get('truncated', False))}"
        )
        print(f"Final health: {env.state.get('health')}/{env.state.get('maxHealth')}")
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
    parser.add_argument("--deck-seed", type=int, default=None, help="Deterministic game deck seed shared with frontend runs.")
    parser.add_argument("--reward-mode", choices=("baseline", "dense_v1"), default="baseline")
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
    )


if __name__ == "__main__":
    main()
