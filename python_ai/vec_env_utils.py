from __future__ import annotations

import os
from typing import Callable, Literal, Optional

import numpy as np
from sb3_contrib.common.wrappers import ActionMasker
from stable_baselines3.common.vec_env import DummyVecEnv, SubprocVecEnv, VecEnv

from scoundrel_env import ScoundrelEnv

VecEnvKind = Literal["subproc", "dummy"]
StartMethod = Literal["spawn", "fork", "forkserver"]

VEC_ENV_CHOICES: tuple[str, ...] = ("subproc", "dummy")
START_METHOD_CHOICES: tuple[str, ...] = ("spawn", "fork", "forkserver")


def action_mask_fn(env: ScoundrelEnv) -> np.ndarray:
    return env.action_masks()


def resolve_num_envs(requested: Optional[int]) -> int:
    if requested is not None:
        if requested < 1:
            raise ValueError("--num-envs must be >= 1.")
        return requested

    cpu_count = os.cpu_count() or 2
    return max(1, cpu_count - 1)


def resolve_vec_env_kind(requested: Optional[str], num_envs: int) -> VecEnvKind:
    if requested is None:
        return "subproc" if num_envs > 1 else "dummy"
    if requested not in VEC_ENV_CHOICES:
        raise ValueError(f"--vec-env must be one of {VEC_ENV_CHOICES}.")
    return requested  # type: ignore[return-value]


def make_env_factory(worker_idx: int, max_episode_steps: int, seed: int, wrap_action_masker: bool) -> Callable[[], object]:
    worker_seed = seed + worker_idx * 100_003

    def _factory() -> object:
        env = ScoundrelEnv(max_episode_steps=max_episode_steps)
        env.action_space.seed(worker_seed)
        env.observation_space.seed(worker_seed)
        if wrap_action_masker:
            return ActionMasker(env, action_mask_fn)
        return env

    return _factory


def build_vec_env(
    *,
    num_envs: int,
    vec_env_kind: VecEnvKind,
    start_method: str,
    max_episode_steps: int,
    seed: int,
    wrap_action_masker: bool,
) -> VecEnv:
    env_factories = [
        make_env_factory(
            worker_idx=worker_idx,
            max_episode_steps=max_episode_steps,
            seed=seed,
            wrap_action_masker=wrap_action_masker,
        )
        for worker_idx in range(num_envs)
    ]

    if vec_env_kind == "subproc" and num_envs > 1:
        if start_method not in START_METHOD_CHOICES:
            raise ValueError(f"--start-method must be one of {START_METHOD_CHOICES}.")
        return SubprocVecEnv(env_factories, start_method=start_method)

    return DummyVecEnv(env_factories)
