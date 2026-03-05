from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np

from scoundrel_env import ScoundrelEnv


def evaluate_random(games: int, seed: int, max_episode_steps: int) -> dict:
    env = ScoundrelEnv(max_episode_steps=max_episode_steps)
    rng = np.random.default_rng(seed)

    terminal_scores = []
    wins = 0
    truncated_games = 0

    for _ in range(games):
        _, _ = env.reset(seed=int(rng.integers(0, 1_000_000_000)))
        done = False
        truncated = False
        info = {}

        while not done and not truncated:
            mask = env.action_masks()
            legal = np.flatnonzero(mask)
            if len(legal) == 0:
                action = 0
            else:
                action = int(rng.choice(legal))
            _, _, done, truncated, info = env.step(action)

        if truncated:
            truncated_games += 1
            continue

        score = float(info.get("score", 0.0))
        terminal_scores.append(score)
        if info.get("victory"):
            wins += 1

    env.close()
    completed_games = len(terminal_scores)

    return {
        "games": games,
        "completed_games": completed_games,
        "truncated_games": truncated_games,
        "avg_score": float(np.mean(terminal_scores)) if terminal_scores else 0.0,
        "median_score": float(np.median(terminal_scores)) if terminal_scores else 0.0,
        "win_rate": float(wins / completed_games) if completed_games else 0.0,
        "scores": terminal_scores,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Random legal-action baseline for Scoundrel env.")
    parser.add_argument("--games", type=int, default=1000)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--max-episode-steps", type=int, default=200)
    parser.add_argument("--out", type=Path, default=Path("python_ai/results/random_baseline.json"))
    args = parser.parse_args()

    result = evaluate_random(args.games, args.seed, args.max_episode_steps)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
