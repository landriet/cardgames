import numpy as np
import tensorflow as tf
from tensorflow.keras.layers import Dense, Input
from tensorflow.keras.models import Model
from tensorflow.keras.optimizers import Adam
import matplotlib.pyplot as plt
from scoundrel_env import ScoundrelEnv

class PPOAgent:
    def __init__(self, state_dim, action_dim, action_bound=None, learning_rate=0.0003, 
                 gamma=0.99, clip_ratio=0.2, lmbda=0.95, value_coef=0.5, entropy_coef=0.01):
        self.state_dim = state_dim
        self.action_dim = action_dim
        self.action_bound = action_bound
        self.gamma = gamma
        self.clip_ratio = clip_ratio
        self.lmbda = lmbda
        self.value_coef = value_coef
        self.entropy_coef = entropy_coef
        self.actor, self.critic, self.policy = self._build_actor_critic_network()
        self.optimizer = Adam(learning_rate=learning_rate)

    def _build_actor_critic_network(self):
        state_input = Input(shape=(self.state_dim,))
        x = Dense(64, activation='relu')(state_input)
        x = Dense(64, activation='relu')(x)
        # For MultiDiscrete, output logits for each sub-action
        if isinstance(self.action_dim, (tuple, list, np.ndarray)):
            logits = [Dense(dim)(x) for dim in self.action_dim]
            actor = Model(inputs=state_input, outputs=logits)
            def policy(state, deterministic=False):
                logits_out = actor(state)
                actions = []
                for logits in logits_out:
                    if deterministic:
                        actions.append(int(tf.argmax(logits, axis=-1).numpy()[0]))
                    else:
                        actions.append(int(tf.random.categorical(logits, 1).numpy()[0][0]))
                return np.array(actions)
        else:
            logits = Dense(self.action_dim)(x)
            actor = Model(inputs=state_input, outputs=logits)
            def policy(state, deterministic=False):
                logits = actor(state)
                if deterministic:
                    return int(tf.argmax(logits, axis=-1).numpy()[0])
                else:
                    return int(tf.random.categorical(logits, 1).numpy()[0][0])
        x = Dense(64, activation='relu')(state_input)
        x = Dense(64, activation='relu')(x)
        value = Dense(1)(x)
        critic = Model(inputs=state_input, outputs=value)
        return actor, critic, policy

    def compute_gae(self, rewards, values, next_value, dones):
        advantages = np.zeros_like(rewards, dtype=np.float32)
        last_gae = 0
        for t in reversed(range(len(rewards))):
            next_val = next_value if t == len(rewards) - 1 else values[t + 1]
            delta = rewards[t] + self.gamma * next_val * (1 - dones[t]) - values[t]
            advantages[t] = last_gae = delta + self.gamma * self.lmbda * (1 - dones[t]) * last_gae
        returns = advantages + values
        return advantages, returns

    def get_action(self, state, deterministic=False):
        state = np.expand_dims(state, axis=0).astype(np.float32)
        return self.policy(state, deterministic)

    @tf.function
    def train_step(self, states, actions, advantages, old_logprobs, returns):
        with tf.GradientTape() as tape:
            logits_out = self.actor(states)
            # For MultiDiscrete, actions shape: [batch, num_subactions]
            if isinstance(self.action_dim, (tuple, list, np.ndarray)):
                logprobs = []
                entropy = 0.0
                for i, logits in enumerate(logits_out):
                    dist = tf.compat.v1.distributions.Categorical(logits=logits)
                    logprobs.append(dist.log_prob(actions[:, i]))
                    entropy += tf.reduce_mean(dist.entropy())
                logprobs = tf.reduce_sum(tf.stack(logprobs, axis=1), axis=1)
            else:
                dist = tf.compat.v1.distributions.Categorical(logits=logits_out)
                logprobs = dist.log_prob(actions)
                entropy = tf.reduce_mean(dist.entropy())
            values = self.critic(states)
            values = tf.squeeze(values)
            ratio = tf.exp(logprobs - old_logprobs)
            obj1 = ratio * advantages
            obj2 = tf.clip_by_value(ratio, 1.0 - self.clip_ratio, 1.0 + self.clip_ratio) * advantages
            policy_loss = -tf.reduce_mean(tf.minimum(obj1, obj2))
            value_loss = tf.reduce_mean(tf.square(returns - values))
            loss = policy_loss + self.value_coef * value_loss - self.entropy_coef * entropy
        variables = self.actor.trainable_variables + self.critic.trainable_variables
        gradients = tape.gradient(loss, variables)
        self.optimizer.apply_gradients(zip(gradients, variables))
        return policy_loss, value_loss, entropy

# Training loop
def train_ppo(episodes=500, max_steps=1000, update_epochs=10, batch_size=64):
    env = ScoundrelEnv()
    state_dim = env.observation_space.shape[0]
    # For MultiDiscrete, use nvec
    if hasattr(env.action_space, 'nvec'):
        action_dim = env.action_space.nvec
    else:
        action_dim = env.action_space.n
    agent = PPOAgent(state_dim, action_dim)
    episode_rewards = []
    avg_rewards = []
    for episode in range(episodes):
        states, actions, rewards, dones, old_logprobs = [], [], [], [], []
        episode_reward = 0
        state = env.reset()
        for t in range(max_steps):
            action = agent.get_action(state)
            # Convert numpy.int64 to Python int for API compatibility
            if hasattr(env.action_space, 'nvec'):
                action = [int(a) for a in action]
                logits_out = agent.actor(np.expand_dims(state, axis=0))
                logprobs = []
                for i, logits in enumerate(logits_out):
                    dist = tf.compat.v1.distributions.Categorical(logits=logits)
                    logprobs.append(dist.log_prob(action[i]))
                logprob = np.sum([lp.numpy() for lp in logprobs])
            else:
                logits = agent.actor(np.expand_dims(state, axis=0))
                dist = tf.compat.v1.distributions.Categorical(logits=logits)
                logprob = dist.log_prob(action)
            next_state, reward, done, _ = env.step(action)
            states.append(state)
            actions.append(action)
            rewards.append(reward)
            dones.append(done)
            old_logprobs.append(logprob)
            state = next_state
            episode_reward += reward
            if done:
                break
        states = np.array(states, dtype=np.float32)
        # For MultiDiscrete, actions shape: [steps, num_subactions]
        if hasattr(env.action_space, 'nvec'):
            actions = np.array(actions, dtype=np.int32)
        else:
            actions = np.array(actions, dtype=np.float32)
        rewards = np.array(rewards, dtype=np.float32)
        dones = np.array(dones, dtype=np.float32)
        old_logprobs = np.array(old_logprobs, dtype=np.float32)
        values = agent.critic(states).numpy().squeeze()
        next_value = agent.critic(np.expand_dims(next_state, axis=0)).numpy()[0, 0] if not done else 0.0
        advantages, returns = agent.compute_gae(rewards, values, next_value, dones)
        advantages = (advantages - advantages.mean()) / (advantages.std() + 1e-8)
        for _ in range(update_epochs):
            indices = np.arange(len(states))
            np.random.shuffle(indices)
            for start in range(0, len(states), batch_size):
                end = start + batch_size
                batch_indices = indices[start:end]
                agent.train_step(
                    states=tf.convert_to_tensor(states[batch_indices], dtype=tf.float32),
                    actions=tf.convert_to_tensor(actions[batch_indices], dtype=tf.float32),
                    advantages=tf.convert_to_tensor(advantages[batch_indices], dtype=tf.float32),
                    old_logprobs=tf.convert_to_tensor(old_logprobs[batch_indices], dtype=tf.float32),
                    returns=tf.convert_to_tensor(returns[batch_indices], dtype=tf.float32)
                )
        episode_rewards.append(episode_reward)
        avg_reward = np.mean(episode_rewards[-100:])
        avg_rewards.append(avg_reward)
        if (episode + 1) % 10 == 0:
            print(f"Episode {episode + 1}/{episodes}, Reward: {episode_reward:.2f}, Avg Reward: {avg_reward:.2f}")
    plt.figure(figsize=(10, 6))
    plt.plot(episode_rewards, label='Episode Reward')
    plt.plot(avg_rewards, label='Average Reward (100 episodes)')
    plt.xlabel('Episode')
    plt.ylabel('Reward')
    plt.title('PPO Training Progress on Scoundrel')
    plt.legend()
    plt.grid(True)
    plt.savefig('ppo_training_progress.png')
    plt.show()
    return agent, episode_rewards, avg_rewards

if __name__ == "__main__":
    tf.random.set_seed(42)
    np.random.seed(42)
    train_ppo(episodes=200, max_steps=500, update_epochs=5, batch_size=64)
