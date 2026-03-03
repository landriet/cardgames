# Deep RL Agent for Scoundrel

## Goal

Train a neural network agent that plays Scoundrel under realistic conditions (no knowledge of deck order), then measure its win rate against the oracle solver's theoretical ceiling.

## Why Deep RL

The game has a compact state space but too many distinct states for tabular methods. A neural network can generalize across similar positions. The existing tabular Q-learning agent (`src/trainAI.ts`) can't scale to include discard tracking — the state space explodes. Deep RL handles this naturally via function approximation.

## State Representation

The agent observes only what a human player would see. No deck peeking.

### Input Vector (~104 features)

```
Section 1: Player state (5 floats)
  health / maxHealth                     # normalized 0-1
  equippedWeapon rank / 14               # 0 if none
  lastMonsterDefeated rank / 14          # 0 if none
  monstersOnWeapon count / 4             # normalized
  potionTakenThisTurn                    # 0 or 1

Section 2: Game flags (3 floats)
  canDeferRoom                           # 0 or 1
  lastActionWasDefer                     # 0 or 1
  cardsRemainingInDeck / 44              # normalized 0-1

Section 3: Room cards (4 slots x 3 floats = 12 floats)
  Per slot:
    type one-hot: [monster, weapon, potion]   # [0,0,0] if empty
  Per slot:
    rank / 14                                 # 0 if empty
    suit one-hot for monsters: [clubs, spades] # needed for card identity

  Alternative: 4 slots x 4 floats = 16 floats
    [isMonster, isWeapon, isPotion, rank/14]

Section 4: Discard knowledge (44 floats)
  One bit per card in the standard 44-card deck.
  1 = card has been seen (played, discarded, or currently visible in room).
  0 = card location unknown (still in deck or carried forward unseen).
  This lets the network infer what's likely coming.

Section 5: Monsters on weapon detail (4 floats)
  Ranks of up to 4 monsters stacked on weapon, normalized.
  Padding with 0 for empty slots.
```

Total: ~68 floats. Small enough for a simple MLP.

### Why Discard Knowledge Matters

Without it, the agent can't distinguish "early game, anything could come" from "late game, only high monsters remain." This is the single most important feature for bridging the gap between a naive agent and a strong one. A human player implicitly tracks this ("I've seen both aces, so the hardest remaining monster is a king").

## Action Space

Two distinct game phases share a single action head:

```
Action 0:  enterRoom
Action 1:  skipRoom
Action 2:  playCard(slot 0, barehanded)
Action 3:  playCard(slot 0, weapon)
Action 4:  playCard(slot 1, barehanded)
Action 5:  playCard(slot 1, weapon)
Action 6:  playCard(slot 2, barehanded)
Action 7:  playCard(slot 2, weapon)
Action 8:  playCard(slot 3, barehanded)
Action 9:  playCard(slot 3, weapon)
```

10 possible actions. Illegal actions are masked to -infinity before softmax. The weapon mode for potions/weapons is harmless (mapped to the default play action). Alternatively, weapon mode can be masked out for non-monster cards.

Simpler encoding: since potions and weapons don't have a mode choice, collapse to:

```
Action 0:  enterRoom
Action 1:  skipRoom
Action 2:  play slot 0 (barehanded if monster)
Action 3:  play slot 0 (weapon if monster)
Action 4:  play slot 1 (barehanded)
Action 5:  play slot 1 (weapon)
Action 6:  play slot 2 (barehanded)
Action 7:  play slot 2 (weapon)
Action 8:  play slot 3 (barehanded)
Action 9:  play slot 3 (weapon)
```

Mask illegal actions per step. For non-monster cards, mask the weapon variant. For non-room phase, mask all play actions. For room phase, mask enter/skip.

## Network Architecture

```
Input (68 floats)
  |
  Dense(256, ReLU)
  |
  Dense(256, ReLU)
  |
  Dense(128, ReLU)
  |
  +--- Policy head --> Dense(10) --> masked softmax --> action probabilities
  |
  +--- Value head  --> Dense(1)  --> tanh --> state value in [-1, 1]
```

No recurrence needed. The discard bit vector provides full history information — the network doesn't need to remember previous steps because the observation already encodes what it has seen.

## Training Algorithm: PPO

Proximal Policy Optimization. Standard choice for discrete action spaces with moderate episode lengths.

### Hyperparameters (starting point)

| Parameter              | Value      |
| ---------------------- | ---------- |
| Learning rate          | 3e-4       |
| Gamma (discount)       | 0.99       |
| GAE lambda             | 0.95       |
| Clip epsilon           | 0.2        |
| Entropy coefficient    | 0.01       |
| Value loss coefficient | 0.5        |
| Batch size             | 2048 steps |
| Mini-batch size        | 256        |
| Epochs per batch       | 4          |
| Max episode steps      | 60         |

### Reward Design

```
Per step:
  If game won:    +1.0
  If game lost:   -1.0
  Otherwise:      healthDelta / maxHealth * 0.1   # small shaping signal
```

The per-step health shaping gives gradient signal before episode end. Coefficient of 0.1 keeps it subordinate to the win/loss outcome. The agent shouldn't learn to hoard potions just for the intermediate reward.

Alternative reward for measuring score quality:

```
  If game won:    health / maxHealth              # higher health = better
  If game lost:   -1.0 + (health / maxHealth)     # less negative = better
```

This encourages winning with high health, which correlates with good play.

### Training Loop

```
for iteration in 1..N:
    # Collect experience
    Play 2048 steps across parallel environments (32-64 envs)
    Store (state, action, reward, value, logprob) for each step

    # Compute advantages
    GAE(rewards, values, gamma=0.99, lambda=0.95)

    # Update policy
    for epoch in 1..4:
        for mini_batch in shuffle(batch, size=256):
            ratio = new_logprob / old_logprob
            clipped = clip(ratio, 1-eps, 1+eps) * advantage
            policy_loss = -min(ratio * advantage, clipped)
            value_loss = (value - returns)^2
            entropy = -sum(p * log(p))
            loss = policy_loss + 0.5 * value_loss - 0.01 * entropy
            backprop(loss)

    # Log metrics
    Log mean episode reward, win rate, average score
```

### Training Duration Estimate

Scoundrel episodes are short (~40-50 steps). With 64 parallel environments:

- 2048 steps/batch = ~40 episodes/batch
- 1000 batches = ~40,000 games
- Expect convergence in 50,000-200,000 games

## Implementation Options

### Option A: TypeScript (with the existing engine)

Use the class-based engine directly. Train in Node.js with a lightweight ML library.

```
src/engine-lib/
  src/
    rl/
      environment.ts    # Gym-like wrapper around Game
      network.ts        # MLP with policy+value heads
      ppo.ts            # PPO training loop
      evaluate.ts       # Compare agent vs oracle solver
  train-agent.ts        # CLI entry point
```

**Pros**: No Python dependency, reuses engine directly, single language.
**Cons**: JS ML ecosystem is weaker. TensorFlow.js or ONNX runtime work but are less ergonomic than PyTorch.

### Option B: Python (with API server)

Use the existing Express API server (`src/api/server.ts`) as the game backend. Train in Python with PyTorch.

```
python_ai/
  deep_rl/
    environment.py      # Gym env that calls the API or reimplements logic
    network.py          # PyTorch MLP
    ppo.py              # PPO training
    evaluate.py         # Compare agent vs oracle
```

**Pros**: PyTorch is the gold standard for RL. Better tooling (TensorBoard, stable-baselines3).
**Cons**: API latency per step. Could reimplement the game in Python for speed.

### Option C: Python with stable-baselines3

Use stable-baselines3 (SB3) which provides battle-tested PPO. Only need to write the Gym environment.

```
python_ai/
  deep_rl/
    scoundrel_env.py    # gym.Env subclass
    train.py            # SB3 PPO training (~20 lines)
    evaluate.py         # Load model, play games, compare to oracle
```

**Pros**: Minimal code. SB3 handles all training logic. Well-tested.
**Cons**: Need game logic in Python (the existing `python_ai/scoundrel_env.py` is a starting point).

**Recommendation**: Option C. Fastest path to results. The existing Python env needs updating to include discard tracking in observations, but the game logic is already there.

## Evaluation Protocol

For each test game (N=10,000):

1. Shuffle a deck
2. Run the trained agent (sees only room + known cards) → agent_score, agent_won
3. Run the oracle solver (same deck order) → oracle_score, oracle_won
4. Record both results

### Metrics

| Metric                              | What it measures                                             |
| ----------------------------------- | ------------------------------------------------------------ |
| Agent win rate                      | Practical game difficulty                                    |
| Oracle win rate                     | Theoretical ceiling                                          |
| Win rate gap                        | Performance lost to imperfect information                    |
| Score correlation                   | How well agent tracks optimal play                           |
| Regret (oracle_score - agent_score) | Average per-game cost of uncertainty                         |
| Unwinnable loss rate                | Agent losses on decks the oracle also loses — unavoidable    |
| Winnable loss rate                  | Agent losses on decks the oracle wins — room for improvement |

The **winnable loss rate** is the most actionable metric. It tells you exactly how many games the agent throws away due to suboptimal decisions.

## Curriculum and Improvements

### Phase 1: Basic training

Train on standard rules. Target: 50-60% win rate.

### Phase 2: Discard tracking

Add the 44-bit card-seen vector. Target: 60-70% win rate.

### Phase 3: Oracle distillation

Use the oracle solver to label training games: for each state, what did the oracle choose? Add an imitation loss alongside the RL loss. This is the "expert demonstration" signal. Target: 70-80% win rate.

### Phase 4: PIMC hybrid

For hard decisions (low confidence from the policy), fall back to PIMC sampling (run oracle on N random deck completions). This is expensive but only triggered when the agent is uncertain. Target: 80-85% win rate.

## Expected Results

| Agent                         | Estimated Win Rate | Notes                        |
| ----------------------------- | ------------------ | ---------------------------- |
| Random legal play             | 20-30%             | Baseline                     |
| Tabular Q-learning (existing) | 35-45%             | Limited state representation |
| Deep RL (basic)               | 50-60%             | MLP, health + room features  |
| Deep RL (discard tracking)    | 60-70%             | Full observation vector      |
| Deep RL (oracle distillation) | 70-80%             | Learns from optimal play     |
| PIMC (N=50 samples)           | 80-90%             | Near-optimal but slow        |
| Oracle solver                 | ~95%               | Theoretical maximum          |

The 95% → real-play gap is the **price of uncertainty**. A well-trained Deep RL agent should recover most of it.
