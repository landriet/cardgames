from __future__ import annotations

import argparse
from pathlib import Path

from sb3_contrib import MaskablePPO
from sb3_contrib.common.maskable.utils import get_action_masks
from sb3_contrib.common.wrappers import ActionMasker
from stable_baselines3.common.vec_env import DummyVecEnv

from scoundrel_env import ScoundrelEnv


def make_env() -> ActionMasker:
    env = ScoundrelEnv()
    return ActionMasker(env, lambda e: e.action_masks())


def train(total_timesteps: int, model_out: Path, seed: int) -> None:
    vec_env = DummyVecEnv([make_env])

    model = MaskablePPO(
        policy="MlpPolicy",
        env=vec_env,
        seed=seed,
        learning_rate=3e-4,
        n_steps=2048,
        batch_size=256,
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
        obs, _, dones, _ = vec_env.step(action)
        if bool(dones[0]):
            obs = vec_env.reset()

    vec_env.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Train Scoundrel MaskablePPO agent with local engine worker bridge.")
    parser.add_argument("--timesteps", type=int, default=1_000_000)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--model-out", type=Path, default=Path("python_ai/models/scoundrel_maskable_ppo"))
    args = parser.parse_args()

    train(total_timesteps=args.timesteps, model_out=args.model_out, seed=args.seed)


if __name__ == "__main__":
    main()
