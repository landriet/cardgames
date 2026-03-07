from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Optional, Sequence

import numpy as np
from sb3_contrib import MaskablePPO

from vec_env_utils import START_METHOD_CHOICES, VEC_ENV_CHOICES, build_vec_env, resolve_num_envs, resolve_vec_env_kind


def bootstrap_mean_ci(values: np.ndarray, confidence: float = 0.95, num_bootstrap: int = 1000, seed: int = 12345) -> tuple[float, float]:
    if values.size == 0:
        return (0.0, 0.0)
    if values.size == 1:
        v = float(values[0])
        return (v, v)

    rng = np.random.default_rng(seed)
    samples = rng.choice(values, size=(num_bootstrap, values.size), replace=True)
    means = samples.mean(axis=1)
    alpha = 1.0 - confidence
    low = float(np.quantile(means, alpha / 2.0))
    high = float(np.quantile(means, 1.0 - alpha / 2.0))
    return (low, high)


def parse_seed_list(seed_list: Optional[str], seeds_file: Optional[Path]) -> list[int]:
    seeds: list[int] = []

    if seed_list:
        for token in seed_list.split(","):
            token = token.strip()
            if not token:
                continue
            seeds.append(int(token))

    if seeds_file is not None:
        for line in seeds_file.read_text(encoding="utf-8").splitlines():
            stripped = line.strip()
            if not stripped or stripped.startswith("#"):
                continue
            seeds.append(int(stripped))

    seen: set[int] = set()
    unique: list[int] = []
    for s in seeds:
        if s in seen:
            continue
        seen.add(s)
        unique.append(s)
    return unique


def evaluate(
    model_path: Path,
    games: int,
    seed: int,
    max_episode_steps: int,
    num_envs: Optional[int] = None,
    vec_env_kind: Optional[str] = None,
    start_method: str = "spawn",
    deck_seed: Optional[int] = None,
    reward_mode: str = "baseline",
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
        deck_seed=deck_seed,
        reward_mode=reward_mode,
    )
    model = MaskablePPO.load(str(model_path))

    terminal_scores: list[float] = []
    terminal_win_flags: list[float] = []
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
                    terminal_win_flags.append(1.0 if info.get("victory") else 0.0)
                completed_or_truncated += 1
    finally:
        env.close()

    scores_np = np.asarray(terminal_scores, dtype=np.float64)
    wins_np = np.asarray(terminal_win_flags, dtype=np.float64)
    completed_games = int(scores_np.size)
    wins = int(wins_np.sum())

    score_ci_low, score_ci_high = bootstrap_mean_ci(scores_np)
    win_ci_low, win_ci_high = bootstrap_mean_ci(wins_np)

    return {
        "games": games,
        "completed_games": completed_games,
        "wins": wins,
        "truncated_games": truncated_games,
        "avg_score": float(scores_np.mean()) if completed_games else 0.0,
        "avg_score_ci95": [score_ci_low, score_ci_high],
        "median_score": float(np.median(scores_np)) if completed_games else 0.0,
        "win_rate": float(wins / completed_games) if completed_games else 0.0,
        "win_rate_ci95": [win_ci_low, win_ci_high],
        "scores": terminal_scores,
    }


def evaluate_across_deck_seeds(
    model_path: Path,
    games_per_seed: int,
    deck_seeds: Sequence[int],
    seed: int,
    max_episode_steps: int,
    num_envs: Optional[int] = None,
    vec_env_kind: Optional[str] = None,
    start_method: str = "spawn",
    reward_mode: str = "baseline",
) -> dict:
    per_seed_results: list[dict] = []
    all_scores: list[float] = []
    all_wins: list[float] = []
    total_truncated = 0

    for idx, deck_seed in enumerate(deck_seeds):
        result = evaluate(
            model_path=model_path,
            games=games_per_seed,
            seed=seed + idx,
            max_episode_steps=max_episode_steps,
            num_envs=num_envs,
            vec_env_kind=vec_env_kind,
            start_method=start_method,
            deck_seed=deck_seed,
            reward_mode=reward_mode,
        )
        result["deck_seed"] = deck_seed
        per_seed_results.append(result)
        all_scores.extend(result.get("scores", []))
        completed = int(result.get("completed_games", 0))
        wins = int(result.get("wins", 0))
        if completed > 0:
            all_wins.extend([1.0] * wins)
            all_wins.extend([0.0] * max(completed - wins, 0))
        total_truncated += int(result.get("truncated_games", 0))

    scores_np = np.asarray(all_scores, dtype=np.float64)
    wins_np = np.asarray(all_wins, dtype=np.float64)
    score_ci_low, score_ci_high = bootstrap_mean_ci(scores_np)
    win_ci_low, win_ci_high = bootstrap_mean_ci(wins_np)

    return {
        "deck_seeds": list(deck_seeds),
        "games_per_seed": games_per_seed,
        "games": games_per_seed * len(deck_seeds),
        "completed_games": int(scores_np.size),
        "truncated_games": total_truncated,
        "avg_score": float(scores_np.mean()) if scores_np.size else 0.0,
        "avg_score_ci95": [score_ci_low, score_ci_high],
        "median_score": float(np.median(scores_np)) if scores_np.size else 0.0,
        "win_rate": float(wins_np.mean()) if wins_np.size else 0.0,
        "win_rate_ci95": [win_ci_low, win_ci_high],
        "scores": all_scores,
        "per_seed": per_seed_results,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Evaluate trained Scoundrel PPO model.")
    parser.add_argument("--model", type=Path, required=True)
    parser.add_argument("--games", type=int, default=1000, help="Games per evaluation run (or per deck seed when using --seed-list).")
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--num-envs", type=int, default=None, help="Parallel environments/workers. Default: cpu_count-1.")
    parser.add_argument("--vec-env", choices=VEC_ENV_CHOICES, default=None, help="Vectorization backend. Default: subproc when num_envs>1.")
    parser.add_argument("--start-method", choices=START_METHOD_CHOICES, default="spawn", help="Subprocess start method for SubprocVecEnv.")
    parser.add_argument("--max-episode-steps", type=int, default=200)
    parser.add_argument("--deck-seed", type=int, default=None, help="Single deterministic game deck seed shared with frontend runs.")
    parser.add_argument(
        "--seed-list",
        type=str,
        default=None,
        help="Comma-separated deterministic deck seeds for multi-seed evaluation, e.g. '101,202,303'.",
    )
    parser.add_argument("--seeds-file", type=Path, default=None, help="Optional file containing one deterministic deck seed per line.")
    parser.add_argument("--reward-mode", choices=("baseline", "dense_v1"), default="baseline")
    parser.add_argument("--out", type=Path, default=Path("python_ai/results/eval.json"))
    args = parser.parse_args()

    deck_seeds = parse_seed_list(args.seed_list, args.seeds_file)
    if deck_seeds and args.deck_seed is not None:
        raise ValueError("Use either --deck-seed or --seed-list/--seeds-file, not both.")

    if deck_seeds:
        result = evaluate_across_deck_seeds(
            model_path=args.model,
            games_per_seed=args.games,
            deck_seeds=deck_seeds,
            seed=args.seed,
            max_episode_steps=args.max_episode_steps,
            num_envs=args.num_envs,
            vec_env_kind=args.vec_env,
            start_method=args.start_method,
            reward_mode=args.reward_mode,
        )
    else:
        result = evaluate(
            model_path=args.model,
            games=args.games,
            seed=args.seed,
            max_episode_steps=args.max_episode_steps,
            num_envs=args.num_envs,
            vec_env_kind=args.vec_env,
            start_method=args.start_method,
            deck_seed=args.deck_seed,
            reward_mode=args.reward_mode,
        )

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
