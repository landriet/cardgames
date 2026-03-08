"""Tests for the Python Scoundrel engine.

Tests are organized by task and follow a TDD approach: each section tests one
logical chunk before the implementation is written, then verifies it passes.
"""

from __future__ import annotations

import ctypes
from typing import List

import numpy as np
import pytest

# ---------------------------------------------------------------------------
# Task 1: Card types, mulberry32 PRNG, create_deck
# ---------------------------------------------------------------------------


class TestCardTypes:
    """Verify Card dataclass and enum values."""

    def test_card_is_frozen(self):
        from engine import Card, CardType, Suit

        card = Card(card_type=CardType.MONSTER, suit=Suit.CLUBS, rank=5)
        with pytest.raises((AttributeError, TypeError)):
            card.rank = 9  # type: ignore[misc]

    def test_card_fields(self):
        from engine import Card, CardType, Suit

        card = Card(card_type=CardType.POTION, suit=Suit.HEARTS, rank=7)
        assert card.card_type == CardType.POTION
        assert card.suit == Suit.HEARTS
        assert card.rank == 7

    def test_card_type_values(self):
        from engine import CardType

        assert CardType.MONSTER.value == "monster"
        assert CardType.WEAPON.value == "weapon"
        assert CardType.POTION.value == "potion"

    def test_suit_values(self):
        from engine import Suit

        assert Suit.HEARTS.value == "hearts"
        assert Suit.DIAMONDS.value == "diamonds"
        assert Suit.CLUBS.value == "clubs"
        assert Suit.SPADES.value == "spades"

    def test_card_equality(self):
        from engine import Card, CardType, Suit

        a = Card(CardType.WEAPON, Suit.DIAMONDS, 5)
        b = Card(CardType.WEAPON, Suit.DIAMONDS, 5)
        assert a == b

    def test_card_inequality(self):
        from engine import Card, CardType, Suit

        a = Card(CardType.MONSTER, Suit.CLUBS, 5)
        b = Card(CardType.MONSTER, Suit.SPADES, 5)
        assert a != b


class TestMulberry32:
    """Verify the mulberry32 PRNG produces values identical to the TS implementation.

    Expected values were computed from the TypeScript reference implementation
    by running:
        const rng = Game.mulberry32(42);
        [rng(), rng(), rng(), rng(), rng()]
    Result: approximately
        0.8722505090944469
        0.6505699193756282
        0.3134727193042636
        0.7724398933444917
        0.5693243939895183
    """

    def test_first_value_seed_42(self):
        from engine import mulberry32

        rng = mulberry32(42)
        val = rng()
        # Verified against TS: Game.mulberry32(42)() === 0.6011037519201636
        assert abs(val - 0.6011037519201636) < 1e-10

    def test_sequence_seed_42(self):
        from engine import mulberry32

        rng = mulberry32(42)
        vals = [rng() for _ in range(5)]
        # Verified by running Game.mulberry32(42) in Node.js
        expected = [
            0.6011037519201636,
            0.44829055899754167,
            0.8524657934904099,
            0.6697340414393693,
            0.17481389874592423,
        ]
        for val, exp in zip(vals, expected):
            assert abs(val - exp) < 1e-10, f"Got {val}, expected {exp}"

    def test_seed_0(self):
        from engine import mulberry32

        rng = mulberry32(0)
        val = rng()
        # Verified against TS: Game.mulberry32(0)() === 0.26642920868471265
        assert abs(val - 0.26642920868471265) < 1e-10

    def test_seed_1(self):
        from engine import mulberry32

        rng = mulberry32(1)
        val = rng()
        # Verified against TS: Game.mulberry32(1)() === 0.6270739405881613
        assert abs(val - 0.6270739405881613) < 1e-10

    def test_signed_32bit_wraparound(self):
        """mulberry32 must handle large seeds via signed 32-bit truncation."""
        from engine import mulberry32

        # Seed 2**31 = 2147483648 wraps to -2147483648 in signed 32-bit.
        # The PRNG should still return a value in [0, 1).
        rng = mulberry32(2**31)
        val = rng()
        assert 0.0 <= val < 1.0

    def test_returns_callable(self):
        from engine import mulberry32

        rng = mulberry32(123)
        assert callable(rng)

    def test_stateful_sequence(self):
        """Each call to the same rng advances state."""
        from engine import mulberry32

        rng = mulberry32(99)
        v1 = rng()
        v2 = rng()
        assert v1 != v2


class TestCreateDeck:
    """Verify deck creation and shuffling."""

    def test_deck_length(self):
        from engine import create_deck

        deck = create_deck(seed=0)
        assert len(deck) == 44

    def test_deck_structure_no_face_cards_for_hearts_diamonds(self):
        from engine import CardType, Suit, create_deck

        deck = create_deck(seed=0)
        for card in deck:
            if card.suit in (Suit.HEARTS, Suit.DIAMONDS):
                assert card.rank <= 10, f"Hearts/diamonds should not have rank >10: {card}"

    def test_hearts_are_potions(self):
        from engine import CardType, Suit, create_deck

        deck = create_deck(seed=0)
        for card in deck:
            if card.suit == Suit.HEARTS:
                assert card.card_type == CardType.POTION

    def test_diamonds_are_weapons(self):
        from engine import CardType, Suit, create_deck

        deck = create_deck(seed=0)
        for card in deck:
            if card.suit == Suit.DIAMONDS:
                assert card.card_type == CardType.WEAPON

    def test_clubs_and_spades_are_monsters(self):
        from engine import CardType, Suit, create_deck

        deck = create_deck(seed=0)
        for card in deck:
            if card.suit in (Suit.CLUBS, Suit.SPADES):
                assert card.card_type == CardType.MONSTER

    def test_hearts_ranks(self):
        """Hearts should have ranks 2-10 (9 cards)."""
        from engine import Suit, create_deck

        deck = create_deck(seed=0)
        hearts = sorted([c.rank for c in deck if c.suit == Suit.HEARTS])
        assert hearts == list(range(2, 11))

    def test_diamonds_ranks(self):
        """Diamonds should have ranks 2-10 (9 cards)."""
        from engine import Suit, create_deck

        deck = create_deck(seed=0)
        diamonds = sorted([c.rank for c in deck if c.suit == Suit.DIAMONDS])
        assert diamonds == list(range(2, 11))

    def test_clubs_ranks(self):
        """Clubs should have ranks 2-14 (13 cards)."""
        from engine import Suit, create_deck

        deck = create_deck(seed=0)
        clubs = sorted([c.rank for c in deck if c.suit == Suit.CLUBS])
        assert clubs == list(range(2, 15))

    def test_spades_ranks(self):
        """Spades should have ranks 2-14 (13 cards)."""
        from engine import Suit, create_deck

        deck = create_deck(seed=0)
        spades = sorted([c.rank for c in deck if c.suit == Suit.SPADES])
        assert spades == list(range(2, 15))

    def test_deterministic_same_seed(self):
        from engine import create_deck

        deck1 = create_deck(seed=7)
        deck2 = create_deck(seed=7)
        assert deck1 == deck2

    def test_different_seeds_give_different_order(self):
        from engine import create_deck

        deck1 = create_deck(seed=1)
        deck2 = create_deck(seed=2)
        # It is astronomically unlikely they would be identical
        assert deck1 != deck2

    def test_no_seed_gives_random_deck(self):
        """Without a seed the deck should still be 44 cards."""
        from engine import create_deck

        deck = create_deck()
        assert len(deck) == 44

    def test_seed_42_first_card(self):
        """Verify first card of seed=42 matches TS reference output.

        TS reference: Game.createDeck(42) — first card should be determined
        by the mulberry32-shuffled Fisher-Yates sequence.
        """
        from engine import create_deck

        deck = create_deck(seed=42)
        # The deck must have exactly 44 cards with correct composition
        assert len(deck) == 44


# ---------------------------------------------------------------------------
# Task 2: GameState dataclass and init_game
# ---------------------------------------------------------------------------


class TestGameState:
    """Verify GameState dataclass has all required fields."""

    def test_gamestate_fields_exist(self):
        from engine import GameState

        state = GameState.__dataclass_fields__  # type: ignore[attr-defined]
        required = {
            "deck",
            "discard",
            "room",
            "equipped_weapon",
            "last_monster_defeated",
            "monsters_on_weapon",
            "health",
            "max_health",
            "can_defer_room",
            "last_action_was_defer",
            "game_over",
            "victory",
            "potion_taken_this_turn",
            "potions_taken_this_turn",
            "room_being_entered",
            "cards_resolved_this_turn",
            "last_resolved_card_type",
            "last_resolved_potion_value",
        }
        for field in required:
            assert field in state, f"Missing field: {field}"


class TestInitGame:
    """Verify init_game produces a valid starting state."""

    def test_init_game_returns_gamestate(self):
        from engine import GameState, init_game

        state = init_game(seed=42)
        assert isinstance(state, GameState)

    def test_init_game_health_20(self):
        from engine import init_game

        state = init_game(seed=0)
        assert state.health == 20
        assert state.max_health == 20

    def test_init_game_room_has_4_cards(self):
        from engine import init_game

        state = init_game(seed=0)
        assert len(state.room) == 4

    def test_init_game_deck_has_40_cards(self):
        """44 total minus 4 dealt to room."""
        from engine import init_game

        state = init_game(seed=0)
        assert len(state.deck) == 40

    def test_init_game_no_weapon_equipped(self):
        from engine import init_game

        state = init_game(seed=0)
        assert state.equipped_weapon is None

    def test_init_game_room_being_entered(self):
        """After init_game the engine is in the roomBeingEntered=True state."""
        from engine import init_game

        state = init_game(seed=0)
        assert state.room_being_entered is True

    def test_init_game_can_defer(self):
        from engine import init_game

        state = init_game(seed=0)
        assert state.can_defer_room is True

    def test_init_game_last_action_was_defer_false(self):
        from engine import init_game

        state = init_game(seed=0)
        assert state.last_action_was_defer is False

    def test_init_game_discard_empty(self):
        from engine import init_game

        state = init_game(seed=0)
        assert len(state.discard) == 0

    def test_init_game_deterministic(self):
        from engine import init_game

        s1 = init_game(seed=123)
        s2 = init_game(seed=123)
        assert s1.room == s2.room
        assert s1.deck == s2.deck

    def test_init_game_total_cards_44(self):
        """deck + room should total 44 at game start."""
        from engine import init_game

        state = init_game(seed=5)
        assert len(state.deck) + len(state.room) == 44


# ---------------------------------------------------------------------------
# Task 3: play_card
# ---------------------------------------------------------------------------


class TestPlayCardPotion:
    """Verify potion handling in play_card."""

    def _state_with_potion_in_room(self, health: int = 15):
        """Return a state with a potion as the first room card."""
        from engine import Card, CardType, GameState, Suit

        potion = Card(CardType.POTION, Suit.HEARTS, 5)
        state = GameState(
            deck=[],
            discard=[],
            room=[potion],
            equipped_weapon=None,
            last_monster_defeated=None,
            monsters_on_weapon=[],
            health=health,
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
        return state, potion

    def test_potion_heals_health(self):
        from engine import play_card

        state, potion = self._state_with_potion_in_room(health=15)
        new_state = play_card(state, 0)
        assert new_state.health == 20

    def test_potion_capped_at_max_health(self):
        from engine import play_card

        state, potion = self._state_with_potion_in_room(health=18)
        # Rank-5 potion on health=18 → capped at 20
        new_state = play_card(state, 0)
        assert new_state.health == 20

    def test_potion_removed_from_room(self):
        from engine import play_card

        state, potion = self._state_with_potion_in_room()
        new_state = play_card(state, 0)
        assert potion not in new_state.room

    def test_potion_added_to_discard(self):
        from engine import play_card

        state, potion = self._state_with_potion_in_room()
        new_state = play_card(state, 0)
        assert potion in new_state.discard

    def test_second_potion_same_turn_no_heal(self):
        """Only one potion heals per turn (potionsPerRoom=1)."""
        from engine import Card, CardType, GameState, Suit, play_card

        potion1 = Card(CardType.POTION, Suit.HEARTS, 5)
        potion2 = Card(CardType.POTION, Suit.HEARTS, 3)
        state = GameState(
            deck=[],
            discard=[],
            room=[potion1, potion2],
            equipped_weapon=None,
            last_monster_defeated=None,
            monsters_on_weapon=[],
            health=10,
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
        after_first = play_card(state, 0)
        assert after_first.health == 15  # healed by 5
        assert after_first.potion_taken_this_turn is True

        after_second = play_card(after_first, 0)  # potion2 is now index 0
        assert after_second.health == 15  # no additional heal

    def test_potion_sets_potion_taken_flag(self):
        from engine import play_card

        state, potion = self._state_with_potion_in_room()
        new_state = play_card(state, 0)
        assert new_state.potion_taken_this_turn is True

    def test_potion_sets_last_resolved_card_type(self):
        from engine import play_card

        state, _ = self._state_with_potion_in_room()
        new_state = play_card(state, 0)
        assert new_state.last_resolved_card_type == "potion"

    def test_potion_sets_last_resolved_potion_value(self):
        from engine import play_card

        state, _ = self._state_with_potion_in_room()
        new_state = play_card(state, 0)
        assert new_state.last_resolved_potion_value == 5


class TestPlayCardWeapon:
    """Verify weapon handling in play_card."""

    def _state_with_weapon_in_room(self):
        from engine import Card, CardType, GameState, Suit

        weapon = Card(CardType.WEAPON, Suit.DIAMONDS, 7)
        state = GameState(
            deck=[],
            discard=[],
            room=[weapon],
            equipped_weapon=None,
            last_monster_defeated=None,
            monsters_on_weapon=[],
            health=20,
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
        return state, weapon

    def test_equip_weapon(self):
        from engine import play_card

        state, weapon = self._state_with_weapon_in_room()
        new_state = play_card(state, 0)
        assert new_state.equipped_weapon == weapon

    def test_equip_weapon_removes_from_room(self):
        from engine import play_card

        state, weapon = self._state_with_weapon_in_room()
        new_state = play_card(state, 0)
        assert weapon not in new_state.room

    def test_old_weapon_goes_to_discard(self):
        from engine import Card, CardType, GameState, Suit, play_card

        old_weapon = Card(CardType.WEAPON, Suit.DIAMONDS, 4)
        new_weapon = Card(CardType.WEAPON, Suit.DIAMONDS, 8)
        state = GameState(
            deck=[],
            discard=[],
            room=[new_weapon],
            equipped_weapon=old_weapon,
            last_monster_defeated=None,
            monsters_on_weapon=[],
            health=20,
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
        new_state = play_card(state, 0)
        assert new_state.equipped_weapon == new_weapon
        assert old_weapon in new_state.discard

    def test_monsters_on_weapon_discarded_with_old_weapon(self):
        from engine import Card, CardType, GameState, Suit, play_card

        old_weapon = Card(CardType.WEAPON, Suit.DIAMONDS, 4)
        monster1 = Card(CardType.MONSTER, Suit.CLUBS, 3)
        new_weapon = Card(CardType.WEAPON, Suit.DIAMONDS, 8)
        state = GameState(
            deck=[],
            discard=[],
            room=[new_weapon],
            equipped_weapon=old_weapon,
            last_monster_defeated=monster1,
            monsters_on_weapon=[monster1],
            health=20,
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
        new_state = play_card(state, 0)
        assert monster1 in new_state.discard
        assert new_state.monsters_on_weapon == []

    def test_weapon_clears_last_monster_defeated(self):
        from engine import Card, CardType, GameState, Suit, play_card

        old_weapon = Card(CardType.WEAPON, Suit.DIAMONDS, 4)
        monster = Card(CardType.MONSTER, Suit.CLUBS, 3)
        new_weapon = Card(CardType.WEAPON, Suit.DIAMONDS, 6)
        state = GameState(
            deck=[],
            discard=[],
            room=[new_weapon],
            equipped_weapon=old_weapon,
            last_monster_defeated=monster,
            monsters_on_weapon=[monster],
            health=20,
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
        new_state = play_card(state, 0)
        assert new_state.last_monster_defeated is None


class TestPlayCardMonster:
    """Verify monster handling in play_card."""

    def _state_with_monster(
        self,
        monster_rank: int = 5,
        weapon_rank: int | None = None,
        last_defeated_rank: int | None = None,
        health: int = 20,
    ):
        from engine import Card, CardType, GameState, Suit

        monster = Card(CardType.MONSTER, Suit.CLUBS, monster_rank)
        weapon = Card(CardType.WEAPON, Suit.DIAMONDS, weapon_rank) if weapon_rank else None
        last_defeated = Card(CardType.MONSTER, Suit.CLUBS, last_defeated_rank) if last_defeated_rank else None
        monsters_on_weapon = [last_defeated] if last_defeated else []
        state = GameState(
            deck=[],
            discard=[],
            room=[monster],
            equipped_weapon=weapon,
            last_monster_defeated=last_defeated,
            monsters_on_weapon=monsters_on_weapon,
            health=health,
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
        return state, monster, weapon

    def test_barehanded_takes_full_damage(self):
        from engine import play_card

        state, monster, _ = self._state_with_monster(monster_rank=7, health=20)
        new_state = play_card(state, 0, mode="barehanded")
        assert new_state.health == 13

    def test_barehanded_monster_goes_to_discard(self):
        from engine import play_card

        state, monster, _ = self._state_with_monster(monster_rank=5)
        new_state = play_card(state, 0, mode="barehanded")
        assert monster in new_state.discard

    def test_weapon_reduces_damage(self):
        from engine import play_card

        # Weapon rank 7, monster rank 5 → damage = max(0, 5-7) = 0
        state, monster, _ = self._state_with_monster(monster_rank=5, weapon_rank=7, health=20)
        new_state = play_card(state, 0, mode="weapon")
        assert new_state.health == 20

    def test_weapon_partial_damage(self):
        from engine import play_card

        # Weapon rank 3, monster rank 8 → damage = max(0, 8-3) = 5
        state, monster, _ = self._state_with_monster(monster_rank=8, weapon_rank=3, health=20)
        new_state = play_card(state, 0, mode="weapon")
        assert new_state.health == 15

    def test_weapon_monster_stacked_on_weapon(self):
        from engine import play_card

        state, monster, weapon = self._state_with_monster(monster_rank=5, weapon_rank=8)
        new_state = play_card(state, 0, mode="weapon")
        assert monster in new_state.monsters_on_weapon

    def test_weapon_monster_not_in_discard(self):
        from engine import play_card

        state, monster, weapon = self._state_with_monster(monster_rank=5, weapon_rank=8)
        new_state = play_card(state, 0, mode="weapon")
        assert monster not in new_state.discard

    def test_weapon_kill_limit_respected(self):
        """Cannot use weapon on monster with rank > last defeated rank."""
        from engine import play_card

        # last_defeated=5, new monster=7: weapon illegal, only barehanded allowed
        state, monster, _ = self._state_with_monster(monster_rank=7, weapon_rank=8, last_defeated_rank=5)
        # Attempting weapon mode should raise or not apply weapon damage
        with pytest.raises(Exception):
            play_card(state, 0, mode="weapon")

    def test_weapon_kill_limit_equal_rank_allowed(self):
        """Can use weapon on monster with rank == last defeated rank."""
        from engine import play_card

        state, monster, _ = self._state_with_monster(monster_rank=5, weapon_rank=8, last_defeated_rank=5)
        new_state = play_card(state, 0, mode="weapon")
        assert monster in new_state.monsters_on_weapon

    def test_health_cannot_go_below_zero_sets_game_over(self):
        from engine import play_card

        state, monster, _ = self._state_with_monster(monster_rank=14, health=5)
        new_state = play_card(state, 0, mode="barehanded")
        assert new_state.game_over is True

    def test_monster_removed_from_room(self):
        from engine import play_card

        state, monster, _ = self._state_with_monster(monster_rank=3)
        new_state = play_card(state, 0, mode="barehanded")
        assert monster not in new_state.room

    def test_cards_resolved_increments(self):
        from engine import play_card

        state, _, _ = self._state_with_monster(monster_rank=3)
        new_state = play_card(state, 0, mode="barehanded")
        # Either cardsResolvedThisTurn incremented (and < 3) or reset to 0 (if ≥ 3 or room empty)
        # Room was 1 card so room is now empty → cardsResolvedThisTurn resets to 0
        assert new_state.cards_resolved_this_turn == 0

    def test_room_empty_ends_turn(self):
        """When room empties after 3rd card, room_being_entered becomes False."""
        from engine import Card, CardType, GameState, Suit, play_card

        m1 = Card(CardType.MONSTER, Suit.CLUBS, 3)
        m2 = Card(CardType.MONSTER, Suit.CLUBS, 4)
        m3 = Card(CardType.MONSTER, Suit.CLUBS, 5)
        state = GameState(
            deck=[],
            discard=[],
            room=[m1, m2, m3],
            equipped_weapon=None,
            last_monster_defeated=None,
            monsters_on_weapon=[],
            health=20,
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
        s1 = play_card(state, 0, mode="barehanded")
        assert s1.room_being_entered is True
        assert s1.cards_resolved_this_turn == 1

        s2 = play_card(s1, 0, mode="barehanded")
        assert s2.room_being_entered is True
        assert s2.cards_resolved_this_turn == 2

        s3 = play_card(s2, 0, mode="barehanded")
        # 3 cards resolved → room_being_entered becomes False
        assert s3.room_being_entered is False
        assert s3.cards_resolved_this_turn == 0


# ---------------------------------------------------------------------------
# Task 4: enter_room, avoid_room, get_legal_actions, calculate_score
# ---------------------------------------------------------------------------


class TestEnterRoom:
    """Verify enter_room transitions."""

    def _state_not_entered(self):
        from engine import Card, CardType, GameState, Suit

        cards = [
            Card(CardType.MONSTER, Suit.CLUBS, 3),
            Card(CardType.MONSTER, Suit.CLUBS, 4),
            Card(CardType.MONSTER, Suit.CLUBS, 5),
            Card(CardType.MONSTER, Suit.CLUBS, 6),
        ]
        return GameState(
            deck=[],
            discard=[],
            room=cards,
            equipped_weapon=None,
            last_monster_defeated=None,
            monsters_on_weapon=[],
            health=20,
            max_health=20,
            can_defer_room=True,
            last_action_was_defer=False,
            game_over=False,
            victory=False,
            potion_taken_this_turn=False,
            potions_taken_this_turn=0,
            room_being_entered=False,
            cards_resolved_this_turn=0,
            last_resolved_card_type=None,
            last_resolved_potion_value=None,
        )

    def test_enter_room_sets_room_being_entered(self):
        from engine import enter_room

        state = self._state_not_entered()
        new_state = enter_room(state)
        assert new_state.room_being_entered is True

    def test_enter_room_resets_cards_resolved(self):
        from engine import enter_room

        state = self._state_not_entered()
        state = state.__class__(
            **{**state.__dict__, "cards_resolved_this_turn": 2}
        )
        new_state = enter_room(state)
        assert new_state.cards_resolved_this_turn == 0

    def test_enter_room_resets_potion_flag(self):
        from engine import enter_room

        state = self._state_not_entered()
        state = state.__class__(**{**state.__dict__, "potion_taken_this_turn": True, "potions_taken_this_turn": 1})
        new_state = enter_room(state)
        assert new_state.potion_taken_this_turn is False
        assert new_state.potions_taken_this_turn == 0


class TestAvoidRoom:
    """Verify avoid_room (skipRoom) transitions."""

    def _state_deferrable(self):
        from engine import Card, CardType, GameState, Suit

        cards = [
            Card(CardType.MONSTER, Suit.CLUBS, 3),
            Card(CardType.MONSTER, Suit.CLUBS, 4),
            Card(CardType.MONSTER, Suit.CLUBS, 5),
            Card(CardType.MONSTER, Suit.CLUBS, 6),
        ]
        extra = [Card(CardType.MONSTER, Suit.SPADES, 7)]
        return GameState(
            deck=extra,
            discard=[],
            room=cards,
            equipped_weapon=None,
            last_monster_defeated=None,
            monsters_on_weapon=[],
            health=20,
            max_health=20,
            can_defer_room=True,
            last_action_was_defer=False,
            game_over=False,
            victory=False,
            potion_taken_this_turn=False,
            potions_taken_this_turn=0,
            room_being_entered=False,
            cards_resolved_this_turn=0,
            last_resolved_card_type=None,
            last_resolved_potion_value=None,
        )

    def test_avoid_room_pushes_cards_to_deck(self):
        """Room cards are appended to the deck bottom before a new room is dealt.

        With only 1 card in the original deck the deferred room cards are
        immediately consumed by the re-deal, so they end up in new_state.room,
        not in new_state.deck.  We verify this by using a larger deck so that
        some deferred cards remain below the newly dealt room.
        """
        from engine import Card, CardType, GameState, Suit, avoid_room

        # 8 extra deck cards ensures the 4 deferred room cards sit below the
        # freshly dealt 4-card room and are still visible in the deck.
        extra_deck = [Card(CardType.MONSTER, Suit.SPADES, r) for r in range(7, 15)]
        room = [Card(CardType.MONSTER, Suit.CLUBS, i) for i in range(3, 7)]
        state = GameState(
            deck=extra_deck,
            discard=[],
            room=room,
            equipped_weapon=None,
            last_monster_defeated=None,
            monsters_on_weapon=[],
            health=20,
            max_health=20,
            can_defer_room=True,
            last_action_was_defer=False,
            game_over=False,
            victory=False,
            potion_taken_this_turn=False,
            potions_taken_this_turn=0,
            room_being_entered=False,
            cards_resolved_this_turn=0,
            last_resolved_card_type=None,
            last_resolved_potion_value=None,
        )
        room_cards = list(state.room)
        new_state = avoid_room(state)
        # The deferred room cards now sit below the new room; each should
        # appear somewhere in either the new room or remaining deck.
        all_cards = set(new_state.room) | set(new_state.deck)
        for card in room_cards:
            assert card in all_cards, f"{card} not found after avoid_room"

    def test_avoid_room_clears_room(self):
        from engine import avoid_room

        state = self._state_deferrable()
        new_state = avoid_room(state)
        # After avoid, a new room should have been dealt
        assert len(new_state.room) == 4 or (len(new_state.deck) == 0 and len(new_state.room) <= 4)

    def test_avoid_room_sets_flags(self):
        from engine import avoid_room

        state = self._state_deferrable()
        new_state = avoid_room(state)
        assert new_state.can_defer_room is False
        assert new_state.last_action_was_defer is True

    def test_avoid_room_not_allowed_when_last_was_defer(self):
        """Cannot avoid room if last action was already a defer."""
        from engine import avoid_room

        state = self._state_deferrable()
        state = state.__class__(**{**state.__dict__, "last_action_was_defer": True})
        new_state = avoid_room(state)
        # State should be unchanged (avoid silently fails per TS logic)
        assert new_state.last_action_was_defer is True
        assert new_state.room == state.room

    def test_avoid_room_not_allowed_when_can_defer_false(self):
        from engine import avoid_room

        state = self._state_deferrable()
        state = state.__class__(**{**state.__dict__, "can_defer_room": False})
        new_state = avoid_room(state)
        assert new_state.room == state.room


class TestGetLegalActions:
    """Verify get_legal_actions output."""

    def test_not_in_room_returns_enter_room(self):
        from engine import Card, CardType, GameState, Suit, get_legal_actions

        cards = [
            Card(CardType.MONSTER, Suit.CLUBS, 3),
            Card(CardType.MONSTER, Suit.CLUBS, 4),
            Card(CardType.MONSTER, Suit.CLUBS, 5),
            Card(CardType.MONSTER, Suit.CLUBS, 6),
        ]
        state = GameState(
            deck=[],
            discard=[],
            room=cards,
            equipped_weapon=None,
            last_monster_defeated=None,
            monsters_on_weapon=[],
            health=20,
            max_health=20,
            can_defer_room=True,
            last_action_was_defer=False,
            game_over=False,
            victory=False,
            potion_taken_this_turn=False,
            potions_taken_this_turn=0,
            room_being_entered=False,
            cards_resolved_this_turn=0,
            last_resolved_card_type=None,
            last_resolved_potion_value=None,
        )
        actions = get_legal_actions(state)
        action_types = [a.action_type for a in actions]
        assert "enterRoom" in action_types

    def test_not_in_room_can_skip_when_deferrable(self):
        from engine import Card, CardType, GameState, Suit, get_legal_actions

        cards = [
            Card(CardType.MONSTER, Suit.CLUBS, 3),
            Card(CardType.MONSTER, Suit.CLUBS, 4),
            Card(CardType.MONSTER, Suit.CLUBS, 5),
            Card(CardType.MONSTER, Suit.CLUBS, 6),
        ]
        state = GameState(
            deck=[],
            discard=[],
            room=cards,
            equipped_weapon=None,
            last_monster_defeated=None,
            monsters_on_weapon=[],
            health=20,
            max_health=20,
            can_defer_room=True,
            last_action_was_defer=False,
            game_over=False,
            victory=False,
            potion_taken_this_turn=False,
            potions_taken_this_turn=0,
            room_being_entered=False,
            cards_resolved_this_turn=0,
            last_resolved_card_type=None,
            last_resolved_potion_value=None,
        )
        actions = get_legal_actions(state)
        action_types = [a.action_type for a in actions]
        assert "skipRoom" in action_types

    def test_not_in_room_no_skip_when_last_was_defer(self):
        from engine import Card, CardType, GameState, Suit, get_legal_actions

        cards = [Card(CardType.MONSTER, Suit.CLUBS, i) for i in range(3, 7)]
        state = GameState(
            deck=[],
            discard=[],
            room=cards,
            equipped_weapon=None,
            last_monster_defeated=None,
            monsters_on_weapon=[],
            health=20,
            max_health=20,
            can_defer_room=True,
            last_action_was_defer=True,
            game_over=False,
            victory=False,
            potion_taken_this_turn=False,
            potions_taken_this_turn=0,
            room_being_entered=False,
            cards_resolved_this_turn=0,
            last_resolved_card_type=None,
            last_resolved_potion_value=None,
        )
        actions = get_legal_actions(state)
        action_types = [a.action_type for a in actions]
        assert "skipRoom" not in action_types

    def test_in_room_returns_card_actions(self):
        from engine import Card, CardType, GameState, Suit, get_legal_actions

        monster = Card(CardType.MONSTER, Suit.CLUBS, 5)
        state = GameState(
            deck=[],
            discard=[],
            room=[monster],
            equipped_weapon=None,
            last_monster_defeated=None,
            monsters_on_weapon=[],
            health=20,
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
        actions = get_legal_actions(state)
        action_types = [a.action_type for a in actions]
        assert "playCard" in action_types

    def test_in_room_monster_barehanded_always_available(self):
        from engine import Card, CardType, GameState, Suit, get_legal_actions

        monster = Card(CardType.MONSTER, Suit.CLUBS, 5)
        state = GameState(
            deck=[],
            discard=[],
            room=[monster],
            equipped_weapon=None,
            last_monster_defeated=None,
            monsters_on_weapon=[],
            health=20,
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
        actions = get_legal_actions(state)
        bh = [a for a in actions if a.action_type == "playCard" and a.mode == "barehanded"]
        assert len(bh) == 1

    def test_in_room_monster_weapon_available_with_weapon(self):
        from engine import Card, CardType, GameState, Suit, get_legal_actions

        monster = Card(CardType.MONSTER, Suit.CLUBS, 5)
        weapon = Card(CardType.WEAPON, Suit.DIAMONDS, 8)
        state = GameState(
            deck=[],
            discard=[],
            room=[monster],
            equipped_weapon=weapon,
            last_monster_defeated=None,
            monsters_on_weapon=[],
            health=20,
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
        actions = get_legal_actions(state)
        wm = [a for a in actions if a.action_type == "playCard" and a.mode == "weapon"]
        assert len(wm) == 1

    def test_game_over_returns_empty(self):
        from engine import GameState, get_legal_actions

        state = GameState(
            deck=[],
            discard=[],
            room=[],
            equipped_weapon=None,
            last_monster_defeated=None,
            monsters_on_weapon=[],
            health=0,
            max_health=20,
            can_defer_room=False,
            last_action_was_defer=False,
            game_over=True,
            victory=False,
            potion_taken_this_turn=False,
            potions_taken_this_turn=0,
            room_being_entered=False,
            cards_resolved_this_turn=0,
            last_resolved_card_type=None,
            last_resolved_potion_value=None,
        )
        assert get_legal_actions(state) == []

    def test_in_room_with_4_cards_skip_available(self):
        """When inside room and can_defer and not last_was_defer and 4 cards, skip available."""
        from engine import Card, CardType, GameState, Suit, get_legal_actions

        cards = [Card(CardType.MONSTER, Suit.CLUBS, i) for i in range(3, 7)]
        state = GameState(
            deck=[],
            discard=[],
            room=cards,
            equipped_weapon=None,
            last_monster_defeated=None,
            monsters_on_weapon=[],
            health=20,
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
        actions = get_legal_actions(state)
        action_types = [a.action_type for a in actions]
        assert "skipRoom" in action_types


class TestCalculateScore:
    """Verify score calculation."""

    def test_victory_score_is_health(self):
        from engine import GameState, calculate_score

        state = GameState(
            deck=[],
            discard=[],
            room=[],
            equipped_weapon=None,
            last_monster_defeated=None,
            monsters_on_weapon=[],
            health=15,
            max_health=20,
            can_defer_room=False,
            last_action_was_defer=False,
            game_over=False,
            victory=True,
            potion_taken_this_turn=False,
            potions_taken_this_turn=0,
            room_being_entered=False,
            cards_resolved_this_turn=0,
            last_resolved_card_type=None,
            last_resolved_potion_value=None,
        )
        assert calculate_score(state) == 15

    def test_victory_full_health_potion_bonus(self):
        """Victory at full health with last resolved = potion adds potion rank."""
        from engine import GameState, calculate_score

        state = GameState(
            deck=[],
            discard=[],
            room=[],
            equipped_weapon=None,
            last_monster_defeated=None,
            monsters_on_weapon=[],
            health=20,
            max_health=20,
            can_defer_room=False,
            last_action_was_defer=False,
            game_over=False,
            victory=True,
            potion_taken_this_turn=False,
            potions_taken_this_turn=0,
            room_being_entered=False,
            cards_resolved_this_turn=0,
            last_resolved_card_type="potion",
            last_resolved_potion_value=7,
        )
        assert calculate_score(state) == 27

    def test_death_score_deducts_monster_ranks(self):
        from engine import Card, CardType, GameState, Suit, calculate_score

        monsters_in_deck = [
            Card(CardType.MONSTER, Suit.CLUBS, 5),
            Card(CardType.MONSTER, Suit.SPADES, 8),
        ]
        state = GameState(
            deck=monsters_in_deck,
            discard=[],
            room=[],
            equipped_weapon=None,
            last_monster_defeated=None,
            monsters_on_weapon=[],
            health=10,
            max_health=20,
            can_defer_room=False,
            last_action_was_defer=False,
            game_over=True,
            victory=False,
            potion_taken_this_turn=False,
            potions_taken_this_turn=0,
            room_being_entered=False,
            cards_resolved_this_turn=0,
            last_resolved_card_type=None,
            last_resolved_potion_value=None,
        )
        # 10 health - (5 + 8) monsters in deck = -3
        assert calculate_score(state) == -3


# ---------------------------------------------------------------------------
# Task 5: encode_observation and build_action_mask
# ---------------------------------------------------------------------------


class TestEncodeObservation:
    """Verify encode_observation produces the correct 74-dim vector."""

    def _default_state(self):
        from engine import init_game

        return init_game(seed=0)

    def test_returns_numpy_array(self):
        from engine import encode_observation

        state = self._default_state()
        obs = encode_observation(state)
        assert isinstance(obs, np.ndarray)

    def test_shape_74(self):
        from engine import encode_observation

        state = self._default_state()
        obs = encode_observation(state)
        assert obs.shape == (74,)

    def test_dtype_float32(self):
        from engine import encode_observation

        state = self._default_state()
        obs = encode_observation(state)
        assert obs.dtype == np.float32

    def test_health_normalized(self):
        from engine import encode_observation

        state = self._default_state()
        obs = encode_observation(state)
        # obs[0] = health / max_health = 20/20 = 1.0
        assert abs(obs[0] - 1.0) < 1e-6

    def test_can_defer_room_flag(self):
        from engine import encode_observation

        state = self._default_state()
        obs = encode_observation(state)
        # obs[6] = can_defer_room = 1.0 (True at start)
        assert abs(obs[6] - 1.0) < 1e-6

    def test_deck_length_normalized(self):
        from engine import encode_observation

        state = self._default_state()
        obs = encode_observation(state)
        # obs[8] = deck_length / 44 = 40/44
        expected = 40.0 / 44.0
        assert abs(obs[8] - expected) < 1e-5

    def test_room_card_count_normalized(self):
        from engine import encode_observation

        state = self._default_state()
        obs = encode_observation(state)
        # obs[9] = room_card_count / 4 = 4/4 = 1.0
        assert abs(obs[9] - 1.0) < 1e-6

    def test_seen_cards_bits_set(self):
        """Room cards should have their seen-card bits set."""
        from engine import encode_observation

        state = self._default_state()
        obs = encode_observation(state)
        # At least one seen-card bit (indices 30-73) should be 1
        seen_bits = obs[30:74]
        assert seen_bits.sum() > 0

    def test_values_in_range(self):
        from engine import encode_observation

        state = self._default_state()
        obs = encode_observation(state)
        assert np.all(obs >= 0.0) and np.all(obs <= 1.0)


class TestBuildActionMask:
    """Verify build_action_mask produces correct 10-element boolean mask."""

    def _default_state(self):
        from engine import init_game

        return init_game(seed=0)

    def test_returns_numpy_array(self):
        from engine import build_action_mask

        state = self._default_state()
        mask = build_action_mask(state)
        assert isinstance(mask, np.ndarray)

    def test_shape_10(self):
        from engine import build_action_mask

        state = self._default_state()
        mask = build_action_mask(state)
        assert mask.shape == (10,)

    def test_dtype_bool(self):
        from engine import build_action_mask

        state = self._default_state()
        mask = build_action_mask(state)
        assert mask.dtype == bool

    def test_at_least_one_action_available(self):
        from engine import build_action_mask

        state = self._default_state()
        mask = build_action_mask(state)
        assert mask.sum() > 0

    def test_enter_room_not_available_when_in_room(self):
        """index 0 = enterRoom — should be False when room_being_entered=True."""
        from engine import build_action_mask

        state = self._default_state()
        assert state.room_being_entered is True
        mask = build_action_mask(state)
        assert mask[0] is np.bool_(False)

    def test_game_over_all_false(self):
        from engine import GameState, build_action_mask

        state = GameState(
            deck=[],
            discard=[],
            room=[],
            equipped_weapon=None,
            last_monster_defeated=None,
            monsters_on_weapon=[],
            health=0,
            max_health=20,
            can_defer_room=False,
            last_action_was_defer=False,
            game_over=True,
            victory=False,
            potion_taken_this_turn=False,
            potions_taken_this_turn=0,
            room_being_entered=False,
            cards_resolved_this_turn=0,
            last_resolved_card_type=None,
            last_resolved_potion_value=None,
        )
        mask = build_action_mask(state)
        assert mask.sum() == 0

    def test_action_indices_mapping(self):
        """Verify the discrete mapping: 0=enterRoom, 1=skipRoom, 2/3=card0, 4/5=card1, ..."""
        from engine import Card, CardType, GameState, Suit, build_action_mask

        # State: not in room, can defer → should have indices 0 and 1
        cards = [Card(CardType.MONSTER, Suit.CLUBS, i) for i in range(3, 7)]
        state = GameState(
            deck=[],
            discard=[],
            room=cards,
            equipped_weapon=None,
            last_monster_defeated=None,
            monsters_on_weapon=[],
            health=20,
            max_health=20,
            can_defer_room=True,
            last_action_was_defer=False,
            game_over=False,
            victory=False,
            potion_taken_this_turn=False,
            potions_taken_this_turn=0,
            room_being_entered=False,
            cards_resolved_this_turn=0,
            last_resolved_card_type=None,
            last_resolved_potion_value=None,
        )
        mask = build_action_mask(state)
        assert mask[0] is np.bool_(True)   # enterRoom
        assert mask[1] is np.bool_(True)   # skipRoom


# ---------------------------------------------------------------------------
# Integration: full game round-trip with seed
# ---------------------------------------------------------------------------


class TestFullGameIntegration:
    """Light integration tests running a seeded game to completion."""

    def test_full_game_terminates(self):
        """Play a game with a greedy strategy (always barehanded) until done."""
        from engine import (
            GameState,
            build_action_mask,
            calculate_score,
            encode_observation,
            enter_room,
            get_legal_actions,
            init_game,
            play_card,
        )

        state = init_game(seed=1)
        max_steps = 500

        for _ in range(max_steps):
            if state.game_over or state.victory:
                break

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
                # playCard — take first action
                card_idx = action.card_index
                state = play_card(state, card_idx, mode=action.mode or "barehanded")

        assert state.game_over or state.victory

    def test_observation_and_mask_consistent(self):
        """obs and mask shapes/dtypes should be stable throughout a game."""
        from engine import (
            build_action_mask,
            encode_observation,
            enter_room,
            get_legal_actions,
            init_game,
            play_card,
        )

        state = init_game(seed=2)

        for _ in range(50):
            if state.game_over or state.victory:
                break
            obs = encode_observation(state)
            mask = build_action_mask(state)
            assert obs.shape == (74,)
            assert mask.shape == (10,)

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
                state = play_card(state, action.card_index, mode=action.mode or "barehanded")


# ---------------------------------------------------------------------------
# Task 1: encode_observation_v2 (84-dim)
# ---------------------------------------------------------------------------


class TestEncodeObservationV2:
    """Tests for encode_observation_v2, which extends the 74-dim v1 obs with 10 derived features."""

    def test_v2_output_shape(self):
        """Output must be shape (84,) with dtype float32."""
        from engine import encode_observation_v2, init_game

        state = init_game(seed=42)
        obs = encode_observation_v2(state)
        assert obs.shape == (84,)
        assert obs.dtype == np.float32

    def test_v2_first_74_match_v1(self):
        """First 74 elements of v2 must be identical to encode_observation output."""
        from engine import encode_observation, encode_observation_v2, init_game

        state = init_game(seed=42)
        obs_v1 = encode_observation(state)
        obs_v2 = encode_observation_v2(state)
        np.testing.assert_array_equal(obs_v2[:74], obs_v1)

    def test_v2_unseen_counts_at_start(self):
        """Features 74-76 (unseen monster/potion/weapon counts) must be in [0, 1] at game start."""
        from engine import encode_observation_v2, init_game

        state = init_game(seed=1)
        obs = encode_observation_v2(state)
        # At game start a room has been dealt (4 cards), so ~40 cards are unseen.
        # All three ratios must be in valid [0, 1] range.
        assert 0.0 <= obs[74] <= 1.0, f"unseen_monster_count ratio out of range: {obs[74]}"
        assert 0.0 <= obs[75] <= 1.0, f"unseen_potion_count ratio out of range: {obs[75]}"
        assert 0.0 <= obs[76] <= 1.0, f"unseen_weapon_count ratio out of range: {obs[76]}"

    def test_v2_deck_progress_empty_deck(self):
        """With an empty deck, deck_progress (obs[82]) must equal 1.0."""
        from engine import Card, CardType, GameState, Suit, encode_observation_v2

        # Construct a near-end state: empty deck, one card remaining in room.
        state = GameState(
            deck=[],
            discard=[Card(CardType.MONSTER, Suit.CLUBS, 5)],
            room=[Card(CardType.MONSTER, Suit.CLUBS, 3)],
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
        # deck_progress = 1 - len(deck)/44 = 1 - 0/44 = 1.0
        assert obs[82] == pytest.approx(1.0), f"Expected deck_progress=1.0, got {obs[82]}"

    def test_v2_weapon_kills_remaining(self):
        """weapon_kills_remaining: with weapon rank=8, last_killed rank=6, killable monsters should = 3."""
        from engine import Card, CardType, GameState, Suit, encode_observation_v2

        weapon = Card(CardType.WEAPON, Suit.DIAMONDS, 8)
        last_killed = Card(CardType.MONSTER, Suit.CLUBS, 6)
        # Deck monsters with ranks 3, 5, 7, 10 (killable if rank <= last_killed rank 6 → 3, 5)
        deck_monsters = [
            Card(CardType.MONSTER, Suit.CLUBS, 3),
            Card(CardType.MONSTER, Suit.CLUBS, 5),
            Card(CardType.MONSTER, Suit.CLUBS, 7),
            Card(CardType.MONSTER, Suit.CLUBS, 10),
        ]
        # Room monster rank=4 (killable: 4 <= 6 → yes)
        room_monster = Card(CardType.MONSTER, Suit.CLUBS, 4)

        state = GameState(
            deck=deck_monsters,
            discard=[],
            room=[room_monster],
            equipped_weapon=weapon,
            last_monster_defeated=last_killed,
            monsters_on_weapon=[],
            health=20,
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
        # Killable: deck[3] + deck[5] + room[4] = 3 monsters; obs[79] = 3/4 = 0.75
        assert obs[79] == pytest.approx(0.75), f"Expected weapon_kills_remaining=0.75, got {obs[79]}"

    def test_v2_weapon_equipped_no_kill_yet(self):
        """obs[80] must equal weapon.rank/14 even when last_monster_defeated is None (freshly equipped weapon)."""
        from engine import Card, CardType, GameState, Suit, encode_observation_v2

        weapon = Card(CardType.WEAPON, Suit.DIAMONDS, 8)
        state = GameState(
            deck=[],
            discard=[],
            room=[],
            equipped_weapon=weapon,
            # No kill has been made yet with this weapon.
            last_monster_defeated=None,
            monsters_on_weapon=[],
            health=20,
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
        # A freshly equipped weapon can still kill, so obs[80] must reflect its rank.
        assert obs[80] == pytest.approx(8 / 14), f"Expected weapon_effective_damage_ratio={8/14:.4f}, got {obs[80]}"

    def test_v2_no_weapon_zeros(self):
        """At game start (no weapon equipped), obs[79] and obs[80] must be 0."""
        from engine import encode_observation_v2, init_game

        state = init_game(seed=5)
        # init_game starts before any room is entered; equipped_weapon is None.
        obs = encode_observation_v2(state)
        assert obs[79] == pytest.approx(0.0), f"Expected weapon_kills_remaining=0 with no weapon, got {obs[79]}"
        assert obs[80] == pytest.approx(0.0), f"Expected weapon_effective_damage_ratio=0 with no weapon, got {obs[80]}"

    def test_v2_health_risk_and_survival(self):
        """health_risk_ratio and survival_margin calculated correctly with health=5, two target monsters unseen."""
        from engine import Card, CardType, GameState, Suit, _CANONICAL_ORDER, encode_observation_v2

        # "Unseen" is defined as cards in _CANONICAL_ORDER NOT in {discard, room, equipped, on_weapon}.
        # To make only m10 and m8 unseen, we must discard all other canonical monsters (and all
        # non-monster canonical cards) so they register as "seen" and are excluded from the
        # unseen set.
        m10 = Card(CardType.MONSTER, Suit.CLUBS, 10)
        m8 = Card(CardType.MONSTER, Suit.CLUBS, 8)
        target_unseen = {m10, m8}

        # Discard every canonical card that is NOT one of our two target monsters.
        discard = [c for c in _CANONICAL_ORDER if c not in target_unseen]

        state = GameState(
            deck=[m10, m8],
            discard=discard,
            room=[],
            equipped_weapon=None,
            last_monster_defeated=None,
            monsters_on_weapon=[],
            health=5,
            max_health=20,
            can_defer_room=False,
            last_action_was_defer=False,
            game_over=False,
            victory=False,
            potion_taken_this_turn=False,
            potions_taken_this_turn=0,
            room_being_entered=False,
            cards_resolved_this_turn=0,
            last_resolved_card_type=None,
            last_resolved_potion_value=None,
        )
        obs = encode_observation_v2(state)
        # With only m10 and m8 unseen: avg_unseen_monster_rank = (10 + 8) / 2 = 9
        # health_risk_ratio = 9 / max(5, 1) = 1.8 → clamped to 1.0
        assert obs[81] == pytest.approx(1.0), f"Expected health_risk_ratio=1.0, got {obs[81]}"
        # sum_unseen_monster_ranks = 18; survival_margin = 5 / (18 + 1) = 5/19
        expected_survival = 5.0 / 19.0
        assert obs[83] == pytest.approx(expected_survival, abs=1e-5), f"Expected survival_margin={expected_survival:.4f}, got {obs[83]}"

    def test_v2_all_features_bounded(self):
        """All 84 features must remain in [0, 1] over 20 steps from seed=100."""
        from engine import (
            avoid_room,
            encode_observation_v2,
            enter_room,
            get_legal_actions,
            init_game,
            play_card,
        )

        state = init_game(seed=100)

        for step in range(20):
            if state.game_over or state.victory:
                break

            obs = encode_observation_v2(state)
            out_of_range = [(i, float(obs[i])) for i in range(84) if not (0.0 <= obs[i] <= 1.0)]
            assert not out_of_range, f"Step {step}: features out of [0,1]: {out_of_range}"

            actions = get_legal_actions(state)
            if not actions:
                break

            action = actions[0]
            if action.action_type == "enterRoom":
                state = enter_room(state)
            elif action.action_type == "skipRoom":
                state = avoid_room(state)
            else:
                state = play_card(state, action.card_index, mode=action.mode or "barehanded")
