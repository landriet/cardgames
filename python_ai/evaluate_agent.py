from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Optional

import numpy as np
from sb3_contrib import MaskablePPO

from vec_env_utils import START_METHOD_CHOICES, VEC_ENV_CHOICES, build_vec_env, resolve_num_envs, resolve_vec_env_kind


def evaluate(
    model_path: Path,
    games: int,
    seed: int,
    max_episode_steps: int,
    num_envs: Optional[int] = None,
    vec_env_kind: Optional[str] = None,
    start_method: str = "spawn",
) -> dict:
    resolved_num_envs = resolve_num_envs(num_envs)
    resolved_vec_env_kind = resolve_vec_env_kind(vec_env_kind, resolved_num_envs)
    env = build_vec_env(
        num_envs=resolved_num_envs,
        vec_env_kind=resolved_vec_env_kind,
        start_method=start_method,
        max_episode_steps=max_episode_steps,
        seed=seed,
        wrap_action_masker=False,
    )
    model = MaskablePPO.load(str(model_path))

    terminal_scores = []
    wins = 0
    truncated_games = 0
    completed_or_truncated = 0

    try:
        obs = env.reset()
        while completed_or_truncated < games:
            masks = np.asarray(env.env_method("action_masks"), dtype=bool)
            actions, _ = model.predict(obs, action_masks=masks, deterministic=True)
            obs, _, dones, infos = env.step(actions)

            for idx, done in enumerate(dones):
                if not bool(done):
                    continue
                if completed_or_truncated >= games:
                    continue

                info = infos[idx]
                truncated = bool(info.get("truncated", False) or info.get("TimeLimit.truncated", False))
                if truncated:
                    truncated_games += 1
                else:
                    score = float(info.get("score", 0.0))
                    terminal_scores.append(score)
                    if info.get("victory"):
                        wins += 1
                completed_or_truncated += 1
    finally:
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
    parser = argparse.ArgumentParser(description="Evaluate trained Scoundrel PPO model.")
    parser.add_argument("--model", type=Path, required=True)
    parser.add_argument("--games", type=int, default=1000)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--num-envs", type=int, default=None, help="Parallel environments/workers. Default: cpu_count-1.")
    parser.add_argument("--vec-env", choices=VEC_ENV_CHOICES, default=None, help="Vectorization backend. Default: subproc when num_envs>1.")
    parser.add_argument("--start-method", choices=START_METHOD_CHOICES, default="spawn", help="Subprocess start method for SubprocVecEnv.")
    parser.add_argument("--max-episode-steps", type=int, default=200)
    parser.add_argument("--out", type=Path, default=Path("python_ai/results/eval.json"))
    args = parser.parse_args()

    result = evaluate(
        model_path=args.model,
        games=args.games,
        seed=args.seed,
        max_episode_steps=args.max_episode_steps,
        num_envs=args.num_envs,
        vec_env_kind=args.vec_env,
        start_method=args.start_method,
    )
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
