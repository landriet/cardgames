# RL Quality Improvements: Observation Enrichment + Reward Shaping

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Improve trained agent quality (currently 16.5% win rate, avg score -21.9) by enriching the observation space and adding a new reward mode.

**Architecture:** Add derived features to the observation vector (deck composition stats, weapon effectiveness signals, health risk) — expanding from 74-dim to 84-dim. Add a `dense_v2` reward mode with better terminal scaling, weapon-use shaping, and survival bonus. Both changes are additive: existing `dense_v1` and 74-dim encoding remain untouched for backward compatibility. New models trained with v2 obs/reward are not compatible with old v1 checkpoints (different obs size), but the env supports both via config.

**Tech Stack:** Python, numpy, gymnasium, sb3-contrib MaskablePPO

**Current performance (dense_v1, 20M steps):**

- Win rate: 16.5%
- Avg score: -21.9
- Random baseline: 0% win rate, avg score -171.2

---

### Task 1: Add derived observation features to engine.py

**Files:**

- Modify: `python_ai/engine.py:582-652` (encode_observation)
- Test: `python_ai/tests/test_engine.py`

**Context:** The current 74-dim observation encodes raw state. A skilled player uses derived information: "how many monsters remain unseen?", "what's my weapon's remaining kill capacity?", "how dangerous is the remaining deck?". We add 10 new features (indices 74-83) to a new encoder `encode_observation_v2` while keeping the original untouched.

New features (all normalized 0-1):

```
[74] unseen_monster_count / 26        # how many monsters haven't been seen
[75] unseen_potion_count / 9          # how many potions haven't been seen
[76] unseen_weapon_count / 9          # how many weapons haven't been seen
[77] avg_unseen_monster_rank / 14     # average rank of unseen monsters (0 if none)
[78] max_unseen_monster_rank / 14     # max rank of unseen monsters (0 if none)
[79] weapon_kills_remaining / 4       # how many more monsters can current weapon kill (0 if no weapon)
[80] weapon_effective_damage_ratio    # equipped_weapon.rank / 14 * (1 if can_still_kill else 0)
[81] health_risk_ratio                # avg_unseen_monster_rank / max(health, 1) clamped to [0,1]
[82] deck_progress                    # 1 - len(deck) / 44  (how far through the dungeon)
[83] survival_margin                  # health / (sum_unseen_monster_ranks + 1) clamped to [0,1]
```

**Step 1: Write failing tests for the new observation features**

Add to `python_ai/tests/test_engine.py`:

```python
class TestEncodeObservationV2:
    """Tests for the enriched 84-dim observation encoder."""

    def test_v2_output_shape(self):
        from engine import encode_observation_v2, init_game
        state = init_game(seed=42)
        obs = encode_observation_v2(state)
        assert obs.shape == (84,), f"Expected shape (84,), got {obs.shape}"
        assert obs.dtype == np.float32

    def test_v2_first_74_match_v1(self):
        from engine import encode_observation, encode_observation_v2, init_game
        state = init_game(seed=42)
        v1 = encode_observation(state)
        v2 = encode_observation_v2(state)
        np.testing.assert_array_equal(v1, v2[:74])

    def test_v2_unseen_counts_at_start(self):
        from engine import encode_observation_v2, init_game
        state = init_game(seed=42)
        obs = encode_observation_v2(state)
        # At start, 4 cards are in room (seen), rest are unseen
        # Room has 4 cards visible; the exact counts depend on the seed
        # but total unseen = 44 - 4 (room) = 40 cards
        # Just check the features are in valid range
        assert 0.0 <= obs[74] <= 1.0  # unseen_monster_count / 26
        assert 0.0 <= obs[75] <= 1.0  # unseen_potion_count / 9
        assert 0.0 <= obs[76] <= 1.0  # unseen_weapon_count / 9

    def test_v2_unseen_counts_near_end(self):
        from engine import (
            Card, CardType, Suit, GameState,
            encode_observation_v2,
        )
        # Construct a near-end state: empty deck, 2 cards in room
        state = GameState(
            deck=[],
            discard=[Card(CardType.MONSTER, Suit.CLUBS, r) for r in range(2, 10)],
            room=[
                Card(CardType.MONSTER, Suit.SPADES, 5),
                Card(CardType.POTION, Suit.HEARTS, 3),
            ],
            equipped_weapon=None,
            last_monster_defeated=None,
            monsters_on_weapon=[],
            health=10,
            max_health=20,
            can_defer_room=False,
            last_action_was_defer=False,
            game_over=False,
            victory=False,
            potion_taken_this_turn=False,
            potions_taken_this_turn=0,
            room_being_entered=True,
            cards_resolved_this_turn=0,
            last_resolved_card_type=None,
            last_resolved_potion_value=None,
        )
        obs = encode_observation_v2(state)
        # deck_progress = 1 - 0/44 = 1.0
        assert obs[82] == pytest.approx(1.0, abs=1e-6)

    def test_v2_weapon_kills_remaining(self):
        from engine import (
            Card, CardType, Suit, GameState,
            encode_observation_v2,
        )
        weapon = Card(CardType.WEAPON, Suit.DIAMONDS, 8)
        last_killed = Card(CardType.MONSTER, Suit.CLUBS, 6)
        state = GameState(
            deck=[Card(CardType.MONSTER, Suit.SPADES, r) for r in [3, 5, 7, 10]],
            discard=[],
            room=[Card(CardType.MONSTER, Suit.CLUBS, 4)],
            equipped_weapon=weapon,
            last_monster_defeated=last_killed,
            monsters_on_weapon=[last_killed],
            health=15,
            max_health=20,
            can_defer_room=True,
            last_action_was_defer=False,
            game_over=False,
            victory=False,
            potion_taken_this_turn=False,
            potions_taken_this_turn=0,
            room_being_entered=True,
            cards_resolved_this_turn=0,
            last_resolved_card_type=None,
            last_resolved_potion_value=None,
        )
        obs = encode_observation_v2(state)
        # weapon_kills_remaining: monsters in deck+room with rank <= last_killed.rank (6)
        # deck monsters: 3, 5 qualify (rank<=6); 7, 10 don't. Room: 4 qualifies.
        # Total killable = 3, but capped at 4, so 3/4 = 0.75
        assert obs[79] == pytest.approx(3.0 / 4.0, abs=1e-6)

    def test_v2_no_weapon_zeros(self):
        from engine import encode_observation_v2, init_game
        state = init_game(seed=42)
        obs = encode_observation_v2(state)
        # No weapon at start
        assert obs[79] == 0.0  # weapon_kills_remaining
        assert obs[80] == 0.0  # weapon_effective_damage_ratio

    def test_v2_health_risk_and_survival(self):
        from engine import (
            Card, CardType, Suit, GameState,
            encode_observation_v2,
        )
        state = GameState(
            deck=[Card(CardType.MONSTER, Suit.CLUBS, 10),
                  Card(CardType.MONSTER, Suit.SPADES, 8)],
            discard=[],
            room=[Card(CardType.POTION, Suit.HEARTS, 5)],
            equipped_weapon=None,
            last_monster_defeated=None,
            monsters_on_weapon=[],
            health=5,
            max_health=20,
            can_defer_room=True,
            last_action_was_defer=False,
            game_over=False,
            victory=False,
            potion_taken_this_turn=False,
            potions_taken_this_turn=0,
            room_being_entered=True,
            cards_resolved_this_turn=0,
            last_resolved_card_type=None,
            last_resolved_potion_value=None,
        )
        obs = encode_observation_v2(state)
        # avg_unseen_monster_rank: (10+8)/2 = 9.0 (deck monsters only, room potion not a monster)
        # health_risk = 9.0 / max(5, 1) = 1.8 -> clamped to 1.0
        assert obs[81] == pytest.approx(1.0, abs=1e-6)
        # survival_margin = 5 / (10+8+1) = 5/19 ~ 0.263
        assert obs[83] == pytest.approx(5.0 / 19.0, abs=1e-3)

    def test_v2_all_features_bounded(self):
        """All 84 features should be in [0, 1]."""
        from engine import encode_observation_v2, init_game, play_card, enter_room
        state = init_game(seed=100)
        for _ in range(20):
            obs = encode_observation_v2(state)
            assert np.all(obs >= 0.0) and np.all(obs <= 1.0), f"Out of bounds: {obs}"
            from engine import get_legal_actions
            actions = get_legal_actions(state)
            if not actions:
                break
            action = actions[0]
            if action.action_type == "enterRoom":
                state = enter_room(state)
            elif action.action_type == "skipRoom":
                from engine import avoid_room
                state = avoid_room(state)
            else:
                state = play_card(state, action.card_index, action.mode)
```

**Step 2: Run tests to verify they fail**

Run: `cd python_ai && .venv/bin/python -m pytest tests/test_engine.py::TestEncodeObservationV2 -v`
Expected: FAIL with `ImportError: cannot import name 'encode_observation_v2'`

**Step 3: Implement encode_observation_v2 in engine.py**

Add after the existing `encode_observation` function (after line 652):

```python
def encode_observation_v2(state: GameState) -> "np.ndarray":
    """Encode *state* as an 84-dimensional float32 observation vector.

    Extends encode_observation with 10 derived features at indices 74-83:
        [74] unseen_monster_count / 26
        [75] unseen_potion_count / 9
        [76] unseen_weapon_count / 9
        [77] avg_unseen_monster_rank / 14
        [78] max_unseen_monster_rank / 14
        [79] weapon_kills_remaining / 4
        [80] weapon_effective_damage_ratio
        [81] health_risk_ratio
        [82] deck_progress
        [83] survival_margin
    """
    import numpy as np

    base = encode_observation(state)
    obs = np.zeros(84, dtype=np.float32)
    obs[:74] = base

    # Compute seen card set (same logic as encode_observation's seen-bits).
    seen: set[Card] = set()
    seen.update(state.discard)
    seen.update(state.room)
    if state.equipped_weapon is not None:
        seen.add(state.equipped_weapon)
    seen.update(state.monsters_on_weapon)

    # Unseen cards = canonical cards not in the seen set.
    unseen_monsters: list[Card] = []
    unseen_potions = 0
    unseen_weapons = 0
    for card in _CANONICAL_ORDER:
        if card not in seen:
            if card.card_type == CardType.MONSTER:
                unseen_monsters.append(card)
            elif card.card_type == CardType.POTION:
                unseen_potions += 1
            elif card.card_type == CardType.WEAPON:
                unseen_weapons += 1

    obs[74] = len(unseen_monsters) / 26.0
    obs[75] = unseen_potions / 9.0
    obs[76] = unseen_weapons / 9.0

    if unseen_monsters:
        ranks = [m.rank for m in unseen_monsters]
        avg_rank = sum(ranks) / len(ranks)
        max_rank = max(ranks)
        sum_ranks = sum(ranks)
    else:
        avg_rank = 0.0
        max_rank = 0.0
        sum_ranks = 0.0

    obs[77] = avg_rank / _MAX_RANK
    obs[78] = max_rank / _MAX_RANK

    # Weapon kills remaining: count unseen monsters with rank <= weapon lock value.
    if state.equipped_weapon is not None and state.last_monster_defeated is not None:
        kill_limit = state.last_monster_defeated.rank
        killable = sum(1 for m in unseen_monsters if m.rank <= kill_limit)
        # Also count room monsters that are killable.
        for card in state.room:
            if card.card_type == CardType.MONSTER and card.rank <= kill_limit:
                killable += 1
        obs[79] = min(killable, 4) / 4.0
        obs[80] = state.equipped_weapon.rank / _MAX_RANK
    elif state.equipped_weapon is not None:
        # Weapon equipped but no kill yet — can kill any monster.
        obs[79] = min(len(unseen_monsters) + sum(
            1 for c in state.room if c.card_type == CardType.MONSTER
        ), 4) / 4.0
        obs[80] = state.equipped_weapon.rank / _MAX_RANK
    else:
        obs[79] = 0.0
        obs[80] = 0.0

    # Health risk ratio.
    health = max(state.health, 1)
    obs[81] = min(avg_rank / health, 1.0) if avg_rank > 0 else 0.0

    # Deck progress.
    obs[82] = 1.0 - min(len(state.deck), 44) / 44.0

    # Survival margin.
    obs[83] = min(state.health / (sum_ranks + 1.0), 1.0)

    return obs
```

**Step 4: Run tests to verify they pass**

Run: `cd python_ai && .venv/bin/python -m pytest tests/test_engine.py::TestEncodeObservationV2 -v`
Expected: All 8 tests PASS

**Step 5: Commit**

```bash
git add python_ai/engine.py python_ai/tests/test_engine.py
git commit -m "feat(rl): add encode_observation_v2 with 10 derived features (84-dim)"
```

---

### Task 2: Wire v2 observation into ScoundrelEnv

**Files:**

- Modify: `python_ai/scoundrel_env.py:1-57,127-142`
- Test: `python_ai/tests/test_env_integration.py`

**Context:** `ScoundrelEnv` needs an `obs_version` parameter to switch between 74-dim (v1) and 84-dim (v2) observation. This keeps backward compatibility with existing trained models.

**Step 1: Write failing tests**

Add to `python_ai/tests/test_env_integration.py`:

```python
class TestObsV2Integration:
    """Test ScoundrelEnv with obs_version=2."""

    def test_v2_obs_shape(self):
        env = ScoundrelEnv(obs_version=2)
        obs, _ = env.reset()
        assert obs.shape == (84,)

    def test_v2_obs_space(self):
        env = ScoundrelEnv(obs_version=2)
        assert env.observation_space.shape == (84,)

    def test_v2_step_obs_shape(self):
        env = ScoundrelEnv(obs_version=2)
        obs, _ = env.reset()
        mask = env.action_masks()
        action = int(np.where(mask)[0][0])
        obs2, _, _, _, _ = env.step(action)
        assert obs2.shape == (84,)

    def test_v1_default_unchanged(self):
        env = ScoundrelEnv()
        obs, _ = env.reset()
        assert obs.shape == (74,)

    def test_v2_full_episode(self):
        env = ScoundrelEnv(obs_version=2, reward_mode="dense_v2")
        obs, _ = env.reset()
        done = False
        steps = 0
        while not done and steps < 200:
            mask = env.action_masks()
            action = int(np.where(mask)[0][0])
            obs, _, terminated, truncated, _ = env.step(action)
            done = terminated or truncated
            steps += 1
            assert obs.shape == (84,)
```

**Step 2: Run tests to verify they fail**

Run: `cd python_ai && .venv/bin/python -m pytest tests/test_env_integration.py::TestObsV2Integration -v`
Expected: FAIL with `TypeError: __init__() got an unexpected keyword argument 'obs_version'`

**Step 3: Implement obs_version support in ScoundrelEnv**

Modify `python_ai/scoundrel_env.py`:

1. Add import for `encode_observation_v2`:

```python
from engine import (
    GameState,
    avoid_room,
    build_action_mask,
    calculate_score,
    encode_observation,
    encode_observation_v2,
    enter_room,
    init_game,
    play_card,
)
```

2. Update `OBS_SIZE` to be computed from version, and update `__init__`:

```python
OBS_SIZES = {1: 74, 2: 84}

class ScoundrelEnv(gym.Env[np.ndarray, int]):
    metadata = {"render_modes": ["human"]}

    def __init__(
        self,
        max_episode_steps: int = 200,
        deck_seed: Optional[int] = None,
        reward_mode: str = "baseline",
        reward_debug: bool = False,
        obs_version: int = 1,
    ) -> None:
        super().__init__()
        self.obs_version = obs_version
        obs_size = OBS_SIZES[obs_version]
        # ... rest stays same but use obs_size instead of OBS_SIZE:
        self._last_obs = np.zeros(obs_size, dtype=np.float32)
        # ...
        self.observation_space = spaces.Box(low=0.0, high=1.0, shape=(obs_size,), dtype=np.float32)
```

3. Update `_sync_from_state` to pick the right encoder:

```python
    def _sync_from_state(self, state: GameState) -> None:
        terminal = state.game_over or state.victory
        if self.obs_version == 2:
            self._last_obs = encode_observation_v2(state)
        else:
            self._last_obs = encode_observation(state)
        self._last_mask = build_action_mask(state)
        # ... rest unchanged
```

**Step 4: Run tests to verify they pass**

Run: `cd python_ai && .venv/bin/python -m pytest tests/test_env_integration.py::TestObsV2Integration -v`
Expected: 4 of 5 PASS (the `dense_v2` test will fail — that's Task 3)

Run: `cd python_ai && .venv/bin/python -m pytest tests/test_env_integration.py -v`
Expected: All existing v1 tests still PASS

**Step 5: Commit**

```bash
git add python_ai/scoundrel_env.py python_ai/tests/test_env_integration.py
git commit -m "feat(rl): add obs_version parameter to ScoundrelEnv for v2 84-dim obs"
```

---

### Task 3: Add dense_v2 reward mode

**Files:**

- Modify: `python_ai/scoundrel_env.py:144-217`
- Test: `python_ai/tests/test_env_integration.py`

**Context:** The current reward modes have issues: `baseline` has almost no shaping signal, `dense_v1` penalizes skipping rooms (a valid strategy) and compresses scores via `/100`. The new `dense_v2` mode addresses:

1. **Better terminal scaling**: `score / 40` instead of `/ 100` (practical score range is roughly -40 to +25).
2. **Weapon use bonus**: Small reward when equipping a weapon or killing a monster with a weapon (the key skill).
3. **No skip penalty**: Removing the skip penalty lets the agent learn when skipping is correct.
4. **Survival bonus**: Small per-step reward for staying alive to encourage longevity.
5. **Victory bonus**: Flat +0.5 bonus on top of score for winning.

**Step 1: Write failing tests for dense_v2 rewards**

Add to `python_ai/tests/test_env_integration.py`:

```python
class TestDenseV2Reward:
    """Test dense_v2 reward mode."""

    def test_dense_v2_returns_components(self):
        env = ScoundrelEnv(reward_mode="dense_v2", reward_debug=True)
        obs, _ = env.reset()
        mask = env.action_masks()
        action = int(np.where(mask)[0][0])
        _, reward, _, _, info = env.step(action)
        assert "rewardComponents" in info
        components = info["rewardComponents"]
        assert "health" in components
        assert "weapon" in components
        assert "survival" in components
        assert "terminal" in components
        assert "total" in components

    def test_dense_v2_survival_bonus(self):
        env = ScoundrelEnv(reward_mode="dense_v2", reward_debug=True)
        obs, _ = env.reset()
        mask = env.action_masks()
        action = int(np.where(mask)[0][0])
        _, reward, terminated, _, info = env.step(action)
        if not terminated:
            components = info["rewardComponents"]
            assert components["survival"] > 0.0

    def test_dense_v2_terminal_uses_40_scale(self):
        """Verify terminal reward uses /40 not /100 scaling."""
        env = ScoundrelEnv(reward_mode="dense_v2", reward_debug=True)
        obs, _ = env.reset()
        done = False
        steps = 0
        last_info = {}
        while not done and steps < 200:
            mask = env.action_masks()
            action = int(np.where(mask)[0][0])
            _, _, terminated, truncated, info = env.step(action)
            last_info = info
            done = terminated or truncated
            steps += 1
        if last_info.get("gameOver") or last_info.get("victory"):
            components = last_info.get("rewardComponents", {})
            score = last_info.get("score", 0.0)
            expected_terminal = np.clip(score / 40.0, -1.0, 1.0)
            if last_info.get("victory"):
                expected_terminal += 0.5
            assert components.get("terminal", 0.0) == pytest.approx(
                expected_terminal, abs=0.01
            )

    def test_dense_v2_no_skip_penalty(self):
        """dense_v2 should not penalize room skipping."""
        env = ScoundrelEnv(reward_mode="dense_v2", reward_debug=True)
        obs, _ = env.reset()
        mask = env.action_masks()
        # Try to find a skip action (index 1)
        if mask[1]:
            _, _, _, _, info = env.step(1)
            components = info.get("rewardComponents", {})
            # No skipPenalty key or it should be 0
            assert components.get("skipPenalty", 0.0) == 0.0
```

**Step 2: Run tests to verify they fail**

Run: `cd python_ai && .venv/bin/python -m pytest tests/test_env_integration.py::TestDenseV2Reward -v`
Expected: FAIL with `ValueError: Unsupported reward_mode: dense_v2`

**Step 3: Implement dense_v2 reward mode**

Add to `python_ai/scoundrel_env.py`, in the `_compute_reward` method:

```python
    def _compute_reward(self, prev_stats, curr_stats, terminated):
        if self.reward_mode == "baseline":
            reward = self._compute_reward_baseline(curr_stats, terminated)
            return reward, {"total": reward}
        if self.reward_mode == "dense_v1":
            return self._compute_reward_dense_v1(prev_stats, curr_stats, terminated)
        if self.reward_mode == "dense_v2":
            return self._compute_reward_dense_v2(prev_stats, curr_stats, terminated)
        raise ValueError(f"Unsupported reward_mode: {self.reward_mode}")
```

Add the new method:

```python
    def _compute_reward_dense_v2(
        self,
        prev_stats: Optional[Dict[str, Any]],
        curr_stats: Dict[str, Any],
        terminated: bool,
    ) -> Tuple[float, Dict[str, float]]:
        health = float(curr_stats.get("health", self.last_health))
        health_delta = (health - self.last_health) / max(float(curr_stats.get("maxHealth", 20)), 1.0)
        self.last_health = health

        health_component = 0.15 * health_delta

        # Weapon use bonus: reward when a card was resolved and discard grew
        # (indicates combat/equip activity vs just potions).
        weapon_component = 0.0
        if prev_stats is not None:
            prev_weapon = bool(prev_stats.get("hasWeapon", False))
            curr_weapon = bool(curr_stats.get("hasWeapon", False))
            if not prev_weapon and curr_weapon:
                weapon_component = 0.03  # Equipped a new weapon

            # Monster killed with weapon: health loss is less than what
            # barehanded would cost. Detect via weapon-stacked monster count.
            prev_weapon_monsters = int(prev_stats.get("weaponMonsterCount", 0))
            curr_weapon_monsters = int(curr_stats.get("weaponMonsterCount", 0))
            if curr_weapon_monsters > prev_weapon_monsters:
                weapon_component += 0.02  # Killed a monster with weapon

        # Survival bonus: small per-step reward for staying alive.
        survival_component = 0.005 if not terminated else 0.0

        # Resolve bonus (same as dense_v1 but no skip penalty).
        resolve_component = 0.0
        if prev_stats is not None:
            prev_discard = int(prev_stats.get("discardCount", 0))
            curr_discard = int(curr_stats.get("discardCount", 0))
            discard_delta = max(curr_discard - prev_discard, 0)
            resolve_component = 0.01 * float(discard_delta)

        # Terminal reward: /40 scale + victory bonus.
        terminal_component = 0.0
        if terminated:
            score = float(curr_stats.get("score", 0.0))
            terminal_component = float(np.clip(score / 40.0, -1.0, 1.0))
            if bool(curr_stats.get("victory", False)):
                terminal_component += 0.5

        total = float(
            health_component + weapon_component + survival_component
            + resolve_component + terminal_component
        )
        components = {
            "health": float(health_component),
            "weapon": float(weapon_component),
            "survival": float(survival_component),
            "resolve": float(resolve_component),
            "terminal": float(terminal_component),
            "total": total,
        }
        return total, components
```

**Step 4: Update \_sync_from_state to track weapon stats**

In `_sync_from_state`, add two new fields to `_step_stats`:

```python
    def _sync_from_state(self, state: GameState) -> None:
        terminal = state.game_over or state.victory
        if self.obs_version == 2:
            self._last_obs = encode_observation_v2(state)
        else:
            self._last_obs = encode_observation(state)
        self._last_mask = build_action_mask(state)
        self._step_stats = {
            "health": float(state.health),
            "maxHealth": float(state.max_health),
            "score": float(calculate_score(state)) if terminal else 0.0,
            "victory": state.victory,
            "gameOver": state.game_over,
            "discardCount": len(state.discard),
            "roomCount": len(state.room),
            "lastActionWasDefer": state.last_action_was_defer,
            "hasWeapon": state.equipped_weapon is not None,
            "weaponMonsterCount": len(state.monsters_on_weapon),
        }
```

**Step 5: Run tests to verify they pass**

Run: `cd python_ai && .venv/bin/python -m pytest tests/test_env_integration.py::TestDenseV2Reward -v`
Expected: All 4 tests PASS

Run all env tests: `cd python_ai && .venv/bin/python -m pytest tests/test_env_integration.py -v`
Expected: All tests PASS (existing tests unaffected)

**Step 6: Commit**

```bash
git add python_ai/scoundrel_env.py python_ai/tests/test_env_integration.py
git commit -m "feat(rl): add dense_v2 reward mode with weapon shaping, survival bonus, victory bonus"
```

---

### Task 4: Update train_ppo.py and evaluate_agent.py for v2

**Files:**

- Modify: `python_ai/train_ppo.py:393-428`
- Modify: `python_ai/evaluate_agent.py` (argparse section)
- Modify: `python_ai/vec_env_utils.py` (pass obs_version through)
- Test: manual smoke test

**Context:** Training and evaluation scripts need `--obs-version` and `--reward-mode dense_v2` support. The `vec_env_utils.build_vec_env` must forward `obs_version` to `ScoundrelEnv`.

**Step 1: Add obs_version to vec_env_utils.py**

In `python_ai/vec_env_utils.py`, find the `build_vec_env` function and add `obs_version: int = 1` parameter. Pass it through to `ScoundrelEnv(**env_kwargs)` in the env factory:

```python
def build_vec_env(
    num_envs: int,
    vec_env_kind: str,
    start_method: str,
    max_episode_steps: int,
    seed: int,
    wrap_action_masker: bool = True,
    deck_seed: Optional[int] = None,
    reward_mode: str = "baseline",
    reward_debug: bool = False,
    obs_version: int = 1,
) -> ...:
    # In the env factory lambda/function, pass obs_version=obs_version
```

**Step 2: Add --obs-version flag to train_ppo.py**

Add to argparse:

```python
parser.add_argument("--obs-version", type=int, choices=[1, 2], default=1, help="Observation version: 1 (74-dim) or 2 (84-dim).")
```

Update `reward_mode` choices to include `dense_v2`:

```python
parser.add_argument("--reward-mode", choices=("baseline", "dense_v1", "dense_v2"), default="baseline")
```

Thread `obs_version` through the `train()` function signature and all `build_vec_env` calls.

**Step 3: Add --obs-version flag to evaluate_agent.py**

Same pattern: add `--obs-version` arg, thread through to `build_vec_env`.

Update `reward_mode` choices to include `dense_v2`.

**Step 4: Add --obs-version to baseline_random.py**

Same pattern for consistency.

**Step 5: Smoke test**

Run: `cd python_ai && .venv/bin/python train_ppo.py --timesteps 5000 --obs-version 2 --reward-mode dense_v2 --num-envs 2 --vec-env dummy --model-out models/test_v2`
Expected: Trains without error, prints training config showing obs_version=2

Run: `cd python_ai && .venv/bin/python evaluate_agent.py --model models/test_v2.zip --games 20 --obs-version 2 --reward-mode dense_v2`
Expected: Evaluates without error, prints results

**Step 6: Commit**

```bash
git add python_ai/train_ppo.py python_ai/evaluate_agent.py python_ai/baseline_random.py python_ai/vec_env_utils.py
git commit -m "feat(rl): add --obs-version and dense_v2 support to training and evaluation scripts"
```

---

### Task 5: Update README.md and run full test suite

**Files:**

- Modify: `python_ai/README.md`
- Test: full test suite

**Step 1: Update README.md**

Add to the Notes section:

```markdown
- Observation versions:
  - `--obs-version 1` (default): 74-dim vector (player stats, room features, seen-card bits).
  - `--obs-version 2`: 84-dim vector (v1 + unseen card counts, weapon effectiveness, health risk, deck progress, survival margin).
- Reward modes:
  - `baseline` (score-first objective with minimal shaping),
  - `dense_v1` (score-first terminal + health/resolve/room shaping),
  - `dense_v2` (better terminal scaling /40, weapon-use bonus, survival bonus, victory bonus, no skip penalty).
```

Update the example training commands to show v2 usage:

```bash
python3 python_ai/train_ppo.py \
  --timesteps 3000000 \
  --model-out python_ai/models/scoundrel_v2 \
  --obs-version 2 \
  --reward-mode dense_v2 \
  --num-envs 32 \
  --vec-env dummy \
  --lr-start 3e-4 \
  --lr-end 1e-4 \
  --ent-start 0.02 \
  --ent-end 0.002 \
  --save-freq 100000 \
  --eval-freq 100000 \
  --eval-games 200
```

**Step 2: Run full test suite**

Run: `cd python_ai && .venv/bin/python -m pytest tests/ -v`
Expected: All tests PASS (engine tests + env integration tests + cross-validation tests)

**Step 3: Commit**

```bash
git add python_ai/README.md
git commit -m "docs: update README with obs-version 2 and dense_v2 reward mode"
```

---

## Summary

| Task | What                             | Changes                                                                       |
| ---- | -------------------------------- | ----------------------------------------------------------------------------- |
| 1    | `encode_observation_v2` (84-dim) | `engine.py` + tests                                                           |
| 2    | Wire v2 obs into `ScoundrelEnv`  | `scoundrel_env.py` + tests                                                    |
| 3    | `dense_v2` reward mode           | `scoundrel_env.py` + tests                                                    |
| 4    | CLI flags for v2                 | `train_ppo.py`, `evaluate_agent.py`, `baseline_random.py`, `vec_env_utils.py` |
| 5    | Docs + full test pass            | `README.md`                                                                   |

**Expected improvement path after implementation:**

1. Train with `--obs-version 2 --reward-mode dense_v2 --timesteps 20000000 --num-envs 32 --vec-env dummy`
2. Compare win rate and avg score against current best (16.5% / -21.9)
3. Run parallel sweeps with different LR/entropy schedules to find optimal hyperparams
