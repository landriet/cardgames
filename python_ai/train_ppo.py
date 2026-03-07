from __future__ import annotations

import argparse
import json
import time
from pathlib import Path
from typing import Optional

import numpy as np
from sb3_contrib import MaskablePPO
from sb3_contrib.common.maskable.utils import get_action_masks
from stable_baselines3.common.callbacks import BaseCallback, CallbackList, CheckpointCallback
from vec_env_utils import START_METHOD_CHOICES, VEC_ENV_CHOICES, build_vec_env, resolve_num_envs, resolve_vec_env_kind


def derive_n_steps(num_envs: int, target_rollout_size: int = 2048, min_steps: int = 64) -> int:
    return max(min_steps, target_rollout_size // max(num_envs, 1))


def derive_batch_size(rollout_size: int) -> int:
    for candidate in (512, 256, 128, 64, 32):
        if candidate <= rollout_size and rollout_size % candidate == 0:
            return candidate
    return max(1, min(rollout_size, 32))


def linear_schedule(start: float, end: float):
    def _schedule(progress_remaining: float) -> float:
        return float(end + (start - end) * progress_remaining)

    return _schedule


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


def parse_eval_seeds(eval_seeds: Optional[str]) -> list[int]:
    if not eval_seeds:
        return []
    values: list[int] = []
    for token in eval_seeds.split(","):
        token = token.strip()
        if not token:
            continue
        values.append(int(token))
    return values


def build_default_eval_seeds(seed: int, count: int, stride: int) -> list[int]:
    return [seed + (i + 1) * stride for i in range(max(count, 0))]


def evaluate_model_on_deck_seeds(
    *,
    model: MaskablePPO,
    games_per_seed: int,
    deck_seeds: list[int],
    base_seed: int,
    max_episode_steps: int,
    num_envs: int,
    vec_env_kind: str,
    start_method: str,
    reward_mode: str,
) -> dict:
    all_scores: list[float] = []
    all_wins: list[float] = []
    total_truncated = 0

    for idx, deck_seed in enumerate(deck_seeds):
        env = build_vec_env(
            num_envs=num_envs,
            vec_env_kind=vec_env_kind,
            start_method=start_method,
            max_episode_steps=max_episode_steps,
            seed=base_seed + idx,
            wrap_action_masker=False,
            deck_seed=deck_seed,
            reward_mode=reward_mode,
        )
        scores: list[float] = []
        wins: list[float] = []
        truncated_games = 0
        completed_or_truncated = 0

        try:
            obs = env.reset()
            while completed_or_truncated < games_per_seed:
                masks = np.asarray(env.env_method("action_masks"), dtype=bool)
                actions, _ = model.predict(obs, action_masks=masks, deterministic=True)
                obs, _, dones, infos = env.step(actions)

                for i, done in enumerate(dones):
                    if not bool(done):
                        continue
                    if completed_or_truncated >= games_per_seed:
                        continue

                    info = infos[i]
                    truncated = bool(info.get("truncated", False) or info.get("TimeLimit.truncated", False))
                    if truncated:
                        truncated_games += 1
                    else:
                        score = float(info.get("score", 0.0))
                        scores.append(score)
                        wins.append(1.0 if info.get("victory") else 0.0)
                    completed_or_truncated += 1
        finally:
            env.close()

        total_truncated += truncated_games
        all_scores.extend(scores)
        all_wins.extend(wins)

    scores_np = np.asarray(all_scores, dtype=np.float64)
    wins_np = np.asarray(all_wins, dtype=np.float64)
    score_ci_low, score_ci_high = bootstrap_mean_ci(scores_np)
    win_ci_low, win_ci_high = bootstrap_mean_ci(wins_np)

    return {
        "deck_seeds": deck_seeds,
        "games_per_seed": games_per_seed,
        "games": games_per_seed * len(deck_seeds),
        "completed_games": int(scores_np.size),
        "truncated_games": int(total_truncated),
        "avg_score": float(scores_np.mean()) if scores_np.size else 0.0,
        "avg_score_ci95": [score_ci_low, score_ci_high],
        "median_score": float(np.median(scores_np)) if scores_np.size else 0.0,
        "win_rate": float(wins_np.mean()) if wins_np.size else 0.0,
        "win_rate_ci95": [win_ci_low, win_ci_high],
    }


class EntCoefSchedulerCallback(BaseCallback):
    def __init__(self, start: float, end: float, total_timesteps: int, verbose: int = 0) -> None:
        super().__init__(verbose=verbose)
        self.start = float(start)
        self.end = float(end)
        self.total_timesteps = max(int(total_timesteps), 1)

    def _on_step(self) -> bool:
        progress_remaining = max(0.0, 1.0 - (self.num_timesteps / float(self.total_timesteps)))
        self.model.ent_coef = float(self.end + (self.start - self.end) * progress_remaining)
        return True


class PeriodicEvalCallback(BaseCallback):
    def __init__(
        self,
        *,
        eval_freq: int,
        eval_games: int,
        eval_seed: int,
        eval_deck_seeds: list[int],
        eval_num_envs: int,
        eval_vec_env_kind: str,
        eval_start_method: str,
        eval_max_episode_steps: int,
        reward_mode: str,
        save_dir: Path,
        verbose: int = 1,
    ) -> None:
        super().__init__(verbose=verbose)
        self.eval_freq = max(int(eval_freq), 1)
        self.eval_games = max(int(eval_games), 1)
        self.eval_seed = int(eval_seed)
        self.eval_deck_seeds = eval_deck_seeds
        self.eval_num_envs = eval_num_envs
        self.eval_vec_env_kind = eval_vec_env_kind
        self.eval_start_method = eval_start_method
        self.eval_max_episode_steps = eval_max_episode_steps
        self.reward_mode = reward_mode
        self.save_dir = save_dir
        self.save_dir.mkdir(parents=True, exist_ok=True)

        self.last_eval_step = 0
        self.best_avg_score = float("-inf")
        self.best_win_rate = float("-inf")
        self.best_model_path = self.save_dir / "best_model"
        self.eval_history_path = self.save_dir / "eval_history.json"
        self.eval_history: list[dict] = []
        self.best_metrics: Optional[dict] = None
        self.start_time = time.time()

    def _is_better(self, avg_score: float, win_rate: float) -> bool:
        if avg_score > self.best_avg_score + 1e-12:
            return True
        if abs(avg_score - self.best_avg_score) <= 1e-12 and win_rate > self.best_win_rate + 1e-12:
            return True
        return False

    def _on_step(self) -> bool:
        if (self.num_timesteps - self.last_eval_step) < self.eval_freq:
            return True

        self.last_eval_step = self.num_timesteps
        metrics = evaluate_model_on_deck_seeds(
            model=self.model,
            games_per_seed=self.eval_games,
            deck_seeds=self.eval_deck_seeds,
            base_seed=self.eval_seed,
            max_episode_steps=self.eval_max_episode_steps,
            num_envs=self.eval_num_envs,
            vec_env_kind=self.eval_vec_env_kind,
            start_method=self.eval_start_method,
            reward_mode=self.reward_mode,
        )
        metrics["timestep"] = self.num_timesteps
        metrics["elapsed_seconds"] = round(time.time() - self.start_time, 3)
        self.eval_history.append(metrics)
        self.eval_history_path.write_text(json.dumps(self.eval_history, indent=2), encoding="utf-8")

        avg_score = float(metrics.get("avg_score", 0.0))
        win_rate = float(metrics.get("win_rate", 0.0))
        if self._is_better(avg_score, win_rate):
            self.best_avg_score = avg_score
            self.best_win_rate = win_rate
            self.best_metrics = metrics
            self.model.save(str(self.best_model_path))

        if self.verbose > 0:
            print(
                f"[eval] step={self.num_timesteps} avg_score={avg_score:.3f} "
                f"win_rate={win_rate:.3f} completed={metrics.get('completed_games', 0)}"
            )

        return True


def train(
    total_timesteps: int,
    model_out: Path,
    seed: int,
    resume_from: Optional[Path] = None,
    num_envs: Optional[int] = None,
    vec_env_kind: Optional[str] = None,
    start_method: str = "spawn",
    max_episode_steps: int = 200,
    save_freq: int = 0,
    save_dir: Optional[Path] = None,
    eval_freq: int = 0,
    eval_games: int = 200,
    eval_seed: int = 101,
    eval_num_envs: Optional[int] = None,
    eval_vec_env: Optional[str] = None,
    eval_start_method: str = "spawn",
    eval_seeds: Optional[str] = None,
    num_eval_seeds: int = 8,
    eval_seed_stride: int = 1009,
    lr_start: float = 3e-4,
    lr_end: float = 3e-4,
    ent_start: float = 0.01,
    ent_end: float = 0.01,
    clip_range: float = 0.2,
    vf_coef: float = 0.5,
    max_grad_norm: float = 0.5,
    target_kl: Optional[float] = None,
    reward_mode: str = "baseline",
    reward_debug: bool = False,
) -> None:
    resolved_num_envs = resolve_num_envs(num_envs)
    resolved_vec_env_kind = resolve_vec_env_kind(vec_env_kind, resolved_num_envs)
    resolved_eval_num_envs = resolve_num_envs(eval_num_envs) if eval_num_envs is not None else resolved_num_envs
    resolved_eval_vec_env_kind = resolve_vec_env_kind(eval_vec_env, resolved_eval_num_envs)

    eval_deck_seeds = parse_eval_seeds(eval_seeds)
    if not eval_deck_seeds:
        eval_deck_seeds = build_default_eval_seeds(seed, num_eval_seeds, eval_seed_stride)

    vec_env = build_vec_env(
        num_envs=resolved_num_envs,
        vec_env_kind=resolved_vec_env_kind,
        start_method=start_method,
        max_episode_steps=max_episode_steps,
        seed=seed,
        wrap_action_masker=True,
        reward_mode=reward_mode,
        reward_debug=reward_debug,
    )

    run_save_dir = save_dir or (model_out.parent / f"{model_out.stem}_artifacts")
    run_save_dir.mkdir(parents=True, exist_ok=True)

    eval_callback: Optional[PeriodicEvalCallback] = None
    try:
        if resume_from is not None:
            model = MaskablePPO.load(str(resume_from), env=vec_env)
            model.set_random_seed(seed)
        else:
            n_steps = derive_n_steps(resolved_num_envs)
            rollout_size = n_steps * resolved_num_envs
            batch_size = derive_batch_size(rollout_size)
            print(
                f"Training config: num_envs={resolved_num_envs}, vec_env={resolved_vec_env_kind}, "
                f"n_steps={n_steps}, rollout_size={rollout_size}, batch_size={batch_size}, start_method={start_method}"
            )
            lr = linear_schedule(lr_start, lr_end) if abs(lr_start - lr_end) > 1e-12 else float(lr_start)
            model = MaskablePPO(
                policy="MlpPolicy",
                env=vec_env,
                seed=seed,
                learning_rate=lr,
                n_steps=n_steps,
                batch_size=batch_size,
                gamma=0.99,
                gae_lambda=0.95,
                ent_coef=float(ent_start),
                clip_range=float(clip_range),
                vf_coef=float(vf_coef),
                max_grad_norm=float(max_grad_norm),
                target_kl=target_kl,
                verbose=1,
            )

        callbacks: list[BaseCallback] = []
        if save_freq > 0:
            callbacks.append(
                CheckpointCallback(
                    save_freq=save_freq,
                    save_path=str(run_save_dir / "checkpoints"),
                    name_prefix="checkpoint",
                )
            )

        if abs(ent_start - ent_end) > 1e-12:
            callbacks.append(EntCoefSchedulerCallback(start=ent_start, end=ent_end, total_timesteps=total_timesteps))

        if eval_freq > 0:
            eval_callback = PeriodicEvalCallback(
                eval_freq=eval_freq,
                eval_games=eval_games,
                eval_seed=eval_seed,
                eval_deck_seeds=eval_deck_seeds,
                eval_num_envs=resolved_eval_num_envs,
                eval_vec_env_kind=resolved_eval_vec_env_kind,
                eval_start_method=eval_start_method,
                eval_max_episode_steps=max_episode_steps,
                reward_mode=reward_mode,
                save_dir=run_save_dir,
            )
            callbacks.append(eval_callback)

        callback = CallbackList(callbacks) if callbacks else None
        train_start = time.time()
        model.learn(total_timesteps=total_timesteps, callback=callback)
        elapsed = time.time() - train_start

        model_out.parent.mkdir(parents=True, exist_ok=True)
        model.save(str(model_out))

        # Quick deterministic sanity rollout.
        obs = vec_env.reset()
        for _ in range(10):
            masks = get_action_masks(vec_env)
            action, _ = model.predict(obs, action_masks=masks, deterministic=True)
            obs, _, _, _ = vec_env.step(action)

        metrics = {
            "timesteps": int(total_timesteps),
            "elapsed_seconds": round(elapsed, 3),
            "seed": seed,
            "num_envs": resolved_num_envs,
            "vec_env": resolved_vec_env_kind,
            "start_method": start_method,
            "max_episode_steps": max_episode_steps,
            "reward_mode": reward_mode,
            "reward_debug": reward_debug,
            "resume_from": str(resume_from) if resume_from is not None else None,
            "lr_start": lr_start,
            "lr_end": lr_end,
            "ent_start": ent_start,
            "ent_end": ent_end,
            "clip_range": clip_range,
            "vf_coef": vf_coef,
            "max_grad_norm": max_grad_norm,
            "target_kl": target_kl,
            "save_freq": save_freq,
            "save_dir": str(run_save_dir),
            "eval_freq": eval_freq,
            "eval_games": eval_games,
            "eval_seed": eval_seed,
            "eval_deck_seeds": eval_deck_seeds,
        }

        if eval_callback is not None:
            metrics["best_eval"] = eval_callback.best_metrics
            metrics["eval_history_path"] = str(eval_callback.eval_history_path)
            metrics["best_model_path"] = str(eval_callback.best_model_path) if eval_callback.best_metrics else None

        metrics_path = run_save_dir / "train_metrics.json"
        metrics_path.write_text(json.dumps(metrics, indent=2), encoding="utf-8")
        print(f"Saved training metrics: {metrics_path}")
    finally:
        vec_env.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Train Scoundrel MaskablePPO agent with local engine worker bridge.")
    parser.add_argument("--timesteps", type=int, default=1_000_000)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--num-envs", type=int, default=None, help="Parallel environments/workers. Default: cpu_count-1.")
    parser.add_argument("--vec-env", choices=VEC_ENV_CHOICES, default=None, help="Vectorization backend. Default: subproc when num_envs>1.")
    parser.add_argument("--start-method", choices=START_METHOD_CHOICES, default="spawn", help="Subprocess start method for SubprocVecEnv.")
    parser.add_argument("--max-episode-steps", type=int, default=200)
    parser.add_argument("--model-out", type=Path, default=Path("python_ai/models/scoundrel_maskable_ppo"))
    parser.add_argument("--resume-from", type=Path, default=None, help="Existing .zip model checkpoint to continue training from.")

    parser.add_argument("--save-freq", type=int, default=0, help="Model checkpoint frequency in environment steps (0 disables).")
    parser.add_argument("--save-dir", type=Path, default=None, help="Artifact directory for checkpoints/eval history/metrics.")

    parser.add_argument("--eval-freq", type=int, default=0, help="Evaluation frequency in environment steps (0 disables).")
    parser.add_argument("--eval-games", type=int, default=200, help="Evaluation games per deterministic deck seed.")
    parser.add_argument("--eval-seed", type=int, default=101, help="Base random seed for evaluation environments.")
    parser.add_argument("--eval-num-envs", type=int, default=None, help="Optional num envs used only for evaluation.")
    parser.add_argument("--eval-vec-env", choices=VEC_ENV_CHOICES, default=None, help="Optional vec env backend used only for evaluation.")
    parser.add_argument("--eval-start-method", choices=START_METHOD_CHOICES, default="spawn")
    parser.add_argument("--eval-seeds", type=str, default=None, help="Comma-separated deterministic deck seeds used for periodic evaluation.")
    parser.add_argument("--num-eval-seeds", type=int, default=8, help="Default number of eval deck seeds when --eval-seeds is omitted.")
    parser.add_argument("--eval-seed-stride", type=int, default=1009, help="Stride used to generate default eval deck seeds.")

    parser.add_argument("--lr-start", type=float, default=3e-4)
    parser.add_argument("--lr-end", type=float, default=3e-4)
    parser.add_argument("--ent-start", type=float, default=0.01)
    parser.add_argument("--ent-end", type=float, default=0.01)
    parser.add_argument("--clip-range", type=float, default=0.2)
    parser.add_argument("--vf-coef", type=float, default=0.5)
    parser.add_argument("--max-grad-norm", type=float, default=0.5)
    parser.add_argument("--target-kl", type=float, default=None)

    parser.add_argument("--reward-mode", choices=("baseline", "dense_v1"), default="baseline")
    parser.add_argument("--reward-debug", action="store_true", help="Attach reward components in env info for debugging.")

    args = parser.parse_args()

    train(
        total_timesteps=args.timesteps,
        model_out=args.model_out,
        seed=args.seed,
        resume_from=args.resume_from,
        num_envs=args.num_envs,
        vec_env_kind=args.vec_env,
        start_method=args.start_method,
        max_episode_steps=args.max_episode_steps,
        save_freq=args.save_freq,
        save_dir=args.save_dir,
        eval_freq=args.eval_freq,
        eval_games=args.eval_games,
        eval_seed=args.eval_seed,
        eval_num_envs=args.eval_num_envs,
        eval_vec_env=args.eval_vec_env,
        eval_start_method=args.eval_start_method,
        eval_seeds=args.eval_seeds,
        num_eval_seeds=args.num_eval_seeds,
        eval_seed_stride=args.eval_seed_stride,
        lr_start=args.lr_start,
        lr_end=args.lr_end,
        ent_start=args.ent_start,
        ent_end=args.ent_end,
        clip_range=args.clip_range,
        vf_coef=args.vf_coef,
        max_grad_norm=args.max_grad_norm,
        target_kl=args.target_kl,
        reward_mode=args.reward_mode,
        reward_debug=args.reward_debug,
    )


if __name__ == "__main__":
    main()
