from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
from sb3_contrib import MaskablePPO

from scoundrel_env import ScoundrelEnv


def evaluate(model_path: Path, games: int, seed: int) -> dict:
    env = ScoundrelEnv()
    model = MaskablePPO.load(str(model_path))

    scores = []
    wins = 0

    rng = np.random.default_rng(seed)

    for _ in range(games):
        obs, _ = env.reset(seed=int(rng.integers(0, 1_000_000_000)))
        done = False
        truncated = False
        info = {}

        while not done and not truncated:
            mask = env.action_masks()
            action, _ = model.predict(obs, action_masks=mask, deterministic=True)
            obs, _, done, truncated, info = env.step(int(action))

        score = float(info.get("score", 0.0))
        scores.append(score)
        if info.get("victory"):
            wins += 1

    env.close()

    return {
        "games": games,
        "avg_score": float(np.mean(scores)) if scores else 0.0,
        "median_score": float(np.median(scores)) if scores else 0.0,
        "win_rate": float(wins / games) if games else 0.0,
        "scores": scores,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Evaluate trained Scoundrel PPO model.")
    parser.add_argument("--model", type=Path, required=True)
    parser.add_argument("--games", type=int, default=1000)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--out", type=Path, default=Path("python_ai/results/eval.json"))
    args = parser.parse_args()

    result = evaluate(args.model, args.games, args.seed)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
