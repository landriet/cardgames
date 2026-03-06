from __future__ import annotations

import argparse
from pathlib import Path
from typing import Optional

from sb3_contrib import MaskablePPO
from sb3_contrib.common.maskable.utils import get_action_masks
from vec_env_utils import START_METHOD_CHOICES, VEC_ENV_CHOICES, build_vec_env, resolve_num_envs, resolve_vec_env_kind


def derive_n_steps(num_envs: int, target_rollout_size: int = 2048, min_steps: int = 64) -> int:
    return max(min_steps, target_rollout_size // max(num_envs, 1))


def derive_batch_size(rollout_size: int) -> int:
    for candidate in (512, 256, 128, 64, 32):
        if candidate <= rollout_size and rollout_size % candidate == 0:
            return candidate
    return max(1, min(rollout_size, 32))


def train(
    total_timesteps: int,
    model_out: Path,
    seed: int,
    resume_from: Optional[Path] = None,
    num_envs: Optional[int] = None,
    vec_env_kind: Optional[str] = None,
    start_method: str = "spawn",
    max_episode_steps: int = 200,
) -> None:
    resolved_num_envs = resolve_num_envs(num_envs)
    resolved_vec_env_kind = resolve_vec_env_kind(vec_env_kind, resolved_num_envs)
    vec_env = build_vec_env(
        num_envs=resolved_num_envs,
        vec_env_kind=resolved_vec_env_kind,
        start_method=start_method,
        max_episode_steps=max_episode_steps,
        seed=seed,
        wrap_action_masker=True,
    )
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
            model = MaskablePPO(
                policy="MlpPolicy",
                env=vec_env,
                seed=seed,
                learning_rate=3e-4,
                n_steps=n_steps,
                batch_size=batch_size,
                gamma=0.99,
                gae_lambda=0.95,
                ent_coef=0.01,
                verbose=1,
            )

        model.learn(total_timesteps=total_timesteps)

        model_out.parent.mkdir(parents=True, exist_ok=True)
        model.save(str(model_out))

        # Quick deterministic sanity rollout.
        obs = vec_env.reset()
        for _ in range(10):
            masks = get_action_masks(vec_env)
            action, _ = model.predict(obs, action_masks=masks, deterministic=True)
            obs, _, _, _ = vec_env.step(action)
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
    )


if __name__ == "__main__":
    main()
