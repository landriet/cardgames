import gymnasium as gym
import numpy as np
from gymnasium import spaces

class ScoundrelEnv(gym.Env):
    """
    Custom Environment for Scoundrel card game compatible with OpenAI Gym.
    """
    def __init__(self):
        super(ScoundrelEnv, self).__init__()
        from api_client import ScoundrelAPIClient
        self.api = ScoundrelAPIClient()
        self.observation_space = spaces.Box(low=0, high=20, shape=(10,), dtype=np.float32)
        self.action_space = spaces.MultiDiscrete([2, 4, 2])
        self.state = None
        self.done = False
        self.last_health = None

    def reset(self):
        state = self.api.start_game()
        self.done = False
        self.last_health = state["health"]
        self.state = self._encode_state(state)
        return self.state

    def step(self, action):
        # Decode action: [room_choice, card_idx, mode]
        room_choice, card_idx, mode = action
        try:
            # Interact with API
            if room_choice == 0:
                state = self.api.avoid_room()
            else:
                state = self.api.enter_room()
            # Act on card
            state = self.api.act_on_card(card_idx, "attack" if mode == 1 else None)
            obs = self._encode_state(state)
            reward = 0.0
            if state.get("victory"):
                reward += 10.0
                self.done = True
            elif state.get("gameOver"):
                reward -= 10.0
                self.done = True
            else:
                health = state["health"]
                reward += health - self.last_health
                self.last_health = health
            info = {}
        except Exception as e:
            # Penalize invalid actions, end episode
            obs = self.state
            reward = -20.0
            self.done = True
            info = {"error": str(e)}
        return obs, reward, self.done, info
    # ...existing code...

    def render(self, mode='human'):
        print(f"State: {self.state}")

    def _encode_state(self, state):
        # Example: encode health, maxHealth, victory, gameOver, equippedWeapon, etc.
        obs = np.zeros(self.observation_space.shape, dtype=np.float32)
        obs[0] = state.get("health", 0)
        obs[1] = state.get("maxHealth", 0)
        obs[2] = 1.0 if state.get("victory") else 0.0
        obs[3] = 1.0 if state.get("gameOver") else 0.0
        obs[4] = 1.0 if state.get("equippedWeapon") else 0.0
        # ... add more features as needed
        return obs

    def close(self):
        pass
