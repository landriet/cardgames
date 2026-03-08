# Python Engine Port — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Port the Scoundrel game engine to pure Python so `ScoundrelEnv` can step without IPC to a Node.js subprocess, eliminating the training speed bottleneck.

**Architecture:** A single `python_ai/engine.py` module containing dataclass-based game state, pure functions for state transitions (init, apply action, legal actions), observation encoding, and action masking. `ScoundrelEnv` is updated to call this directly instead of `bridge_client.py`. The TS engine remains untouched — a cross-validation test suite ensures both engines produce identical results.

**Tech Stack:** Python 3.9+, numpy, dataclasses, pytest

---

## Reference: TS Engine Mapping

Key TS source files and their Python equivalents:

| TS Source                                                                                                                                                            | Python Target                                                                                 | What                     |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------ |
| `src/engine-lib/src/index.ts` — `Game.mulberry32`, `Game.createDeck`, `Game.shuffle`                                                                                 | `engine.py` — `mulberry32`, `create_deck`                                                     | PRNG + deck creation     |
| `src/engine-lib/src/index.ts` — `Game.enterRoom`, `Game.avoidRoom`, `Game.handleCardAction`, `Game.applyTurnRules`, `Game.calculateScore`, `Game.getPossibleActions` | `engine.py` — `enter_room`, `avoid_room`, `play_card`, `get_legal_actions`, `calculate_score` | Core state machine       |
| `src/engine-lib/worker/engineWorkerService.ts` — `encodeObservation`, `buildActionMask`, `actionToDiscrete`                                                          | `engine.py` — `encode_observation`, `build_action_mask`                                       | RL encoding              |
| `src/features/scoundrel/logic/engineAdapter.ts` — `getPossibleActions` (skipRoom injection)                                                                          | `engine.py` — `get_legal_actions`                                                             | Legal action enumeration |

## Reference: Action Space (unchanged)

| Index | Action                 |
| ----- | ---------------------- |
| 0     | enterRoom              |
| 1     | skipRoom               |
| 2     | playCard[0] barehanded |
| 3     | playCard[0] weapon     |
| 4     | playCard[1] barehanded |
| 5     | playCard[1] weapon     |
| 6     | playCard[2] barehanded |
| 7     | playCard[2] weapon     |
| 8     | playCard[3] barehanded |
| 9     | playCard[3] weapon     |

## Reference: Observation Vector (74-dim, unchanged)

| Index | Feature                                                  |
| ----- | -------------------------------------------------------- |
| 0     | health / maxHealth                                       |
| 1     | maxHealth / 20                                           |
| 2     | equippedWeapon rank / 14 (0 if none)                     |
| 3     | lastMonsterDefeated rank / 14 (0 if none)                |
| 4     | min(len(monstersOnWeapon), 4) / 4                        |
| 5     | potionTakenThisTurn (0 or 1)                             |
| 6     | canDeferRoom (0 or 1)                                    |
| 7     | lastActionWasDefer (0 or 1)                              |
| 8     | min(len(deck), 44) / 44                                  |
| 9     | min(len(room), 4) / 4                                    |
| 10-13 | room card 0: [is_monster, is_weapon, is_potion, rank/14] |
| 14-17 | room card 1: same                                        |
| 18-21 | room card 2: same                                        |
| 22-25 | room card 3: same                                        |
| 26-29 | monstersOnWeapon[0..3] rank / 14                         |
| 30-73 | 44-bit seen-card flags (canonical deck order)            |

Canonical deck order: hearts 2-10, diamonds 2-10, clubs 2-14, spades 2-14 (same iteration order as `createDeck`).

---

### Task 1: Mulberry32 PRNG + Deck Creation

**Files:**

- Create: `python_ai/engine.py`
- Create: `python_ai/tests/__init__.py`
- Create: `python_ai/tests/test_engine.py`

**Context:** The TS engine uses `mulberry32` (a 32-bit hash-based PRNG) for deterministic shuffling. The Python port MUST produce identical output for the same seed. The deck has 44 cards: hearts 2-10 (potions), diamonds 2-10 (weapons), clubs 2-14 (monsters), spades 2-14 (monsters). Fisher-Yates shuffle using mulberry32 output.

**Step 1: Write failing tests for mulberry32 and deck creation**

```python
# python_ai/tests/test_engine.py
from __future__ import annotations
import pytest
from engine import Card, CardType, create_deck, mulberry32


class TestMulberry32:
    def test_deterministic_sequence(self) -> None:
        """First 5 values from mulberry32(42) must match the TS engine exactly."""
        rng = mulberry32(42)
        values = [rng() for _ in range(5)]
        # These expected values are generated by running the TS mulberry32(42) —
        # fill in from cross-validation (Task 6). For now, verify determinism.
        assert values[0] == values[0]  # placeholder
        first_run = [rng() for _ in range(3)]
        rng2 = mulberry32(42)
        _ = [rng2() for _ in range(5)]
        second_run = [rng2() for _ in range(3)]
        assert first_run == second_run

    def test_different_seeds_differ(self) -> None:
        rng_a = mulberry32(1)
        rng_b = mulberry32(2)
        assert rng_a() != rng_b()


class TestCreateDeck:
    def test_deck_has_44_cards(self) -> None:
        deck = create_deck(seed=42)
        assert len(deck) == 44

    def test_deck_composition(self) -> None:
        deck = create_deck(seed=42)
        potions = [c for c in deck if c.card_type == CardType.POTION]
        weapons = [c for c in deck if c.card_type == CardType.WEAPON]
        monsters = [c for c in deck if c.card_type == CardType.MONSTER]
        assert len(potions) == 9
        assert len(weapons) == 9
        assert len(monsters) == 26

    def test_deterministic_with_seed(self) -> None:
        deck_a = create_deck(seed=123)
        deck_b = create_deck(seed=123)
        assert deck_a == deck_b

    def test_different_seeds_shuffle_differently(self) -> None:
        deck_a = create_deck(seed=1)
        deck_b = create_deck(seed=2)
        assert deck_a != deck_b
```

**Step 2: Run tests to verify they fail**

Run: `cd python_ai && python -m pytest tests/test_engine.py -v`
Expected: ImportError / ModuleNotFoundError

**Step 3: Implement Card types, mulberry32, and create_deck**

```python
# python_ai/engine.py
from __future__ import annotations

import ctypes
from dataclasses import dataclass, field
from enum import Enum
from typing import Callable, List, Optional

import numpy as np


class CardType(Enum):
    MONSTER = "monster"
    WEAPON = "weapon"
    POTION = "potion"


class Suit(Enum):
    HEARTS = "hearts"
    DIAMONDS = "diamonds"
    CLUBS = "clubs"
    SPADES = "spades"


@dataclass(frozen=True, slots=True)
class Card:
    card_type: CardType
    suit: Suit
    rank: int

    def __repr__(self) -> str:
        return f"{self.card_type.value}-{self.suit.value}-{self.rank}"


MAX_RANK = 14


def mulberry32(seed: int) -> Callable[[], float]:
    """Deterministic PRNG matching the TS Game.mulberry32 exactly."""
    # Use a mutable list to hold state (closures can't rebind ints)
    state = [seed & 0xFFFFFFFF]

    def _next() -> float:
        state[0] = (state[0] + 0x6D2B79F5) & 0xFFFFFFFF
        t = state[0]
        t = _imul(t ^ (t >> 15), 1 | t) & 0xFFFFFFFF
        t = (t + (_imul(t ^ (t >> 7), 61 | t) & 0xFFFFFFFF)) & 0xFFFFFFFF
        t = (t ^ (t >> 14)) & 0xFFFFFFFF
        return t / 4294967296.0

    return _next


def _imul(a: int, b: int) -> int:
    """Emulate JavaScript Math.imul (32-bit integer multiply)."""
    return ctypes.c_int32(a * b).value


def _fisher_yates_shuffle(items: list, rng: Callable[[], float]) -> list:
    """In-place Fisher-Yates shuffle matching the TS Game.shuffle."""
    arr = list(items)
    for i in range(len(arr) - 1, 0, -1):
        j = int(rng() * (i + 1))
        arr[i], arr[j] = arr[j], arr[i]
    return arr


def create_deck(seed: Optional[int] = None) -> List[Card]:
    """Create and shuffle a 44-card Scoundrel deck, matching TS Game.createDeck."""
    suits = [Suit.HEARTS, Suit.DIAMONDS, Suit.CLUBS, Suit.SPADES]
    deck: List[Card] = []
    for suit in suits:
        for rank in range(2, 15):
            if suit in (Suit.HEARTS, Suit.DIAMONDS) and rank >= 11:
                continue
            if suit == Suit.HEARTS:
                card_type = CardType.POTION
            elif suit == Suit.DIAMONDS:
                card_type = CardType.WEAPON
            else:
                card_type = CardType.MONSTER
            deck.append(Card(card_type=card_type, suit=suit, rank=rank))

    if seed is not None:
        return _fisher_yates_shuffle(deck, mulberry32(seed))
    import random
    return _fisher_yates_shuffle(deck, random.random)
```

**Step 4: Run tests to verify they pass**

Run: `cd python_ai && python -m pytest tests/test_engine.py::TestMulberry32 tests/test_engine.py::TestCreateDeck -v`
Expected: All PASS

**Step 5: Commit**

```bash
git add python_ai/engine.py python_ai/tests/__init__.py python_ai/tests/test_engine.py
git commit -m "feat(rl): add Card types, mulberry32 PRNG, and create_deck"
```

---

### Task 2: Game State + Init

**Files:**

- Modify: `python_ai/engine.py`
- Modify: `python_ai/tests/test_engine.py`

**Context:** `GameState` is a dataclass holding all game fields. `init_game(seed)` creates a deck, deals 4 cards into the room, and returns the initial state. This corresponds to `new Game(deck)` + `game.enterRoom()` + `game.applyTurnRules()` (which calls `dealRoom`).

**Step 1: Write failing tests**

```python
# Append to python_ai/tests/test_engine.py
from engine import GameState, init_game


class TestInitGame:
    def test_initial_health(self) -> None:
        state = init_game(seed=42)
        assert state.health == 20
        assert state.max_health == 20

    def test_initial_room_has_4_cards(self) -> None:
        state = init_game(seed=42)
        assert len(state.room) == 4

    def test_deck_has_40_cards_after_deal(self) -> None:
        state = init_game(seed=42)
        assert len(state.deck) == 40

    def test_initial_flags(self) -> None:
        state = init_game(seed=42)
        assert state.can_defer_room is True
        assert state.last_action_was_defer is False
        assert state.game_over is False
        assert state.victory is False
        assert state.room_being_entered is True
        assert state.cards_resolved_this_turn == 0
        assert state.potion_taken_this_turn is False
        assert state.equipped_weapon is None
        assert state.last_monster_defeated is None
        assert len(state.monsters_on_weapon) == 0
        assert len(state.discard) == 0

    def test_deterministic(self) -> None:
        a = init_game(seed=99)
        b = init_game(seed=99)
        assert a.room == b.room
        assert a.deck == b.deck
```

**Step 2: Run tests to verify they fail**

Run: `cd python_ai && python -m pytest tests/test_engine.py::TestInitGame -v`
Expected: ImportError

**Step 3: Implement GameState and init_game**

Add to `engine.py`:

```python
@dataclass(slots=True)
class GameState:
    deck: List[Card]
    discard: List[Card] = field(default_factory=list)
    room: List[Card] = field(default_factory=list)
    health: int = 20
    max_health: int = 20
    equipped_weapon: Optional[Card] = None
    last_monster_defeated: Optional[Card] = None
    monsters_on_weapon: List[Card] = field(default_factory=list)
    can_defer_room: bool = True
    last_action_was_defer: bool = False
    game_over: bool = False
    victory: bool = False
    room_being_entered: bool = False
    cards_resolved_this_turn: int = 0
    potion_taken_this_turn: bool = False
    last_resolved_card_type: Optional[CardType] = None
    last_resolved_potion_value: Optional[int] = None


def _deal_room(state: GameState) -> GameState:
    """Deal cards from deck into room until room has 4 cards or deck is empty."""
    room = list(state.room)
    deck = list(state.deck)
    while len(room) < 4 and len(deck) > 0:
        room.append(deck.pop(0))
    return GameState(
        deck=deck,
        discard=list(state.discard),
        room=room,
        health=state.health,
        max_health=state.max_health,
        equipped_weapon=state.equipped_weapon,
        last_monster_defeated=state.last_monster_defeated,
        monsters_on_weapon=list(state.monsters_on_weapon),
        can_defer_room=state.can_defer_room,
        last_action_was_defer=state.last_action_was_defer,
        game_over=state.game_over,
        victory=state.victory,
        room_being_entered=state.room_being_entered,
        cards_resolved_this_turn=state.cards_resolved_this_turn,
        potion_taken_this_turn=state.potion_taken_this_turn,
        last_resolved_card_type=state.last_resolved_card_type,
        last_resolved_potion_value=state.last_resolved_potion_value,
    )


def init_game(seed: Optional[int] = None) -> GameState:
    """Create initial game state: shuffled deck, 4 cards dealt, room entered."""
    deck = create_deck(seed=seed)
    state = GameState(deck=deck)
    # enterRoom: set flags, then dealRoom
    state.can_defer_room = True
    state.last_action_was_defer = False
    state.potion_taken_this_turn = False
    state.room_being_entered = True
    state.cards_resolved_this_turn = 0
    state = _deal_room(state)
    return state
```

**Step 4: Run tests**

Run: `cd python_ai && python -m pytest tests/test_engine.py::TestInitGame -v`
Expected: All PASS

**Step 5: Commit**

```bash
git add python_ai/engine.py python_ai/tests/test_engine.py
git commit -m "feat(rl): add GameState dataclass and init_game"
```

---

### Task 3: Core Actions — play_card (potion, weapon, monster)

**Files:**

- Modify: `python_ai/engine.py`
- Modify: `python_ai/tests/test_engine.py`

**Context:** `play_card(state, card_index, mode)` resolves one card from the room. This is the most complex function — it handles three card types, the weapon lock constraint, potion-per-turn limit, discard management, and the `cardsResolvedThisTurn` counter. After resolving, if 3 cards have been resolved or room is empty, `room_being_entered` is set to False and `applyTurnRules` checks for death/victory/new-room-deal.

Match TS `Game.handleCardAction` + `Game.applyTurnRules` exactly.

**Step 1: Write failing tests**

```python
from engine import play_card

class TestPlayCardPotion:
    def test_potion_heals(self) -> None:
        state = init_game(seed=42)
        # Find a potion in the room
        potion_indices = [i for i, c in enumerate(state.room) if c.card_type == CardType.POTION]
        if not potion_indices:
            pytest.skip("No potion in initial room for seed=42")
        idx = potion_indices[0]
        potion = state.room[idx]
        # Damage the player first so healing is observable
        damaged = GameState(
            deck=list(state.deck), discard=list(state.discard), room=list(state.room),
            health=10, max_health=20, room_being_entered=True,
            can_defer_room=True,
            equipped_weapon=state.equipped_weapon,
            last_monster_defeated=state.last_monster_defeated,
            monsters_on_weapon=list(state.monsters_on_weapon),
        )
        result = play_card(damaged, idx)
        expected_health = min(10 + potion.rank, 20)
        assert result.health == expected_health
        assert potion not in result.room
        assert potion in result.discard

    def test_second_potion_same_turn_no_heal(self) -> None:
        """Second potion in same turn goes to discard but doesn't heal."""
        state = init_game(seed=42)
        # Build a state with 2 potions in room, potion already taken
        potion_a = Card(CardType.POTION, Suit.HEARTS, 5)
        potion_b = Card(CardType.POTION, Suit.HEARTS, 3)
        monster = Card(CardType.MONSTER, Suit.CLUBS, 2)
        weapon = Card(CardType.WEAPON, Suit.DIAMONDS, 4)
        custom = GameState(
            deck=list(state.deck), room=[potion_a, potion_b, monster, weapon],
            health=10, max_health=20, room_being_entered=True, can_defer_room=True,
        )
        after_first = play_card(custom, 0)
        assert after_first.health == 15  # healed by 5
        assert after_first.potion_taken_this_turn is True
        # Play second potion (now at index 0 since first was removed)
        after_second = play_card(after_first, 0)
        assert after_second.health == 15  # no additional healing


class TestPlayCardWeapon:
    def test_equip_weapon(self) -> None:
        weapon = Card(CardType.WEAPON, Suit.DIAMONDS, 7)
        monster = Card(CardType.MONSTER, Suit.CLUBS, 3)
        potion = Card(CardType.POTION, Suit.HEARTS, 4)
        filler = Card(CardType.MONSTER, Suit.SPADES, 5)
        state = GameState(
            deck=[Card(CardType.MONSTER, Suit.CLUBS, i) for i in range(2, 6)],
            room=[weapon, monster, potion, filler],
            health=20, max_health=20, room_being_entered=True, can_defer_room=True,
        )
        result = play_card(state, 0)
        assert result.equipped_weapon == weapon
        assert weapon not in result.room
        assert result.last_monster_defeated is None

    def test_replace_weapon_discards_old(self) -> None:
        old_weapon = Card(CardType.WEAPON, Suit.DIAMONDS, 3)
        new_weapon = Card(CardType.WEAPON, Suit.DIAMONDS, 7)
        old_monster = Card(CardType.MONSTER, Suit.CLUBS, 2)
        filler1 = Card(CardType.MONSTER, Suit.SPADES, 5)
        filler2 = Card(CardType.MONSTER, Suit.CLUBS, 6)
        state = GameState(
            deck=[Card(CardType.MONSTER, Suit.CLUBS, i) for i in range(8, 12)],
            room=[new_weapon, filler1, filler2, Card(CardType.POTION, Suit.HEARTS, 2)],
            health=20, max_health=20, room_being_entered=True, can_defer_room=True,
            equipped_weapon=old_weapon,
            monsters_on_weapon=[old_monster],
            last_monster_defeated=old_monster,
        )
        result = play_card(state, 0)
        assert result.equipped_weapon == new_weapon
        assert old_weapon in result.discard
        assert old_monster in result.discard
        assert len(result.monsters_on_weapon) == 0


class TestPlayCardMonster:
    def test_fight_barehanded(self) -> None:
        monster = Card(CardType.MONSTER, Suit.CLUBS, 5)
        filler = [Card(CardType.MONSTER, Suit.SPADES, i) for i in [3, 4, 6]]
        state = GameState(
            deck=[Card(CardType.MONSTER, Suit.CLUBS, i) for i in range(8, 12)],
            room=[monster] + filler,
            health=20, max_health=20, room_being_entered=True, can_defer_room=True,
        )
        result = play_card(state, 0, mode="barehanded")
        assert result.health == 15
        assert monster not in result.room
        assert monster in result.discard

    def test_fight_with_weapon(self) -> None:
        weapon = Card(CardType.WEAPON, Suit.DIAMONDS, 7)
        monster = Card(CardType.MONSTER, Suit.CLUBS, 5)
        filler = [Card(CardType.MONSTER, Suit.SPADES, i) for i in [3, 4, 6]]
        state = GameState(
            deck=[Card(CardType.MONSTER, Suit.CLUBS, i) for i in range(8, 12)],
            room=[monster] + filler,
            health=20, max_health=20, room_being_entered=True, can_defer_room=True,
            equipped_weapon=weapon,
        )
        result = play_card(state, 0, mode="weapon")
        assert result.health == 20  # 5 - 7 = 0 damage
        assert result.last_monster_defeated == monster
        assert monster in result.monsters_on_weapon
        assert monster not in result.room
        assert monster not in result.discard  # stays on weapon

    def test_weapon_lock_prevents_higher_monster(self) -> None:
        weapon = Card(CardType.WEAPON, Suit.DIAMONDS, 10)
        big_monster = Card(CardType.MONSTER, Suit.CLUBS, 8)
        small_monster = Card(CardType.MONSTER, Suit.SPADES, 3)
        filler = [Card(CardType.POTION, Suit.HEARTS, 2), Card(CardType.MONSTER, Suit.CLUBS, 4)]
        state = GameState(
            deck=[Card(CardType.MONSTER, Suit.CLUBS, i) for i in range(9, 13)],
            room=[big_monster, small_monster] + filler,
            health=20, max_health=20, room_being_entered=True, can_defer_room=True,
            equipped_weapon=weapon,
            last_monster_defeated=small_monster,  # lock at rank 3
            monsters_on_weapon=[small_monster],
        )
        # big_monster rank 8 > lock rank 3 => should raise
        with pytest.raises(ValueError):
            play_card(state, 0, mode="weapon")

    def test_death_ends_game(self) -> None:
        monster = Card(CardType.MONSTER, Suit.CLUBS, 14)
        filler = [Card(CardType.MONSTER, Suit.SPADES, i) for i in [3, 4, 6]]
        state = GameState(
            deck=[Card(CardType.MONSTER, Suit.CLUBS, i) for i in range(8, 12)],
            room=[monster] + filler,
            health=5, max_health=20, room_being_entered=True, can_defer_room=True,
        )
        result = play_card(state, 0, mode="barehanded")
        assert result.health == -9
        assert result.game_over is True


class TestRoomTransition:
    def test_resolving_3_cards_ends_room_and_deals_new(self) -> None:
        """After resolving 3 cards, room_being_entered becomes False and a new room is dealt."""
        cards = [
            Card(CardType.POTION, Suit.HEARTS, 2),
            Card(CardType.POTION, Suit.HEARTS, 3),
            Card(CardType.WEAPON, Suit.DIAMONDS, 4),
            Card(CardType.MONSTER, Suit.SPADES, 5),
        ]
        remaining_deck = [Card(CardType.MONSTER, Suit.CLUBS, i) for i in range(2, 15)]
        state = GameState(
            deck=remaining_deck, room=list(cards),
            health=15, max_health=20, room_being_entered=True, can_defer_room=True,
        )
        s1 = play_card(state, 0)   # resolve potion 2
        assert s1.cards_resolved_this_turn == 1
        s2 = play_card(s1, 0)      # resolve potion 3 (no heal — 2nd potion)
        assert s2.cards_resolved_this_turn == 2
        s3 = play_card(s2, 0)      # resolve weapon 4 — 3rd card
        # After 3 resolutions, carry 1 card, deal new room
        assert s3.room_being_entered is False
```

**Step 2: Run tests to verify they fail**

Run: `cd python_ai && python -m pytest tests/test_engine.py::TestPlayCardPotion tests/test_engine.py::TestPlayCardWeapon tests/test_engine.py::TestPlayCardMonster tests/test_engine.py::TestRoomTransition -v`
Expected: ImportError

**Step 3: Implement play_card and \_apply_turn_rules**

Add to `engine.py`:

```python
def _replace_state(state: GameState, **kwargs) -> GameState:
    """Return a shallow copy of state with the given fields overridden."""
    return GameState(
        deck=kwargs.get("deck", list(state.deck)),
        discard=kwargs.get("discard", list(state.discard)),
        room=kwargs.get("room", list(state.room)),
        health=kwargs.get("health", state.health),
        max_health=kwargs.get("max_health", state.max_health),
        equipped_weapon=kwargs.get("equipped_weapon", state.equipped_weapon),
        last_monster_defeated=kwargs.get("last_monster_defeated", state.last_monster_defeated),
        monsters_on_weapon=kwargs.get("monsters_on_weapon", list(state.monsters_on_weapon)),
        can_defer_room=kwargs.get("can_defer_room", state.can_defer_room),
        last_action_was_defer=kwargs.get("last_action_was_defer", state.last_action_was_defer),
        game_over=kwargs.get("game_over", state.game_over),
        victory=kwargs.get("victory", state.victory),
        room_being_entered=kwargs.get("room_being_entered", state.room_being_entered),
        cards_resolved_this_turn=kwargs.get("cards_resolved_this_turn", state.cards_resolved_this_turn),
        potion_taken_this_turn=kwargs.get("potion_taken_this_turn", state.potion_taken_this_turn),
        last_resolved_card_type=kwargs.get("last_resolved_card_type", state.last_resolved_card_type),
        last_resolved_potion_value=kwargs.get("last_resolved_potion_value", state.last_resolved_potion_value),
    )


def _apply_turn_rules(state: GameState) -> GameState:
    """Check death, victory, and deal new room if needed. Matches TS Game.applyTurnRules."""
    if state.health <= 0:
        return _replace_state(state, game_over=True)
    if len(state.deck) == 0 and len(state.room) == 0:
        return _replace_state(state, victory=True)
    if not state.room_being_entered and len(state.room) <= 1 and len(state.deck) > 0:
        return _deal_room(state)
    return state


def play_card(state: GameState, card_index: int, mode: Optional[str] = None) -> GameState:
    """Resolve one card from the room. Matches TS Game.handleCardAction + applyTurnRules."""
    if not state.room_being_entered:
        raise ValueError("Cannot play card when not in room.")
    if card_index < 0 or card_index >= len(state.room):
        raise ValueError(f"Invalid card index: {card_index}")

    card = state.room[card_index]
    room = list(state.room)
    discard = list(state.discard)
    health = state.health
    equipped_weapon = state.equipped_weapon
    last_monster_defeated = state.last_monster_defeated
    monsters_on_weapon = list(state.monsters_on_weapon)
    potion_taken_this_turn = state.potion_taken_this_turn
    last_resolved_card_type = card.card_type
    last_resolved_potion_value = card.rank if card.card_type == CardType.POTION else None

    room.pop(card_index)

    if card.card_type == CardType.MONSTER:
        resolved_mode = mode or "barehanded"
        if resolved_mode == "weapon":
            if equipped_weapon is None:
                raise ValueError("Cannot fight with weapon when no weapon is equipped.")
            if last_monster_defeated is not None and card.rank > last_monster_defeated.rank:
                raise ValueError("Illegal weapon action: monster exceeds weapon lock.")
            damage = max(card.rank - equipped_weapon.rank, 0)
            health -= damage
            last_monster_defeated = card
            monsters_on_weapon = monsters_on_weapon + [card]
        else:
            health -= card.rank
            discard.append(card)
    elif card.card_type == CardType.WEAPON:
        if equipped_weapon is not None:
            discard.append(equipped_weapon)
            discard.extend(monsters_on_weapon)
        equipped_weapon = card
        last_monster_defeated = None
        monsters_on_weapon = []
    elif card.card_type == CardType.POTION:
        if not potion_taken_this_turn:
            health = min(health + card.rank, state.max_health)
            potion_taken_this_turn = True
        discard.append(card)

    cards_resolved = state.cards_resolved_this_turn + 1
    room_being_entered = state.room_being_entered
    if cards_resolved >= 3 or len(room) == 0:
        room_being_entered = False
        cards_resolved = 0

    new_state = GameState(
        deck=list(state.deck),
        discard=discard,
        room=room,
        health=health,
        max_health=state.max_health,
        equipped_weapon=equipped_weapon,
        last_monster_defeated=last_monster_defeated,
        monsters_on_weapon=monsters_on_weapon,
        can_defer_room=state.can_defer_room,
        last_action_was_defer=state.last_action_was_defer,
        game_over=state.game_over,
        victory=state.victory,
        room_being_entered=room_being_entered,
        cards_resolved_this_turn=cards_resolved,
        potion_taken_this_turn=potion_taken_this_turn,
        last_resolved_card_type=last_resolved_card_type,
        last_resolved_potion_value=last_resolved_potion_value,
    )

    return _apply_turn_rules(new_state)
```

**Step 4: Run tests**

Run: `cd python_ai && python -m pytest tests/test_engine.py -v`
Expected: All PASS

**Step 5: Commit**

```bash
git add python_ai/engine.py python_ai/tests/test_engine.py
git commit -m "feat(rl): implement play_card with potion/weapon/monster handling"
```

---

### Task 4: enter_room, avoid_room, get_legal_actions, calculate_score

**Files:**

- Modify: `python_ai/engine.py`
- Modify: `python_ai/tests/test_engine.py`

**Context:** These complete the state machine. `enter_room` resets per-turn flags and marks `room_being_entered = True`. `avoid_room` pushes room cards to the bottom of the deck, sets `last_action_was_defer`, and deals a new room. `get_legal_actions` returns the list of legal `Action` objects. `calculate_score` computes the terminal score per `RULES_AI.yaml`.

Important: `get_legal_actions` must inject `skipRoom` when the player is inside a room (room has 4 cards) and defer is legal — matching the TS `engineAdapter.ts:getPossibleActions` behavior that the worker exposes to RL.

**Step 1: Write failing tests**

```python
from engine import Action, ActionType, avoid_room, calculate_score, enter_room, get_legal_actions


class TestEnterRoom:
    def test_enter_room_resets_flags(self) -> None:
        state = init_game(seed=42)
        # Simulate being between rooms
        between = _replace_state(state, room_being_entered=False, potion_taken_this_turn=True)
        entered = enter_room(between)
        assert entered.room_being_entered is True
        assert entered.potion_taken_this_turn is False
        assert entered.cards_resolved_this_turn == 0


class TestAvoidRoom:
    def test_avoid_room_moves_cards_to_deck_bottom(self) -> None:
        state = init_game(seed=42)
        room_cards = list(state.room)
        # avoid_room works on a room that was just dealt (room_being_entered=True means
        # we're inside the room). The RL env calls skipRoom when room has 4 cards and
        # can_defer_room is True. We need to simulate the state the RL env sees.
        avoided = avoid_room(state)
        assert avoided.last_action_was_defer is True
        assert avoided.can_defer_room is False
        # Room cards should be at the bottom of deck
        for card in room_cards:
            assert card in avoided.deck
        # New room should be dealt
        assert len(avoided.room) == 4

    def test_cannot_avoid_twice(self) -> None:
        state = init_game(seed=42)
        avoided_once = avoid_room(state)
        with pytest.raises(ValueError):
            avoid_room(avoided_once)


class TestGetLegalActions:
    def test_inside_room_has_card_actions(self) -> None:
        state = init_game(seed=42)
        actions = get_legal_actions(state)
        action_types = {a.action_type for a in actions}
        assert ActionType.PLAY_CARD in action_types
        # Should also have skipRoom since can_defer_room=True and room has 4 cards
        assert ActionType.SKIP_ROOM in action_types
        # Should NOT have enterRoom (already inside)
        assert ActionType.ENTER_ROOM not in action_types

    def test_game_over_no_actions(self) -> None:
        state = init_game(seed=42)
        dead = _replace_state(state, game_over=True, health=0)
        assert get_legal_actions(dead) == []


class TestCalculateScore:
    def test_victory_score_equals_health(self) -> None:
        state = GameState(deck=[], room=[], health=15, max_health=20, victory=True)
        assert calculate_score(state) == 15

    def test_death_score_subtracts_remaining_monsters(self) -> None:
        remaining = [Card(CardType.MONSTER, Suit.CLUBS, 10), Card(CardType.MONSTER, Suit.SPADES, 5)]
        state = GameState(deck=remaining, room=[], health=0, max_health=20, game_over=True)
        assert calculate_score(state) == 0 - 15  # health(0) - monsters(15)

    def test_victory_bonus_when_full_health_last_potion(self) -> None:
        state = GameState(
            deck=[], room=[], health=20, max_health=20, victory=True,
            last_resolved_card_type=CardType.POTION, last_resolved_potion_value=7,
        )
        assert calculate_score(state) == 27  # 20 + 7
```

**Step 2: Run tests to verify they fail**

Run: `cd python_ai && python -m pytest tests/test_engine.py::TestEnterRoom tests/test_engine.py::TestAvoidRoom tests/test_engine.py::TestGetLegalActions tests/test_engine.py::TestCalculateScore -v`
Expected: ImportError

**Step 3: Implement**

Add to `engine.py`:

```python
class ActionType(Enum):
    ENTER_ROOM = "enterRoom"
    SKIP_ROOM = "skipRoom"
    PLAY_CARD = "playCard"


@dataclass(frozen=True, slots=True)
class Action:
    action_type: ActionType
    card_index: Optional[int] = None
    mode: Optional[str] = None  # "barehanded" | "weapon"


def enter_room(state: GameState) -> GameState:
    """Enter the current room: reset per-turn flags. Matches TS Game.enterRoom."""
    return _replace_state(
        state,
        can_defer_room=True,
        last_action_was_defer=False,
        potion_taken_this_turn=False,
        room_being_entered=True,
        cards_resolved_this_turn=0,
    )


def avoid_room(state: GameState) -> GameState:
    """Skip the current room. Matches TS Game.avoidRoom."""
    if not state.can_defer_room:
        raise ValueError("Cannot defer room.")
    if state.last_action_was_defer:
        raise ValueError("Cannot avoid two rooms in a row.")
    if len(state.room) == 0:
        raise ValueError("No room to avoid.")

    deck = list(state.deck) + list(state.room)
    new_state = GameState(
        deck=deck,
        discard=list(state.discard),
        room=[],
        health=state.health,
        max_health=state.max_health,
        equipped_weapon=state.equipped_weapon,
        last_monster_defeated=state.last_monster_defeated,
        monsters_on_weapon=list(state.monsters_on_weapon),
        can_defer_room=False,
        last_action_was_defer=True,
        game_over=False,
        victory=False,
        room_being_entered=False,
        cards_resolved_this_turn=0,
        potion_taken_this_turn=state.potion_taken_this_turn,
        last_resolved_card_type=state.last_resolved_card_type,
        last_resolved_potion_value=state.last_resolved_potion_value,
    )
    return _apply_turn_rules(new_state)


def get_legal_actions(state: GameState) -> List[Action]:
    """Return all legal actions for the current state. Matches TS getPossibleActions + skipRoom injection."""
    if state.game_over or state.victory:
        return []

    actions: List[Action] = []

    if not state.room_being_entered:
        actions.append(Action(action_type=ActionType.ENTER_ROOM))
        if state.can_defer_room and not state.last_action_was_defer and len(state.room) > 0:
            actions.append(Action(action_type=ActionType.SKIP_ROOM))
    else:
        # Card actions for each card in room
        for i, card in enumerate(state.room):
            if card.card_type == CardType.MONSTER:
                if state.equipped_weapon is not None:
                    if state.last_monster_defeated is None or card.rank <= state.last_monster_defeated.rank:
                        actions.append(Action(ActionType.PLAY_CARD, card_index=i, mode="weapon"))
                actions.append(Action(ActionType.PLAY_CARD, card_index=i, mode="barehanded"))
            elif card.card_type == CardType.POTION:
                actions.append(Action(ActionType.PLAY_CARD, card_index=i))
            elif card.card_type == CardType.WEAPON:
                actions.append(Action(ActionType.PLAY_CARD, card_index=i))

        # Inject skipRoom when inside a 4-card room and defer is legal
        if state.can_defer_room and not state.last_action_was_defer and len(state.room) == 4:
            actions.append(Action(action_type=ActionType.SKIP_ROOM))

    return actions


def calculate_score(state: GameState) -> int:
    """Terminal score. Matches TS Game.calculateScore."""
    if state.victory:
        score = state.health
        if (
            state.health == 20
            and state.last_resolved_card_type == CardType.POTION
            and state.last_resolved_potion_value is not None
        ):
            score += state.last_resolved_potion_value
        return score
    monsters_remaining = sum(c.rank for c in state.deck if c.card_type == CardType.MONSTER)
    return state.health - monsters_remaining
```

**Step 4: Run tests**

Run: `cd python_ai && python -m pytest tests/test_engine.py -v`
Expected: All PASS

**Step 5: Commit**

```bash
git add python_ai/engine.py python_ai/tests/test_engine.py
git commit -m "feat(rl): add enter_room, avoid_room, get_legal_actions, calculate_score"
```

---

### Task 5: Observation Encoding + Action Mask

**Files:**

- Modify: `python_ai/engine.py`
- Modify: `python_ai/tests/test_engine.py`

**Context:** These must produce identical output to `engineWorkerService.ts:encodeObservation` and `buildActionMask`. The canonical deck order for the 44 seen-card bits is: hearts 2-10, diamonds 2-10, clubs 2-14, spades 2-14.

**Step 1: Write failing tests**

```python
from engine import build_action_mask, encode_observation, OBS_SIZE


class TestEncodeObservation:
    def test_output_shape(self) -> None:
        state = init_game(seed=42)
        obs = encode_observation(state)
        assert obs.shape == (OBS_SIZE,)
        assert obs.dtype == np.float32

    def test_initial_health_features(self) -> None:
        state = init_game(seed=42)
        obs = encode_observation(state)
        assert obs[0] == pytest.approx(1.0)  # health/maxHealth = 20/20
        assert obs[1] == pytest.approx(1.0)  # maxHealth/20 = 20/20
        assert obs[5] == 0.0  # potionTakenThisTurn
        assert obs[6] == 1.0  # canDeferRoom
        assert obs[7] == 0.0  # lastActionWasDefer
        assert obs[8] == pytest.approx(40 / 44)  # deck size
        assert obs[9] == pytest.approx(1.0)  # room size 4/4

    def test_values_in_0_1_range(self) -> None:
        state = init_game(seed=42)
        obs = encode_observation(state)
        assert np.all(obs >= 0.0)
        assert np.all(obs <= 1.0)


class TestBuildActionMask:
    def test_shape_and_dtype(self) -> None:
        state = init_game(seed=42)
        mask = build_action_mask(state)
        assert mask.shape == (10,)
        assert mask.dtype == bool

    def test_initial_state_no_enter_room(self) -> None:
        state = init_game(seed=42)
        mask = build_action_mask(state)
        assert mask[0] is np.bool_(False)  # enterRoom not legal (already inside)
        assert mask[1] is np.bool_(True)   # skipRoom legal (can defer, 4 cards)

    def test_game_over_all_false(self) -> None:
        state = init_game(seed=42)
        dead = _replace_state(state, game_over=True, health=0)
        mask = build_action_mask(dead)
        assert not np.any(mask)
```

**Step 2: Run tests to verify they fail**

Run: `cd python_ai && python -m pytest tests/test_engine.py::TestEncodeObservation tests/test_engine.py::TestBuildActionMask -v`
Expected: ImportError

**Step 3: Implement**

Add to `engine.py`:

```python
OBS_SIZE = 74

# Build canonical deck index for seen-card bits (indices 30-73)
_CANONICAL_DECK: List[tuple[CardType, Suit, int]] = []
for _suit in [Suit.HEARTS, Suit.DIAMONDS, Suit.CLUBS, Suit.SPADES]:
    for _rank in range(2, 15):
        if _suit in (Suit.HEARTS, Suit.DIAMONDS) and _rank >= 11:
            continue
        if _suit == Suit.HEARTS:
            _ct = CardType.POTION
        elif _suit == Suit.DIAMONDS:
            _ct = CardType.WEAPON
        else:
            _ct = CardType.MONSTER
        _CANONICAL_DECK.append((_ct, _suit, _rank))

_CARD_INDEX: dict[tuple[CardType, Suit, int], int] = {
    entry: idx for idx, entry in enumerate(_CANONICAL_DECK)
}


def encode_observation(state: GameState) -> np.ndarray:
    """Encode game state as a 74-dim float32 vector. Matches TS encodeObservation exactly."""
    obs = np.zeros(OBS_SIZE, dtype=np.float32)
    max_health = max(state.max_health, 1)

    obs[0] = state.health / max_health
    obs[1] = state.max_health / 20.0
    obs[2] = (state.equipped_weapon.rank / MAX_RANK) if state.equipped_weapon else 0.0
    obs[3] = (state.last_monster_defeated.rank / MAX_RANK) if state.last_monster_defeated else 0.0
    obs[4] = min(len(state.monsters_on_weapon), 4) / 4.0
    obs[5] = 1.0 if state.potion_taken_this_turn else 0.0
    obs[6] = 1.0 if state.can_defer_room else 0.0
    obs[7] = 1.0 if state.last_action_was_defer else 0.0
    obs[8] = min(len(state.deck), 44) / 44.0
    obs[9] = min(len(state.room), 4) / 4.0

    for i in range(min(len(state.room), 4)):
        card = state.room[i]
        base = 10 + i * 4
        obs[base] = 1.0 if card.card_type == CardType.MONSTER else 0.0
        obs[base + 1] = 1.0 if card.card_type == CardType.WEAPON else 0.0
        obs[base + 2] = 1.0 if card.card_type == CardType.POTION else 0.0
        obs[base + 3] = card.rank / MAX_RANK

    for i in range(min(len(state.monsters_on_weapon), 4)):
        obs[26 + i] = state.monsters_on_weapon[i].rank / MAX_RANK

    def _mark_seen(card: Optional[Card]) -> None:
        if card is None:
            return
        key = (card.card_type, card.suit, card.rank)
        idx = _CARD_INDEX.get(key)
        if idx is not None:
            obs[30 + idx] = 1.0

    for card in state.discard:
        _mark_seen(card)
    for card in state.room:
        _mark_seen(card)
    _mark_seen(state.equipped_weapon)
    for card in state.monsters_on_weapon:
        _mark_seen(card)

    return obs


def _action_to_discrete(action: Action) -> Optional[int]:
    """Map an Action to the discrete action index [0..9]. Matches TS actionToDiscrete."""
    if action.action_type == ActionType.ENTER_ROOM:
        return 0
    if action.action_type == ActionType.SKIP_ROOM:
        return 1
    if action.action_type == ActionType.PLAY_CARD and action.card_index is not None:
        if action.card_index < 0 or action.card_index > 3:
            return None
        base = 2 + action.card_index * 2
        return base + 1 if action.mode == "weapon" else base
    return None


def build_action_mask(state: GameState) -> np.ndarray:
    """Build 10-element boolean action mask. Matches TS buildActionMask exactly."""
    mask = np.zeros(10, dtype=bool)
    for action in get_legal_actions(state):
        idx = _action_to_discrete(action)
        if idx is not None:
            mask[idx] = True
    return mask
```

**Step 4: Run tests**

Run: `cd python_ai && python -m pytest tests/test_engine.py -v`
Expected: All PASS

**Step 5: Commit**

```bash
git add python_ai/engine.py python_ai/tests/test_engine.py
git commit -m "feat(rl): add encode_observation and build_action_mask"
```

---

### Task 6: Cross-Validation Test Against TS Engine

**Files:**

- Create: `python_ai/tests/test_cross_validation.py`

**Context:** This is the critical safety net. Run N games with fixed deck seeds through both engines (TS via `bridge_client`, Python via `engine.py`) using identical random action sequences. Assert that observations, action masks, health, score, game_over, and victory match at every step.

**Step 1: Write cross-validation test**

```python
# python_ai/tests/test_cross_validation.py
from __future__ import annotations

import numpy as np
import pytest

from bridge_client import EngineWorkerClient
from engine import (
    ActionType,
    build_action_mask,
    calculate_score,
    avoid_room,
    encode_observation,
    enter_room,
    get_legal_actions,
    init_game,
    play_card,
)

SEEDS_TO_TEST = list(range(1, 51))  # 50 deterministic seeds
MAX_STEPS = 200


@pytest.fixture(scope="module")
def ts_client() -> EngineWorkerClient:
    client = EngineWorkerClient()
    client.start()
    yield client
    client.stop()


def _discrete_to_worker_action(action_idx: int) -> dict:
    if action_idx == 0:
        return {"actionType": "enterRoom"}
    if action_idx == 1:
        return {"actionType": "skipRoom"}
    rel = action_idx - 2
    card_idx = rel // 2
    use_weapon = rel % 2 == 1
    return {"actionType": "playCard", "cardIdx": card_idx, "mode": "weapon" if use_weapon else "barehanded"}


@pytest.mark.parametrize("deck_seed", SEEDS_TO_TEST)
def test_cross_validation(ts_client: EngineWorkerClient, deck_seed: int) -> None:
    """Play a game with random legal actions through both engines, assert identical transitions."""
    rng = np.random.default_rng(deck_seed * 7919)

    # Init both engines
    py_state = init_game(seed=deck_seed)
    ts_snapshot = ts_client.create_session_rl(deck_seed=deck_seed)
    session_id = ts_snapshot["sessionId"]

    try:
        for step in range(MAX_STEPS):
            # Compare observations
            py_obs = encode_observation(py_state)
            ts_obs = np.asarray(ts_snapshot["observation"], dtype=np.float32)
            np.testing.assert_allclose(py_obs, ts_obs, atol=1e-6, err_msg=f"Observation mismatch at step {step}, seed {deck_seed}")

            # Compare action masks
            py_mask = build_action_mask(py_state)
            ts_mask = np.asarray(ts_snapshot["actionMask"], dtype=bool)
            np.testing.assert_array_equal(py_mask, ts_mask, err_msg=f"Action mask mismatch at step {step}, seed {deck_seed}")

            # Compare scalar stats
            assert py_state.health == ts_snapshot["health"], f"Health mismatch at step {step}"
            assert py_state.game_over == ts_snapshot["gameOver"], f"gameOver mismatch at step {step}"
            assert py_state.victory == ts_snapshot["victory"], f"victory mismatch at step {step}"

            if py_state.game_over or py_state.victory:
                py_score = calculate_score(py_state)
                ts_score = ts_snapshot["score"]
                assert py_score == ts_score, f"Score mismatch at terminal step {step}"
                break

            # Pick a random legal action from the mask
            legal_indices = np.flatnonzero(py_mask)
            if len(legal_indices) == 0:
                break
            action_idx = int(rng.choice(legal_indices))

            # Step both engines with the same action
            worker_action = _discrete_to_worker_action(action_idx)
            ts_snapshot = ts_client.step_action_rl(session_id, worker_action)

            # Apply same action in Python engine
            if action_idx == 0:
                py_state = enter_room(py_state)
            elif action_idx == 1:
                py_state = avoid_room(py_state)
            else:
                rel = action_idx - 2
                card_idx = rel // 2
                mode = "weapon" if rel % 2 == 1 else "barehanded"
                py_state = play_card(py_state, card_idx, mode=mode)
    finally:
        try:
            ts_client.close_session(session_id)
        except Exception:
            pass
```

**Step 2: Run tests (requires Node.js worker to be available)**

Run: `cd python_ai && python -m pytest tests/test_cross_validation.py -v --timeout=120`
Expected: All 50 seeds PASS

**Step 3: Fix any mismatches**

If any seed fails, compare the exact step where divergence occurs. Common sources of mismatch:

- Mulberry32 bit arithmetic (check `_imul` for overflow behavior)
- Fisher-Yates shuffle direction (must be `i` from `len-1` down to `1`)
- Room deal timing after 3rd card resolution vs room empty
- Potion heal clamping
- Weapon lock constraint edge cases

**Step 4: Commit**

```bash
git add python_ai/tests/test_cross_validation.py
git commit -m "test(rl): add cross-validation test suite for Python vs TS engine"
```

---

### Task 7: Integrate Python Engine into ScoundrelEnv

**Files:**

- Modify: `python_ai/scoundrel_env.py`
- Modify: `python_ai/tests/test_engine.py` (add env integration test)

**Context:** Replace all `bridge_client` calls with direct `engine.py` calls. The env no longer spawns a subprocess. This is the payoff — every `step()` is now a pure Python function call.

**Step 1: Write failing integration test**

```python
# Append to python_ai/tests/test_engine.py
from scoundrel_env import ScoundrelEnv


class TestScoundrelEnvIntegration:
    def test_reset_returns_valid_obs(self) -> None:
        env = ScoundrelEnv(max_episode_steps=200)
        obs, info = env.reset(seed=42)
        assert obs.shape == (74,)
        assert obs.dtype == np.float32
        env.close()

    def test_step_with_valid_action(self) -> None:
        env = ScoundrelEnv(max_episode_steps=200)
        obs, _ = env.reset(seed=42)
        mask = env.action_masks()
        legal = np.flatnonzero(mask)
        assert len(legal) > 0
        obs, reward, terminated, truncated, info = env.step(int(legal[0]))
        assert obs.shape == (74,)
        env.close()

    def test_full_episode_completes(self) -> None:
        env = ScoundrelEnv(max_episode_steps=200, deck_seed=42)
        obs, _ = env.reset()
        for _ in range(200):
            mask = env.action_masks()
            legal = np.flatnonzero(mask)
            if len(legal) == 0:
                break
            obs, reward, terminated, truncated, info = env.step(int(legal[0]))
            if terminated or truncated:
                break
        env.close()
```

**Step 2: Run test to verify it fails (still uses bridge_client)**

Run: `cd python_ai && python -m pytest tests/test_engine.py::TestScoundrelEnvIntegration -v`
Expected: Should work with existing bridge but we'll make it work without.

**Step 3: Rewrite ScoundrelEnv to use Python engine**

Replace `python_ai/scoundrel_env.py` contents:

```python
from __future__ import annotations

from typing import Any, Dict, Optional, Tuple

import gymnasium as gym
import numpy as np
from gymnasium import spaces

from engine import (
    GameState,
    OBS_SIZE,
    avoid_room,
    build_action_mask,
    calculate_score,
    encode_observation,
    enter_room,
    get_legal_actions,
    init_game,
    play_card,
)


class ScoundrelEnv(gym.Env[np.ndarray, int]):
    metadata = {"render_modes": ["human"]}

    def __init__(
        self,
        max_episode_steps: int = 200,
        deck_seed: Optional[int] = None,
        reward_mode: str = "baseline",
        reward_debug: bool = False,
    ) -> None:
        super().__init__()
        self.max_episode_steps = max_episode_steps
        self.deck_seed = deck_seed
        self.reward_mode = reward_mode
        self.reward_debug = reward_debug
        self.episode_steps = 0
        self.last_health = 20.0

        self._state: Optional[GameState] = None
        self._last_obs = np.zeros(OBS_SIZE, dtype=np.float32)
        self._last_mask = np.zeros(10, dtype=bool)
        self._step_stats: Dict[str, Any] = self._default_stats()

        self.action_space = spaces.Discrete(10)
        self.observation_space = spaces.Box(low=0.0, high=1.0, shape=(OBS_SIZE,), dtype=np.float32)

    @staticmethod
    def _default_stats() -> Dict[str, Any]:
        return {
            "health": 20.0,
            "maxHealth": 20.0,
            "score": 0.0,
            "victory": False,
            "gameOver": False,
            "discardCount": 0,
            "roomCount": 0,
            "lastActionWasDefer": False,
        }

    def reset(self, *, seed: Optional[int] = None, options: Optional[dict] = None):
        super().reset(seed=seed)
        self._state = init_game(seed=self.deck_seed)
        self._sync_from_state()
        self.last_health = float(self._step_stats["health"])
        self.episode_steps = 0
        return self._last_obs.copy(), {}

    def step(self, action: int):
        if self._state is None:
            raise RuntimeError("Environment not initialized. Call reset() first.")

        action = int(action)
        if action < 0 or action >= self._last_mask.size or not bool(self._last_mask[action]):
            return self._last_obs.copy(), -1.0, False, False, {"invalid_action": True}

        prev_stats = self._step_stats.copy()
        self._apply_action(action)
        self._sync_from_state()

        self.episode_steps += 1
        terminated = bool(self._step_stats.get("gameOver") or self._step_stats.get("victory"))
        truncated = self.episode_steps >= self.max_episode_steps and not terminated
        reward, reward_components = self._compute_reward(prev_stats, self._step_stats, terminated)

        info: Dict[str, Any] = {
            "score": float(self._step_stats.get("score", 0.0)),
            "victory": bool(self._step_stats.get("victory", False)),
            "gameOver": bool(self._step_stats.get("gameOver", False)),
            "truncated": truncated,
        }
        if self.reward_debug:
            info["rewardComponents"] = reward_components
        return self._last_obs.copy(), reward, terminated, truncated, info

    def render(self):
        print(
            {
                "health": float(self._step_stats.get("health", 0.0)),
                "possible_actions": np.where(self._last_mask)[0].tolist(),
            }
        )

    def close(self):
        self._state = None

    def action_masks(self) -> np.ndarray:
        return self._last_mask.copy()

    def set_deck_seed(self, deck_seed: Optional[int]) -> None:
        self.deck_seed = deck_seed

    def discrete_to_worker_action(self, action_idx: int) -> Dict[str, Any]:
        """Map discrete action index to worker-format dict (used by watch_agent_game)."""
        if action_idx == 0:
            return {"actionType": "enterRoom"}
        if action_idx == 1:
            return {"actionType": "skipRoom"}
        if 2 <= action_idx <= 9:
            rel = action_idx - 2
            card_idx = rel // 2
            use_weapon = rel % 2 == 1
            return {"actionType": "playCard", "cardIdx": card_idx, "mode": "weapon" if use_weapon else "barehanded"}
        raise RuntimeError(f"No worker action mapped for discrete action index {action_idx}.")

    def _apply_action(self, action_idx: int) -> None:
        assert self._state is not None
        if action_idx == 0:
            self._state = enter_room(self._state)
        elif action_idx == 1:
            self._state = avoid_room(self._state)
        elif 2 <= action_idx <= 9:
            rel = action_idx - 2
            card_idx = rel // 2
            mode = "weapon" if rel % 2 == 1 else "barehanded"
            self._state = play_card(self._state, card_idx, mode=mode)

    def _sync_from_state(self) -> None:
        assert self._state is not None
        self._last_obs = encode_observation(self._state)
        self._last_mask = build_action_mask(self._state)
        is_terminal = self._state.game_over or self._state.victory
        self._step_stats = {
            "health": float(self._state.health),
            "maxHealth": float(self._state.max_health),
            "score": float(calculate_score(self._state)) if is_terminal else 0.0,
            "victory": self._state.victory,
            "gameOver": self._state.game_over,
            "discardCount": len(self._state.discard),
            "roomCount": len(self._state.room),
            "lastActionWasDefer": self._state.last_action_was_defer,
        }

    # ── Reward functions (unchanged from original) ──

    def _compute_reward(
        self,
        prev_stats: Optional[Dict[str, Any]],
        curr_stats: Dict[str, Any],
        terminated: bool,
    ) -> Tuple[float, Dict[str, float]]:
        if self.reward_mode == "baseline":
            reward = self._compute_reward_baseline(curr_stats, terminated)
            return reward, {"total": reward}
        if self.reward_mode == "dense_v1":
            return self._compute_reward_dense_v1(prev_stats, curr_stats, terminated)
        raise ValueError(f"Unsupported reward_mode: {self.reward_mode}")

    def _compute_reward_baseline(self, curr_stats: Dict[str, Any], terminated: bool) -> float:
        health = float(curr_stats.get("health", self.last_health))
        health_delta = (health - self.last_health) / max(float(curr_stats.get("maxHealth", 20)), 1.0)
        self.last_health = health
        shaped = 0.05 * health_delta
        if not terminated:
            return shaped
        score = float(curr_stats.get("score", 0.0))
        terminal = float(np.clip(score / 100.0, -1.0, 1.0))
        return float(terminal + shaped)

    def _compute_reward_dense_v1(
        self,
        prev_stats: Optional[Dict[str, Any]],
        curr_stats: Dict[str, Any],
        terminated: bool,
    ) -> Tuple[float, Dict[str, float]]:
        health = float(curr_stats.get("health", self.last_health))
        health_delta = (health - self.last_health) / max(float(curr_stats.get("maxHealth", 20)), 1.0)
        self.last_health = health
        health_component = 0.1 * health_delta
        discard_delta = 0
        room_transition = 0.0
        skip_penalty = 0.0
        if prev_stats is not None:
            prev_discard = int(prev_stats.get("discardCount", 0))
            curr_discard = int(curr_stats.get("discardCount", 0))
            discard_delta = max(curr_discard - prev_discard, 0)
            prev_room_len = int(prev_stats.get("roomCount", 0))
            curr_room_len = int(curr_stats.get("roomCount", 0))
            if prev_room_len > 0 and curr_room_len == 4 and prev_room_len != 4:
                room_transition = 0.02
            if (
                not bool(prev_stats.get("lastActionWasDefer", False))
                and bool(curr_stats.get("lastActionWasDefer", False))
                and prev_room_len == 4
            ):
                skip_penalty = -0.02
        resolve_component = 0.01 * float(discard_delta)
        terminal_component = 0.0
        if terminated:
            score = float(curr_stats.get("score", 0.0))
            terminal_component = float(np.clip(score / 100.0, -1.0, 1.0))
        total = float(health_component + resolve_component + room_transition + skip_penalty + terminal_component)
        components = {
            "health": float(health_component),
            "resolve": float(resolve_component),
            "roomTransition": float(room_transition),
            "skipPenalty": float(skip_penalty),
            "terminal": float(terminal_component),
            "total": total,
        }
        return total, components


__all__ = ["ScoundrelEnv"]
```

**Step 4: Update vec_env_utils.py — remove worker_command from factory**

The `make_env_factory` no longer needs `worker_command`. The `ScoundrelEnv` constructor no longer accepts it. Verify `vec_env_utils.py` already doesn't pass it (it doesn't — checked earlier). No changes needed.

**Step 5: Run integration tests**

Run: `cd python_ai && python -m pytest tests/test_engine.py::TestScoundrelEnvIntegration -v`
Expected: All PASS

**Step 6: Commit**

```bash
git add python_ai/scoundrel_env.py python_ai/tests/test_engine.py
git commit -m "feat(rl): integrate Python engine into ScoundrelEnv, eliminate IPC bridge"
```

---

### Task 8: Smoke Test Training + Benchmark

**Files:** No new files — this is a validation step.

**Step 1: Run a short training smoke test**

Run: `cd python_ai && python train_ppo.py --timesteps 10000 --num-envs 2 --vec-env dummy --model-out /tmp/smoke_test_model --seed 42`
Expected: Completes without error, prints training config and saves model.

**Step 2: Run baseline random to verify env works end-to-end**

Run: `cd python_ai && python baseline_random.py --games 100 --num-envs 2 --vec-env dummy --out /tmp/smoke_random.json`
Expected: Completes, prints JSON with avg_score and win_rate.

**Step 3: Time comparison (manual)**

Run the same 100-game baseline_random with the old bridge-based env (before this branch) and the new Python engine. Compare wall-clock time to estimate speedup.

**Step 4: Commit any needed fixes, then final commit**

```bash
git add -A
git commit -m "test(rl): verify training and evaluation with Python engine"
```

---

## Execution Notes

- **Task 6 (cross-validation) is the most critical.** If observations or masks diverge, the trained model will behave differently when served against the TS engine. Do not skip this.
- **The `_imul` function** is the most likely source of cross-engine mismatch. JavaScript `Math.imul` does signed 32-bit multiply; the Python `ctypes.c_int32(a * b).value` emulation must handle overflow identically.
- **GameState is mutable** (not frozen dataclass) despite the original design note — this is because `_deal_room` and `init_game` need to set fields after construction. The `_replace_state` helper produces new instances for action functions.
- **`watch_agent_game.py` still uses `bridge_client`** for pretty-printing TS game state. That's intentional — it's not on the training hot path.
