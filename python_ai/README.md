# Scoundrel AI (TensorFlow PPO)

This folder contains the Python code for training a reinforcement learning agent (PPO) to beat the Scoundrel card game.

## Remaining Steps

1. **Port Game Logic**
   - Implement state transitions, action handling, and reward calculation in `scoundrel_env.py`.

2. **Complete Environment Implementation**
   - Encode game state as a fixed-size observation vector.
   - Decode agent actions into game moves (room choice, card selection, fight mode).
   - Implement reward logic (+1 for survival, +X for victory, -X for game over, or health delta).
   - Handle episode termination (victory or game over).

3. **Implement PPO Agent**
   - Use TensorFlow 2.13 and TF-Agents or custom PPO implementation.
   - Actor-Critic architecture (separate policy and value networks).
   - Normalize advantages, use entropy regularization, tune hyperparameters.

4. **Training Loop**
   - Run episodes, collect experience, and train the PPO agent.
   - Track and visualize training progress (rewards, win rate).

5. **Evaluation & Iteration**
   - Test the trained agent against the game.
   - Tune hyperparameters and improve state/action encoding as needed.

## Example File Structure

```
python_ai/
  scoundrel_env.py      # Custom Gym environment for Scoundrel
  train_ppo.py          # PPO agent and training loop (to be created)
  README.md             # This guide
```

## References

- [TensorFlow PPO Implementation Guide](https://markaicode.com/reinforcement-learning-ppo-from-scratch/)
- [TF-Agents Documentation](https://www.tensorflow.org/agents)
- [OpenAI Gym Documentation](https://www.gymlibrary.dev/)
