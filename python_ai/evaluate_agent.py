from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Optional, Sequence

import numpy as np
from sb3_contrib import MaskablePPO

from engine import DECK_VARIANTS, DEFAULT_VARIANT_ID, DeckVariant, resolve_game_variant_id
from utils import bootstrap_mean_ci
from vec_env_utils import START_METHOD_CHOICES, VEC_ENV_CHOICES, build_vec_env, resolve_num_envs, resolve_vec_env_kind

MAX_SEED_ENTRIES = 10_000


def parse_seed_list(
    seed_list: Optional[str],
    seeds_file: Optional[Path],
    seed_range: Optional[str] = None,
) -> list[int]:
    seeds: list[int] = []

    def add_seed(seed: int) -> None:
        if len(seeds) >= MAX_SEED_ENTRIES:
            raise ValueError(f"At most {MAX_SEED_ENTRIES} seed entries can be evaluated at once.")
        seeds.append(seed)

    if seed_list:
        for token in seed_list.split(","):
            token = token.strip()
            if not token:
                continue
            add_seed(int(token))

    if seed_range is not None:
        match = re.fullmatch(r"\s*(-?\d+)\s*-\s*(-?\d+)\s*", seed_range)
        if match is None:
            raise ValueError(f"Invalid --seed-range {seed_range!r}; use START-END, for example 101-110.")
        start, end = (int(token) for token in match.groups())
        if start < 0 or end < 0:
            raise ValueError(f"Invalid --seed-range {seed_range!r}; bounds must be non-negative.")
        if start > end:
            raise ValueError(f"Invalid --seed-range {seed_range!r}; start must be <= end.")
        range_size = end - start + 1
        if len(seeds) + range_size > MAX_SEED_ENTRIES:
            raise ValueError(f"A single evaluation can include at most {MAX_SEED_ENTRIES} seed entries.")
        seeds.extend(range(start, end + 1))

    if seeds_file is not None:
        for line in seeds_file.read_text(encoding="utf-8").splitlines():
            stripped = line.strip()
            if not stripped or stripped.startswith("#"):
                continue
            add_seed(int(stripped))

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
    obs_version: int = 1,
    variant_id: Optional[str] = None,
    deck_variant: Optional[DeckVariant] = None,
) -> dict:
    resolved_variant = resolve_game_variant_id(variant_id, deck_variant)
    # A single requested deck seed should evaluate that exact deck. Running
    # more than one worker would allow a different worker's first game to
    # finish first and become the reported result.
    resolved_num_envs = 1 if deck_seed is not None and games == 1 else resolve_num_envs(num_envs)
    resolved_vec_env_kind = resolve_vec_env_kind(vec_env_kind, resolved_num_envs)
    env = build_vec_env(
        num_envs=resolved_num_envs,
        vec_env_kind=resolved_vec_env_kind,
        start_method=start_method,
        max_episode_steps=max_episode_steps,
        seed=seed,
        wrap_action_masker=False,
        reward_mode=reward_mode,
        obs_version=obs_version,
        variant_id=resolved_variant,
    )
    env.seed(int(deck_seed) if deck_seed is not None else seed)
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
        "variant_id": resolved_variant,
        "deck_variant": resolved_variant,
        "obs_version": obs_version,
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
    obs_version: int = 1,
    variant_id: Optional[str] = None,
    deck_variant: Optional[DeckVariant] = None,
) -> dict:
    resolved_variant = resolve_game_variant_id(variant_id, deck_variant)
    per_seed_results: list[dict] = []
    all_scores: list[float] = []
    all_wins: list[float] = []
    seed_avg_scores: list[float] = []
    seed_win_rates: list[float] = []
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
            obs_version=obs_version,
            variant_id=resolved_variant,
        )
        result["deck_seed"] = deck_seed
        per_seed_results.append(result)
        all_scores.extend(result.get("scores", []))
        completed = int(result.get("completed_games", 0))
        wins = int(result.get("wins", 0))
        if completed > 0:
            seed_avg_scores.append(float(result["avg_score"]))
            seed_win_rates.append(wins / completed)
            all_wins.extend([1.0] * wins)
            all_wins.extend([0.0] * max(completed - wins, 0))
        total_truncated += int(result.get("truncated_games", 0))

    scores_np = np.asarray(all_scores, dtype=np.float64)
    wins_np = np.asarray(all_wins, dtype=np.float64)
    score_ci_low, score_ci_high = bootstrap_mean_ci(np.asarray(seed_avg_scores, dtype=np.float64))
    win_ci_low, win_ci_high = bootstrap_mean_ci(np.asarray(seed_win_rates, dtype=np.float64))

    return {
        "deck_seeds": list(deck_seeds),
        "variant_id": resolved_variant,
        "deck_variant": resolved_variant,
        "obs_version": obs_version,
        "games_per_seed": games_per_seed,
        "games": games_per_seed * len(deck_seeds),
        "completed_games": int(scores_np.size),
        "wins": int(wins_np.sum()),
        "truncated_games": total_truncated,
        "avg_score": float(scores_np.mean()) if scores_np.size else 0.0,
        "avg_score_ci95": [score_ci_low, score_ci_high],
        "median_score": float(np.median(scores_np)) if scores_np.size else 0.0,
        "win_rate": float(wins_np.mean()) if wins_np.size else 0.0,
        "win_rate_ci95": [win_ci_low, win_ci_high],
        "scores": all_scores,
        "per_seed": per_seed_results,
    }


def format_evaluation_summary(result: dict, model_path: Path, output_path: Path) -> str:
    """Format the key evaluation metrics without printing the raw score arrays."""
    completed = int(result.get("completed_games", 0))
    requested = int(result.get("games", completed))
    wins = int(result.get("wins", round(float(result.get("win_rate", 0.0)) * completed)))
    win_rate = float(result.get("win_rate", 0.0))
    avg_score = float(result.get("avg_score", 0.0))
    median_score = float(result.get("median_score", 0.0))
    win_ci = result.get("win_rate_ci95")
    score_ci = result.get("avg_score_ci95")

    lines = [
        f"Evaluation summary: {model_path}",
        f"Variant: {result.get('variant_id', result.get('deck_variant', DEFAULT_VARIANT_ID))} | observation v{result.get('obs_version', 1)}",
        f"Games: {completed}/{requested} completed ({int(result.get('truncated_games', 0))} truncated)",
    ]
    if completed:
        win_line = f"Win rate: {win_rate:.1%} ({wins}/{completed})"
        if win_ci and len(win_ci) == 2:
            win_line += f" | 95% CI {float(win_ci[0]):.1%}–{float(win_ci[1]):.1%}"
        lines.append(win_line)

        score_line = f"Average score: {avg_score:.2f}"
        if score_ci and len(score_ci) == 2:
            score_line += f" | 95% CI {float(score_ci[0]):.2f}–{float(score_ci[1]):.2f}"
        lines.append(score_line)
        lines.append(f"Median score: {median_score:.1f}")

    per_seed = result.get("per_seed", [])
    if per_seed:
        lines.extend([
            "",
            "Per-seed results:",
            "  seed   games   wins   win rate   avg score   median",
        ])
        for row in per_seed:
            seed = row.get("deck_seed", "-")
            row_completed = int(row.get("completed_games", 0))
            row_wins = int(row.get("wins", 0))
            lines.append(
                f"  {str(seed):>5}  {row_completed:>5}/{int(row.get('games', 0)):<5}"
                f"  {row_wins:>4}   {float(row.get('win_rate', 0.0)):>7.1%}"
                f"  {float(row.get('avg_score', 0.0)):>9.2f}  {float(row.get('median_score', 0.0)):>7.1f}"
            )

    lines.extend(["", f"Full report: {output_path}"])
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description="Evaluate trained Scoundrel PPO model.")
    parser.add_argument("--model", type=Path, required=True)
    parser.add_argument(
        "--games",
        type=int,
        default=1000,
        help="Games per evaluation run (or per deck seed when using --seed-list/--seed-range).",
    )
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
    parser.add_argument(
        "--seed-range",
        type=str,
        default=None,
        help="Inclusive range of deterministic deck seeds, e.g. '101-110' (maximum 10000 seed entries per run).",
    )
    parser.add_argument("--seeds-file", type=Path, default=None, help="Optional file containing one deterministic deck seed per line.")
    parser.add_argument("--reward-mode", choices=("baseline", "dense_v1", "dense_v2"), default="baseline")
    parser.add_argument("--obs-version", type=int, choices=[1, 2, 3], default=1, help="Observation version: v1 (74), v2 (84), or v3 (98).")
    parser.add_argument(
        "--variant",
        "--deck-variant",
        dest="variant_id",
        choices=DECK_VARIANTS,
        default=DEFAULT_VARIANT_ID,
        help="Registered game variant (legacy alias: --deck-variant).",
    )
    parser.add_argument("--out", type=Path, default=Path("python_ai/results/eval.json"))
    args = parser.parse_args()

    deck_seeds = parse_seed_list(args.seed_list, args.seeds_file, args.seed_range)
    if deck_seeds and args.deck_seed is not None:
        raise ValueError("Use either --deck-seed or --seed-list/--seed-range/--seeds-file, not both.")

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
            obs_version=args.obs_version,
            variant_id=args.variant_id,
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
            obs_version=args.obs_version,
            variant_id=args.variant_id,
        )

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(format_evaluation_summary(result, args.model, args.out))


if __name__ == "__main__":
    main()
