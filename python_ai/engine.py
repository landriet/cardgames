"""Pure-Python Scoundrel game engine.

Replicates the TypeScript engine from src/engine-lib/src/index.ts and the
observation/action-mask encoding from src/engine-lib/worker/engineWorkerService.ts.

All bit-level arithmetic matches the JavaScript behaviour exactly:
  - JS `x | 0`    → signed 32-bit truncation  → ctypes.c_int32(x).value
  - JS `x >>> 0`  → unsigned 32-bit            → x & 0xFFFFFFFF
  - JS Math.imul  → signed 32-bit multiply     → ctypes.c_int32(a * b).value
"""

from __future__ import annotations

import ctypes
import json
import random
from copy import deepcopy
from dataclasses import dataclass, field
from enum import Enum
from functools import lru_cache
from itertools import chain
from pathlib import Path
from typing import Any, Callable, List, Mapping, Optional


# ---------------------------------------------------------------------------
# Enumerations
# ---------------------------------------------------------------------------


class CardType(Enum):
    """Maps to the TS union type "monster" | "weapon" | "potion"."""

    MONSTER = "monster"
    WEAPON = "weapon"
    POTION = "potion"


class Suit(Enum):
    """Maps to the TS union type "hearts" | "diamonds" | "clubs" | "spades"."""

    HEARTS = "hearts"
    DIAMONDS = "diamonds"
    CLUBS = "clubs"
    SPADES = "spades"


# ---------------------------------------------------------------------------
# Card dataclass
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class Card:
    """Immutable representation of a single dungeon card.

    Frozen to prevent accidental mutation; equality/hashing is by value so two
    cards with the same type/suit/rank compare equal, mirroring TS behaviour.
    """

    card_type: CardType
    suit: Suit
    rank: int  # 2–14


DeckVariant = str
_REGISTRY_PATH = Path(__file__).resolve().parents[1] / "src" / "engine-lib" / "src" / "game-variants.json"
_RULE_NAMES = {
    "startingHealth",
    "maxHealth",
    "potionsPerRoom",
    "canSkipRooms",
    "canSkipConsecutive",
    "weaponKillLimit",
}


def _validate_card_record(record: Any, where: str) -> dict[str, Any]:
    if not isinstance(record, dict):
        raise ValueError(f"Invalid card record at {where}: expected an object.")
    if set(record) != {"type", "suit", "rank"}:
        raise ValueError(f"Invalid card record at {where}: expected type, suit, and rank.")
    try:
        CardType(record["type"])
        Suit(record["suit"])
    except (TypeError, ValueError) as exc:
        raise ValueError(f"Invalid card type or suit at {where}.") from exc
    rank = record["rank"]
    if isinstance(rank, bool) or not isinstance(rank, int) or not 2 <= rank <= 14:
        raise ValueError(f"Invalid card rank at {where}: expected an integer from 2 through 14.")
    return {"type": record["type"], "suit": record["suit"], "rank": rank}


def _validate_rule_values(values: Any, where: str, *, require_all: bool = False) -> dict[str, Any]:
    if not isinstance(values, dict):
        raise ValueError(f"Invalid rules at {where}: expected an object.")
    unknown = set(values) - _RULE_NAMES
    if unknown:
        raise ValueError(f"Invalid rules at {where}: unknown setting(s) {sorted(unknown)}.")
    if require_all and set(values) != _RULE_NAMES:
        missing = sorted(_RULE_NAMES - set(values))
        raise ValueError(f"Invalid rules at {where}: missing setting(s) {missing}.")

    result = dict(values)
    for name in ("startingHealth", "maxHealth", "potionsPerRoom"):
        if name in result:
            value = result[name]
            minimum = 1 if name in ("startingHealth", "maxHealth") else 0
            if isinstance(value, bool) or not isinstance(value, int) or value < minimum:
                raise ValueError(f"Invalid rule {name} at {where}: expected an integer >= {minimum}.")
    for name in ("canSkipRooms", "canSkipConsecutive", "weaponKillLimit"):
        if name in result and not isinstance(result[name], bool):
            raise ValueError(f"Invalid rule {name} at {where}: expected a boolean.")
    return result


def _load_variant_registry() -> dict[str, Any]:
    try:
        with _REGISTRY_PATH.open(encoding="utf-8") as registry_file:
            registry = json.load(registry_file)
    except (OSError, json.JSONDecodeError) as exc:
        raise RuntimeError(f"Could not load game variant registry at {_REGISTRY_PATH}.") from exc

    if (
        not isinstance(registry, dict)
        or isinstance(registry.get("schemaVersion"), bool)
        or registry.get("schemaVersion") != 1
    ):
        raise ValueError("Invalid game variant registry: schemaVersion must be 1.")
    variants = registry.get("variants")
    if not isinstance(variants, dict) or not variants:
        raise ValueError("Invalid game variant registry: variants must be a non-empty object.")
    default_variant = registry.get("defaultVariant")
    if not isinstance(default_variant, str) or default_variant not in variants:
        raise ValueError("Invalid game variant registry: defaultVariant must name a registered variant.")

    registry["defaultRules"] = _validate_rule_values(registry.get("defaultRules"), "defaultRules", require_all=True)
    if registry["defaultRules"]["startingHealth"] > registry["defaultRules"]["maxHealth"]:
        raise ValueError("Invalid default rules: startingHealth cannot exceed maxHealth.")
    base_deck = registry.get("baseDeck")
    if not isinstance(base_deck, list) or not base_deck:
        raise ValueError("Invalid game variant registry: baseDeck must be a non-empty array.")
    registry["baseDeck"] = [_validate_card_record(card, f"baseDeck[{idx}]") for idx, card in enumerate(base_deck)]
    base_cards = {_card_identity(card) for card in registry["baseDeck"]}
    if len(base_cards) != len(registry["baseDeck"]):
        raise ValueError("Invalid game variant registry: baseDeck contains duplicate card identities.")

    normalized_variants: dict[str, dict[str, Any]] = {}
    for variant_id, record in variants.items():
        if not isinstance(variant_id, str) or not variant_id:
            raise ValueError("Invalid game variant registry: variant IDs must be non-empty strings.")
        if not isinstance(record, dict) or not isinstance(record.get("name"), str):
            raise ValueError(f"Invalid game variant {variant_id!r}: expected an object with a name.")
        added = record.get("addedCards")
        removed = record.get("removedCards")
        if not isinstance(added, list) or not isinstance(removed, list):
            raise ValueError(f"Invalid game variant {variant_id!r}: addedCards and removedCards must be arrays.")
        normalized_added = [_validate_card_record(card, f"variants.{variant_id}.addedCards[{idx}]") for idx, card in enumerate(added)]
        normalized_removed = [_validate_card_record(card, f"variants.{variant_id}.removedCards[{idx}]") for idx, card in enumerate(removed)]
        removed_ids = [_card_identity(card) for card in normalized_removed]
        if len(set(removed_ids)) != len(removed_ids):
            raise ValueError(f"Invalid game variant {variant_id!r}: removedCards contains duplicate identities.")
        if any(identity not in base_cards for identity in removed_ids):
            raise ValueError(f"Invalid game variant {variant_id!r}: removedCards must be in baseDeck.")
        available = base_cards - set(removed_ids)
        added_ids = [_card_identity(card) for card in normalized_added]
        if len(set(added_ids)) != len(added_ids) or any(identity in available for identity in added_ids):
            raise ValueError(f"Invalid game variant {variant_id!r}: addedCards duplicate an active card identity.")
        rules = _validate_rule_values(record.get("rules", {}), f"variants.{variant_id}.rules")
        effective_rules = dict(registry["defaultRules"])
        effective_rules.update(rules)
        if effective_rules["startingHealth"] > effective_rules["maxHealth"]:
            raise ValueError(f"Invalid game variant {variant_id!r}: startingHealth cannot exceed maxHealth.")
        normalized_variants[variant_id] = {
            "name": record["name"],
            "addedCards": normalized_added,
            "removedCards": normalized_removed,
            "rules": rules,
        }
    registry["variants"] = normalized_variants
    return registry


def _card_identity(record: Mapping[str, Any]) -> tuple[str, int]:
    return (str(record["suit"]), int(record["rank"]))


_VARIANT_REGISTRY = _load_variant_registry()
DEFAULT_VARIANT_ID = str(_VARIANT_REGISTRY["defaultVariant"])
DECK_VARIANTS: tuple[DeckVariant, ...] = tuple(_VARIANT_REGISTRY["variants"].keys())


def get_game_variant(variant_id: str) -> dict[str, Any]:
    """Return a copy of one fully resolved variant from the shared registry."""
    if variant_id not in _VARIANT_REGISTRY["variants"]:
        raise ValueError(f"unknown game variant: {variant_id}")
    variant = deepcopy(_VARIANT_REGISTRY["variants"][variant_id])
    removed = {_card_identity(card) for card in variant["removedCards"]}
    cards = [card for card in _VARIANT_REGISTRY["baseDeck"] if _card_identity(card) not in removed]
    cards.extend(variant["addedCards"])
    rules = dict(_VARIANT_REGISTRY["defaultRules"])
    rules.update(variant["rules"])
    return {
        "id": variant_id,
        "name": variant["name"],
        "cards": deepcopy(cards),
        "addedCards": variant["addedCards"],
        "removedCards": variant["removedCards"],
        "rules": rules,
    }


def resolve_game_variant_id(variant_id: Optional[str] = None, deck_variant: Optional[str] = None) -> str:
    if variant_id is not None and deck_variant is not None and variant_id != deck_variant:
        raise ValueError("variant_id and deck_variant must match when both are provided.")
    selected = variant_id if variant_id is not None else deck_variant
    if selected is None:
        selected = DEFAULT_VARIANT_ID
    if selected not in _VARIANT_REGISTRY["variants"]:
        raise ValueError(f"unknown game variant: {selected}")
    return selected


def _card_from_record(record: Mapping[str, Any]) -> Card:
    return Card(CardType(record["type"]), Suit(record["suit"]), int(record["rank"]))


@lru_cache(maxsize=None)
def _variant_deck_tuple(variant_id: str) -> tuple[Card, ...]:
    variant = get_game_variant(variant_id)
    removed = {_card_identity(card) for card in variant["removedCards"]}
    cards = [record for record in _VARIANT_REGISTRY["baseDeck"] if _card_identity(record) not in removed]
    cards.extend(variant["addedCards"])
    return tuple(_card_from_record(record) for record in cards)


def _variant_deck(variant_id: str) -> List[Card]:
    return list(_variant_deck_tuple(variant_id))


QUEEN_OF_HEARTS = Card(CardType.POTION, Suit.HEARTS, 12)
JACK_OF_DIAMONDS = Card(CardType.WEAPON, Suit.DIAMONDS, 11)
VARIANT_EXTRA_CARDS: dict[DeckVariant, Card] = {
    variant_id: _card_from_record(record)
    for variant_id, variant in _VARIANT_REGISTRY["variants"].items()
    for record in variant["addedCards"][:1]
}


# ---------------------------------------------------------------------------
# Action dataclass
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class Action:
    """A legal action that can be submitted to the engine.

    action_type:
        "enterRoom"  — advance into the current room
        "skipRoom"   — defer (avoid) the current room
        "playCard"   — interact with a card in the room

    card_index: index of the card in state.room (only for "playCard")
    mode: "barehanded" or "weapon" (only for monster playCard actions)
    """

    action_type: str
    card_index: int = -1
    mode: Optional[str] = None


# ---------------------------------------------------------------------------
# PRNG: mulberry32
# ---------------------------------------------------------------------------


def _s32(value: int) -> int:
    """Truncate *value* to a signed 32-bit integer (mirrors JS `x | 0`)."""
    return ctypes.c_int32(value).value


def _u32(value: int) -> int:
    """Truncate *value* to an unsigned 32-bit integer (mirrors JS `x >>> 0`)."""
    return value & 0xFFFF_FFFF


def _imul(a: int, b: int) -> int:
    """Signed 32-bit integer multiply (mirrors JS Math.imul)."""
    return ctypes.c_int32(a * b).value


def mulberry32(seed: int) -> Callable[[], float]:
    """Return a stateful PRNG closure seeded with *seed*.

    The algorithm is an exact Python port of the TypeScript mulberry32
    implementation.  All arithmetic is performed with the same signed/unsigned
    32-bit semantics as JavaScript so that the sequence is bit-for-bit
    identical across both runtimes.
    """
    # JS uses a mutable captured variable; we replicate that with a list cell.
    state = [_s32(seed)]

    def rng() -> float:
        # seed |= 0  (signed 32-bit truncation — already done on init/prev step)
        # seed = (seed + 0x6d2b79f5) | 0
        state[0] = _s32(state[0] + 0x6D2B79F5)
        s = state[0]

        # let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
        t = _imul(s ^ _u32(s) >> 15, 1 | s)

        # t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
        t = (_s32(t + _imul(t ^ _u32(t) >> 7, 61 | t))) ^ t

        # return ((t ^ (t >>> 14)) >>> 0) / 4294967296
        return _u32(t ^ (_u32(t) >> 14)) / 4_294_967_296.0

    return rng


# ---------------------------------------------------------------------------
# Deck creation
# ---------------------------------------------------------------------------

# Ordered list of canonical base cards in registry creation order. This order
# remains the seen-card bit order for v1/v2 observations.
_CANONICAL_ORDER: List[Card] = [_card_from_record(record) for record in _VARIANT_REGISTRY["baseDeck"]]

# Fast lookup: card → canonical index (used in encode_observation)
_CARD_TO_CANONICAL_IDX: dict[Card, int] = {
    card: idx for idx, card in enumerate(_CANONICAL_ORDER)
}


def _fisher_yates_shuffle(cards: List[Card], rng: Callable[[], float]) -> List[Card]:
    """In-place Fisher-Yates shuffle using *rng*, matching the TS shuffle."""
    arr = list(cards)
    for i in range(len(arr) - 1, 0, -1):
        j = int(rng() * (i + 1))
        arr[i], arr[j] = arr[j], arr[i]
    return arr


def create_deck(
    seed: Optional[int] = None,
    variant_id: Optional[str] = None,
    deck_variant: Optional[str] = None,
) -> List[Card]:
    """Return a shuffled deck built from a registered game variant.

    If *seed* is provided the deck is shuffled deterministically using
    mulberry32 (identical output to ``Game.createDeck(seed)`` in TypeScript).
    Without a seed the deck is shuffled with Python's ``random.shuffle``.

    ``variant_id`` is the preferred identifier. ``deck_variant`` remains as a
    compatibility alias for callers using the earlier Python API.
    """
    resolved_variant = resolve_game_variant_id(variant_id, deck_variant)
    deck = _variant_deck(resolved_variant)
    if seed is not None:
        rng = mulberry32(seed)
        return _fisher_yates_shuffle(deck, rng)
    random.shuffle(deck)
    return deck


# ---------------------------------------------------------------------------
# GameState dataclass
# ---------------------------------------------------------------------------


@dataclass
class GameState:
    """Mutable snapshot of a Scoundrel game.

    Field names follow Python snake_case conventions while mapping 1-to-1 with
    the TypeScript Game / Player / ScoundrelGameState fields.
    """

    # --- Deck / cards ---
    deck: List[Card]
    discard: List[Card]
    room: List[Card]  # currentRoom.cards

    # --- Player ---
    equipped_weapon: Optional[Card]        # player.equippedWeapon
    last_monster_defeated: Optional[Card]  # player.lastMonsterDefeated
    monsters_on_weapon: List[Card]         # player.monstersOnWeapon
    health: int
    max_health: int

    # --- Turn flags ---
    can_defer_room: bool       # canDeferRoom
    last_action_was_defer: bool  # lastActionWasDefer
    game_over: bool
    victory: bool
    potion_taken_this_turn: bool    # player.potionTakenThisTurn
    potions_taken_this_turn: int    # player.potionsTakenThisTurn
    room_being_entered: bool        # roomBeingEntered
    cards_resolved_this_turn: int   # cardsResolvedThisTurn

    # --- Scoring helpers ---
    last_resolved_card_type: Optional[str]   # lastResolvedCardType
    last_resolved_potion_value: Optional[int]  # lastResolvedPotionValue

    # Cards from skipped rooms remain in the deck but are known to the player.
    known_seen_cards: List[Card] = field(default_factory=list)
    variant_id: str = DEFAULT_VARIANT_ID
    rules: "GameRules" = field(default_factory=lambda: _make_game_rules())


@dataclass(frozen=True)
class GameRules:
    """Effective settings merged from registry defaults, variant, and overrides."""

    starting_health: int
    max_health: int
    potions_per_room: int
    can_skip_rooms: bool
    can_skip_consecutive: bool
    weapon_kill_limit: bool


def _make_game_rules(variant_id: Optional[str] = None, overrides: Optional[Mapping[str, Any]] = None) -> GameRules:
    values = dict(_VARIANT_REGISTRY["defaultRules"])
    if variant_id is not None:
        values.update(get_game_variant(variant_id)["rules"])
    if overrides is not None:
        values.update(_validate_rule_values(dict(overrides), "rules_override"))
    values = _validate_rule_values(values, "effective rules", require_all=True)
    if values["startingHealth"] > values["maxHealth"]:
        raise ValueError("Invalid effective rules: startingHealth cannot exceed maxHealth.")
    return GameRules(
        starting_health=values["startingHealth"],
        max_health=values["maxHealth"],
        potions_per_room=values["potionsPerRoom"],
        can_skip_rooms=values["canSkipRooms"],
        can_skip_consecutive=values["canSkipConsecutive"],
        weapon_kill_limit=values["weaponKillLimit"],
    )


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _copy_state(state: GameState) -> GameState:
    """Return a shallow-but-correct copy of *state* (lists are new objects)."""
    return GameState(
        deck=list(state.deck),
        discard=list(state.discard),
        room=list(state.room),
        equipped_weapon=state.equipped_weapon,
        last_monster_defeated=state.last_monster_defeated,
        monsters_on_weapon=list(state.monsters_on_weapon),
        health=state.health,
        max_health=state.max_health,
        can_defer_room=state.can_defer_room,
        last_action_was_defer=state.last_action_was_defer,
        game_over=state.game_over,
        victory=state.victory,
        potion_taken_this_turn=state.potion_taken_this_turn,
        potions_taken_this_turn=state.potions_taken_this_turn,
        room_being_entered=state.room_being_entered,
        cards_resolved_this_turn=state.cards_resolved_this_turn,
        last_resolved_card_type=state.last_resolved_card_type,
        last_resolved_potion_value=state.last_resolved_potion_value,
        known_seen_cards=list(state.known_seen_cards),
        variant_id=state.variant_id,
        rules=state.rules,
    )


def _apply_turn_rules(state: GameState) -> None:
    """Mutate *state* in-place to enforce end-of-action rules.

    Mirrors Game.applyTurnRules() from the TypeScript engine:
    1. If health ≤ 0 → game_over.
    2. If deck and room both empty → victory.
    3. If not room_being_entered and room has ≤ 1 card and deck is non-empty
       → deal up to 4 cards into the room.
    """
    if state.health <= 0:
        state.game_over = True
        return

    if len(state.deck) == 0 and len(state.room) == 0:
        state.victory = True
        return

    # Deal a new room when outside a turn and the room is nearly empty.
    if not state.room_being_entered and len(state.room) <= 1 and len(state.deck) > 0:
        _deal_room(state)


def _deal_room(state: GameState) -> None:
    """Top-fill the room to 4 cards from the front of the deck (mutates in-place).

    Mirrors Game.dealRoom(): pulls from the front of deck (shift in JS =
    pop(0) in Python) until room has 4 cards or deck is exhausted.
    """
    cards = list(state.room)
    while len(cards) < 4 and len(state.deck) > 0:
        cards.append(state.deck.pop(0))
    state.room = cards
    state.room_being_entered = False


# ---------------------------------------------------------------------------
# Public API: init_game
# ---------------------------------------------------------------------------


def init_game(
    seed: Optional[int] = None,
    variant_id: Optional[str] = None,
    deck_variant: Optional[str] = None,
    rules_override: Optional[Mapping[str, Any]] = None,
) -> GameState:
    """Initialise a new game and return its starting state.

    Mirrors the TS flow:
        new Game(deck)          → constructor calls applyTurnRules() → deals room
        game.enterRoom()        → sets room_being_entered=True, resets flags
    """
    resolved_variant = resolve_game_variant_id(variant_id, deck_variant)
    rules = _make_game_rules(resolved_variant, rules_override)
    deck = create_deck(seed, variant_id=resolved_variant)
    state = GameState(
        deck=deck,
        discard=[],
        room=[],
        equipped_weapon=None,
        last_monster_defeated=None,
        monsters_on_weapon=[],
        health=rules.starting_health,
        max_health=rules.max_health,
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
        variant_id=resolved_variant,
        rules=rules,
    )
    # Constructor calls applyTurnRules which deals the initial room.
    _apply_turn_rules(state)
    # Then the adapter calls enterRoom().
    return enter_room(state)


# ---------------------------------------------------------------------------
# Public API: enter_room
# ---------------------------------------------------------------------------


def enter_room(state: GameState) -> GameState:
    """Enter the current room, enabling card interactions.

    Mirrors Game.enterRoom(): sets room_being_entered=True and resets per-turn
    counters (potion flag, cards resolved).
    """
    new = _copy_state(state)
    new.can_defer_room = state.rules.can_skip_rooms
    new.last_action_was_defer = False
    new.potion_taken_this_turn = False
    new.potions_taken_this_turn = 0
    new.room_being_entered = True
    new.cards_resolved_this_turn = 0
    return new


# ---------------------------------------------------------------------------
# Public API: avoid_room
# ---------------------------------------------------------------------------


def avoid_room(state: GameState) -> GameState:
    """Defer (skip) the current room, pushing its cards to the bottom of the deck.

    Mirrors Game.avoidRoom():
    - Guard: returns unchanged state if the action is illegal.
    - Appends room cards to the end of the deck (bottom).
    - Clears the room, sets canDeferRoom=False, lastActionWasDefer=True.
    - Calls applyTurnRules() which deals a fresh room.
    """
    if not _can_skip_room(state):
        return _copy_state(state)

    new = _copy_state(state)
    known = set(new.known_seen_cards)
    for card in new.room:
        if card not in known:
            new.known_seen_cards.append(card)
            known.add(card)
    # Push room cards to the bottom of the deck.
    new.deck = list(new.deck) + list(new.room)
    new.room = []
    new.can_defer_room = False
    new.last_action_was_defer = True
    new.room_being_entered = False
    # Deal a new room from the front of the (now-extended) deck.
    _apply_turn_rules(new)

    # Mirror engineAdapter behaviour: toEngineGame() always forces roomBeingEntered=True,
    # so the freshly dealt room is treated as immediately entered — WITHOUT resetting
    # the other flags (canDeferRoom stays False, lastActionWasDefer stays True, etc.).
    # Contrast with play_card's auto-enter which calls the full enter_room() reset.
    if not new.game_over and not new.victory and len(new.room) > 0:
        new.room_being_entered = True

    return new


def _can_skip_room(state: GameState) -> bool:
    if not state.rules.can_skip_rooms or len(state.room) == 0:
        return False
    if state.rules.can_skip_consecutive:
        return True
    return state.can_defer_room and not state.last_action_was_defer


# ---------------------------------------------------------------------------
# Public API: play_card
# ---------------------------------------------------------------------------


def play_card(
    state: GameState,
    card_index: int,
    mode: Optional[str] = None,
) -> GameState:
    """Interact with the card at *card_index* in state.room.

    Mirrors Game.handleCardAction() from the TypeScript engine.

    Parameters
    ----------
    state:
        Current game state.  Must have room_being_entered=True.
    card_index:
        Index into state.room.
    mode:
        "barehanded" or "weapon" (only meaningful for monster cards).
        Defaults to "barehanded".

    Returns
    -------
    A new GameState after the action has been applied and applyTurnRules() has
    run.
    """
    if card_index < 0 or card_index >= len(state.room):
        raise IndexError(f"card_index {card_index} out of range for room of length {len(state.room)}")

    card = state.room[card_index]
    new = _copy_state(state)
    # Remove the targeted card from the room copy.
    new.room = [c for i, c in enumerate(state.room) if i != card_index]

    if card.card_type == CardType.MONSTER:
        _handle_monster(new, card, mode or "barehanded")
    elif card.card_type == CardType.WEAPON:
        _handle_weapon(new, card)
    elif card.card_type == CardType.POTION:
        _handle_potion(new, card)

    # Record what was resolved.
    new.last_resolved_card_type = card.card_type.value
    new.last_resolved_potion_value = card.rank if card.card_type == CardType.POTION else None

    # Advance the resolved counter; end the turn when 3 cards played or room empty.
    new.cards_resolved_this_turn += 1
    if new.cards_resolved_this_turn >= 3 or len(new.room) == 0:
        new.room_being_entered = False
        new.cards_resolved_this_turn = 0

    _apply_turn_rules(new)

    # Mirror engineAdapter.handleCardAction(): after the turn ends, if the room
    # still has cards and the game is not terminal, automatically enter the room.
    # This matches the TS adapter behaviour at engineAdapter.ts line 167–169.
    if not new.game_over and not new.victory and not new.room_being_entered and len(new.room) > 0:
        return enter_room(new)

    return new


def _handle_monster(state: GameState, card: Card, mode: str) -> None:
    """Apply monster combat to *state* (mutates in-place).

    Mirrors Player.fightMonster() + the weapon-kill-limit guard in
    Game.handleCardAction().
    """
    if mode == "weapon":
        if state.equipped_weapon is None:
            raise ValueError("Cannot fight with weapon: no weapon equipped.")
        if (
            state.rules.weapon_kill_limit
            and state.last_monster_defeated is not None
            and card.rank > state.last_monster_defeated.rank
        ):
            raise ValueError(
                f"Illegal weapon action: monster rank {card.rank} exceeds "
                f"weapon-kill limit {state.last_monster_defeated.rank}."
            )
        damage = max(0, card.rank - state.equipped_weapon.rank)
        state.health -= damage
        state.last_monster_defeated = card
        state.monsters_on_weapon = list(state.monsters_on_weapon) + [card]
        # Monster is stacked on weapon, NOT added to discard yet.
    else:  # barehanded
        state.health -= card.rank
        state.discard = list(state.discard) + [card]


def _handle_weapon(state: GameState, card: Card) -> None:
    """Equip *card* as the new weapon, discarding the old one (mutates in-place).

    Mirrors Player.takeWeapon().
    """
    if state.equipped_weapon is not None:
        # Old weapon and all stacked monsters go to discard.
        state.discard = list(state.discard) + [state.equipped_weapon] + list(state.monsters_on_weapon)
        state.monsters_on_weapon = []
    state.equipped_weapon = card
    state.last_monster_defeated = None


def _handle_potion(state: GameState, card: Card) -> None:
    """Apply a potion to the player (mutates in-place).

    Mirrors Player.takePotion() using the active potions-per-room setting.
    Potions beyond that limit are discarded without healing.
    """
    potions_per_room = state.rules.potions_per_room
    if state.potions_taken_this_turn < potions_per_room:
        state.health = min(state.health + card.rank, state.max_health)
        state.potions_taken_this_turn += 1
        state.potion_taken_this_turn = state.potions_taken_this_turn >= potions_per_room
    state.discard = list(state.discard) + [card]


# ---------------------------------------------------------------------------
# Public API: get_legal_actions
# ---------------------------------------------------------------------------


def get_legal_actions(state: GameState) -> List[Action]:
    """Return the list of legal actions for *state*.

    Mirrors Game.getPossibleActions() from the TypeScript engine, plus the
    extra skipRoom injection from engineAdapter.getPossibleActions() (which
    surfaces skipRoom when inside a 4-card room and defer is legal).
    """
    if state.game_over or state.victory:
        return []

    actions: List[Action] = []

    if not state.room_being_entered:
        actions.append(Action(action_type="enterRoom"))
        if _can_skip_room(state):
            actions.append(Action(action_type="skipRoom"))
    else:
        # Inside a room: generate card actions for each room card.
        for idx, card in enumerate(state.room):
            if card.card_type == CardType.MONSTER:
                if state.equipped_weapon is not None:
                    # The optional limit applies only after the weapon has killed once.
                    if (
                        not state.rules.weapon_kill_limit
                        or state.last_monster_defeated is None
                        or card.rank <= state.last_monster_defeated.rank
                    ):
                        actions.append(Action(action_type="playCard", card_index=idx, mode="weapon"))
                actions.append(Action(action_type="playCard", card_index=idx, mode="barehanded"))
            elif card.card_type in (CardType.POTION, CardType.WEAPON):
                actions.append(Action(action_type="playCard", card_index=idx))

        # engineAdapter injects skipRoom when inside a 4-card room and defer is legal.
        if len(state.room) == 4 and _can_skip_room(state):
            actions.append(Action(action_type="skipRoom"))

    return actions


# ---------------------------------------------------------------------------
# Public API: calculate_score
# ---------------------------------------------------------------------------


def calculate_score(state: GameState) -> int:
    """Compute the game score.

    Mirrors Game.calculateScore():
    - Victory: health (+ potion bonus if health==20 and last resolved was potion).
    - Death/in-progress: health minus the sum of all monster ranks still in deck.
    """
    monsters_in_deck = [c for c in state.deck if c.card_type == CardType.MONSTER]
    monsters_value = sum(c.rank for c in monsters_in_deck)

    if state.victory:
        score = state.health
        if (
            state.health == state.max_health
            and state.last_resolved_card_type == "potion"
            and state.last_resolved_potion_value is not None
        ):
            score += state.last_resolved_potion_value
        return score

    return state.health - monsters_value


# ---------------------------------------------------------------------------
# Public API: encode_observation
# ---------------------------------------------------------------------------

_MAX_RANK = 14

# Total card counts per type in the canonical 44-card deck.
# Hearts (potions): 2–10 → 9 cards.
# Diamonds (weapons): 2–10 → 9 cards.
# Clubs + Spades (monsters): 2–14 × 2 = 26 cards.
_TOTAL_MONSTERS = 26
_TOTAL_POTIONS = 9
_TOTAL_WEAPONS = 9


def _build_seen_set(state: GameState) -> set:
    """Return cards whose identities are known to the player.

    This includes cards in the discard pile, active room, equipped as a weapon,
    or stacked on the weapon, plus cards from skipped rooms. Observation
    encoders use this to derive which canonical cards remain unknown.
    """
    seen: set = set()
    for card in state.discard:
        seen.add(card)
    for card in state.room:
        seen.add(card)
    if state.equipped_weapon is not None:
        seen.add(state.equipped_weapon)
    for card in state.monsters_on_weapon:
        seen.add(card)
    seen.update(state.known_seen_cards)
    return seen


def encode_observation(state: GameState) -> "np.ndarray":  # type: ignore[name-defined]
    """Encode *state* as a 74-dimensional float32 observation vector.

    Layout (mirrors engineWorkerService.encodeObservation):
        [0]     clamped health / max_health
        [1]     max_health / 20
        [2]     equipped_weapon.rank / 14  (0 if none)
        [3]     last_monster_defeated.rank / 14  (0 if none)
        [4]     min(len(monsters_on_weapon), 4) / 4
        [5]     potion_taken_this_turn (0/1)
        [6]     can_defer_room (0/1)
        [7]     last_action_was_defer (0/1)
        [8]     min(len(deck), 44) / 44
        [9]     min(len(room), 4) / 4
        [10-25] 4 room slots × 4 features: [is_monster, is_weapon, is_potion, rank/14]
        [26-29] 4 monsters-on-weapon ranks / 14  (0 if slot empty)
        [30-73] 44 seen-card bits (1 if known: discard ∪ room ∪ equipped ∪ on-weapon ∪ skipped rooms)
    """
    import numpy as np

    obs = np.zeros(74, dtype=np.float32)
    room_cards = state.room
    monsters_on_weapon = state.monsters_on_weapon
    max_health = max(state.max_health, 1)

    obs[0] = min(max(state.health / max_health, 0.0), 1.0)
    obs[1] = state.max_health / 20.0
    obs[2] = (state.equipped_weapon.rank / _MAX_RANK) if state.equipped_weapon else 0.0
    obs[3] = (state.last_monster_defeated.rank / _MAX_RANK) if state.last_monster_defeated else 0.0
    obs[4] = min(len(monsters_on_weapon), 4) / 4.0
    obs[5] = 1.0 if state.potion_taken_this_turn else 0.0
    obs[6] = 1.0 if state.can_defer_room else 0.0
    obs[7] = 1.0 if state.last_action_was_defer else 0.0
    obs[8] = min(len(state.deck), 44) / 44.0
    obs[9] = min(len(room_cards), 4) / 4.0

    for i in range(4):
        if i >= len(room_cards):
            break
        card = room_cards[i]
        base = 10 + i * 4
        obs[base]     = 1.0 if card.card_type == CardType.MONSTER else 0.0
        obs[base + 1] = 1.0 if card.card_type == CardType.WEAPON  else 0.0
        obs[base + 2] = 1.0 if card.card_type == CardType.POTION  else 0.0
        obs[base + 3] = card.rank / _MAX_RANK

    for i in range(4):
        if i >= len(monsters_on_weapon):
            break
        obs[26 + i] = monsters_on_weapon[i].rank / _MAX_RANK

    # Seen-card bits: mark cards known from the current state or skipped rooms.
    def _mark_seen(card: Optional[Card]) -> None:
        if card is None:
            return
        idx = _CARD_TO_CANONICAL_IDX.get(card)
        if idx is not None:
            obs[30 + idx] = 1.0

    for card in state.discard:
        _mark_seen(card)
    for card in room_cards:
        _mark_seen(card)
    _mark_seen(state.equipped_weapon)
    for card in monsters_on_weapon:
        _mark_seen(card)
    for card in state.known_seen_cards:
        _mark_seen(card)

    return obs


def encode_observation_v2(state: GameState) -> "np.ndarray":  # type: ignore[name-defined]
    """Encode *state* as an 84-dimensional float32 observation vector.

    The first 74 dimensions are identical to ``encode_observation``.
    Dimensions 74–83 add ten derived features that provide richer strategic
    context for the RL agent:

        [74]  unseen_monster_count / 26
        [75]  unseen_potion_count / 9 (10 for queen_hearts)
        [76]  unseen_weapon_count / 9 (10 for jack_diamonds)
        [77]  avg_unseen_monster_rank / 14
        [78]  max_unseen_monster_rank / 14
        [79]  weapon_kills_remaining / 4
              (monsters in deck+room with rank <= kill_limit; 0 if no weapon)
        [80]  equipped_weapon.rank / 14 if weapon exists, else 0
        [81]  health_risk_ratio
              (avg_unseen_monster_rank / max(health, 1), clamped to [0, 1])
        [82]  deck_progress  (1 - len(deck) / 44, or / 45 for either variant)
        [83]  survival_margin
              (health / (sum_unseen_monster_ranks + 1), clamped to [0, 1])

    "Unseen" cards are those in ``_CANONICAL_ORDER`` (plus the active variant
    card) whose identities are not known from
    {discard ∪ room ∪ equipped_weapon ∪ monsters_on_weapon ∪ skipped rooms}.
    They may still be in the deck or have not yet been encountered.
    """
    import numpy as np

    obs = np.zeros(84, dtype=np.float32)

    # First 74 dims come directly from the existing encoder.
    obs[:74] = encode_observation(state)

    # Build the seen set once via the shared helper, then derive unseen cards
    # from the active variant's exact deck composition.
    seen = _build_seen_set(state)
    active_deck = _variant_deck_tuple(state.variant_id)
    unseen_cards = [card for card in active_deck if card not in seen]
    unseen_monsters = [card for card in unseen_cards if card.card_type == CardType.MONSTER]
    unseen_potions = [card for card in unseen_cards if card.card_type == CardType.POTION]
    unseen_weapons = [card for card in unseen_cards if card.card_type == CardType.WEAPON]
    total_monsters = sum(card.card_type == CardType.MONSTER for card in active_deck)
    total_potions = sum(card.card_type == CardType.POTION for card in active_deck)
    total_weapons = sum(card.card_type == CardType.WEAPON for card in active_deck)

    obs[74] = len(unseen_monsters) / total_monsters if total_monsters else 0.0
    obs[75] = len(unseen_potions) / total_potions if total_potions else 0.0
    obs[76] = len(unseen_weapons) / total_weapons if total_weapons else 0.0

    # --- Average and maximum unseen monster rank. ---
    if unseen_monsters:
        ranks = [c.rank for c in unseen_monsters]
        avg_unseen_monster_rank = sum(ranks) / len(ranks)
        max_unseen_monster_rank = max(ranks)
        sum_unseen_monster_ranks = sum(ranks)
    else:
        avg_unseen_monster_rank = 0.0
        max_unseen_monster_rank = 0
        sum_unseen_monster_ranks = 0

    obs[77] = avg_unseen_monster_rank / _MAX_RANK
    obs[78] = max_unseen_monster_rank / _MAX_RANK

    # --- Weapon-based features. ---
    if state.equipped_weapon is not None:
        # Determine the kill limit: the rank of the last monster defeated, or
        # None if the weapon has never killed (no kill limit applied yet,
        # meaning all monsters are potentially killable in future).
        kill_limit = state.last_monster_defeated.rank if state.last_monster_defeated is not None else None

        if state.rules.weapon_kill_limit and kill_limit is not None:
            # Count monsters in deck+room with rank <= kill_limit.
            killable_count = sum(
                1 for c in chain(state.deck, state.room)
                if c.card_type == CardType.MONSTER and c.rank <= kill_limit
            )
        else:
            # Weapon equipped but no kill on record yet — all monsters are
            # reachable in principle; treat full killable count as all unseen.
            killable_count = sum(
                1 for c in chain(state.deck, state.room)
                if c.card_type == CardType.MONSTER
            )
        obs[79] = min(killable_count, 4) / 4.0
        obs[80] = state.equipped_weapon.rank / _MAX_RANK
    # If no weapon, obs[79] and obs[80] remain 0.

    # --- Health risk ratio: how dangerous are unseen monsters relative to current HP. ---
    obs[81] = min(avg_unseen_monster_rank / max(state.health, 1), 1.0)

    # --- Deck progress: fraction of the variant's original deck consumed. ---
    deck_size = len(active_deck)
    obs[82] = 1.0 - min(len(state.deck), deck_size) / deck_size

    # --- Survival margin: can the player survive all remaining monsters? ---
    obs[83] = min(max(state.health / (sum_unseen_monster_ranks + 1), 0.0), 1.0)

    return obs


def encode_observation_v3(state: GameState) -> "np.ndarray":  # type: ignore[name-defined]
    """Encode *state* as a 98-element float32 vector for variant-aware models.

    Positions 0–29 retain the v1 player, room, and weapon layout, with bounded
    max-health, potion-usage, and active-deck ratios at positions 1, 5, and 8.
    Positions 30–81 are seen-card bits for every suit/rank slot (four suits,
    ranks 2–14). Positions 82–91 carry the v2 deck-derived features. Positions
    92–97 describe the effective rules for this state.
    """
    import numpy as np

    obs = np.zeros(98, dtype=np.float32)
    base = encode_observation(state)
    obs[:30] = base[:30]

    max_health = max(state.max_health, 1)
    active_deck = _variant_deck_tuple(state.variant_id)
    obs[1] = state.max_health / (state.max_health + 20.0) if state.max_health > 0 else 0.0
    if state.rules.potions_per_room > 0:
        obs[5] = min(max(state.potions_taken_this_turn / state.rules.potions_per_room, 0.0), 1.0)
    else:
        obs[5] = 0.0
    obs[8] = min(max(len(state.deck) / max(len(active_deck), 1), 0.0), 1.0)

    suit_indices = {suit: index for index, suit in enumerate((Suit.HEARTS, Suit.DIAMONDS, Suit.CLUBS, Suit.SPADES))}
    for card in _build_seen_set(state):
        bit_index = 30 + suit_indices[card.suit] * 13 + (card.rank - 2)
        obs[bit_index] = 1.0

    obs[82:92] = encode_observation_v2(state)[74:84]
    obs[92] = state.rules.starting_health / (state.rules.starting_health + 20.0)
    obs[93] = state.rules.potions_per_room / (state.rules.potions_per_room + 1.0)
    obs[94] = 1.0 if state.rules.can_skip_rooms else 0.0
    obs[95] = 1.0 if state.rules.can_skip_consecutive else 0.0
    obs[96] = 1.0 if state.rules.weapon_kill_limit else 0.0
    obs[97] = min(max(state.rules.starting_health / max_health, 0.0), 1.0)
    return obs


# ---------------------------------------------------------------------------
# Public API: build_action_mask
# ---------------------------------------------------------------------------


def build_action_mask(state: GameState) -> "np.ndarray":  # type: ignore[name-defined]
    """Return a 10-element boolean action mask for *state*.

    Discrete action index mapping (mirrors actionToDiscrete in TS):
        0   enterRoom
        1   skipRoom
        2   card[0] barehanded / potion / weapon
        3   card[0] weapon (monster with weapon)
        4   card[1] barehanded
        5   card[1] weapon
        6   card[2] barehanded
        7   card[2] weapon
        8   card[3] barehanded
        9   card[3] weapon
    """
    import numpy as np

    mask = np.zeros(10, dtype=bool)
    for action in get_legal_actions(state):
        idx = _action_to_discrete(action)
        if idx is not None:
            mask[idx] = True
    return mask


def _action_to_discrete(action: Action) -> Optional[int]:
    """Map an Action to its discrete integer index (0–9), or None if unmappable.

    Mirrors actionToDiscrete() from engineWorkerService.ts.
    """
    if action.action_type == "enterRoom":
        return 0
    if action.action_type == "skipRoom":
        return 1
    if action.action_type == "playCard":
        if action.card_index < 0 or action.card_index > 3:
            return None
        base = 2 + action.card_index * 2
        return base + 1 if action.mode == "weapon" else base
    return None
