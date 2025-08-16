import gym
import numpy as np
from gym import spaces

class ScoundrelEnv(gym.Env):
    """
    Custom Environment for Scoundrel card game compatible with OpenAI Gym.
    """
    def __init__(self):
        super(ScoundrelEnv, self).__init__()
        self.observation_space = spaces.Box(low=0, high=20, shape=(10,), dtype=np.float32)
        self.action_space = spaces.MultiDiscrete([2, 4, 2])
        self.state = None
        self.done = False

    def reset(self):
        self.state = np.zeros(self.observation_space.shape)
        self.done = False
        return self.state

    def step(self, action):
        next_state = self.state.copy()
        reward = 0.0
        self.done = False
        info = {}
        return next_state, reward, self.done, info

    def render(self, mode='human'):
        print(f"State: {self.state}")

    def close(self):
        pass
