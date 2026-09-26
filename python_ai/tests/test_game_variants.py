from __future__ import annotations

import json
from copy import deepcopy

import numpy as np
import pytest

import engine


def test_named_card_variants_are_loaded_from_the_shared_registry() -> None:
    assert hasattr(engine, "get_game_variant")
    queen_variant = engine.get_game_variant("queen_hearts")
    jack_variant = engine.get_game_variant("jack_diamonds")
    strict_weapon_variant = engine.get_game_variant("strict_weapon_kill_limit")

    assert queen_variant["addedCards"] == [{"type": "potion", "suit": "hearts", "rank": 12}]
    assert jack_variant["addedCards"] == [{"type": "weapon", "suit": "diamonds", "rank": 11}]
    assert strict_weapon_variant["rules"]["weaponKillLimitStrict"] is True
    assert len(queen_variant["cards"]) == 45
    assert queen_variant["rules"]["startingHealth"] == 20
    assert len(engine.create_deck(seed=7, variant_id="standard")) == 44
    assert len(engine.create_deck(seed=7, variant_id="queen_hearts")) == 45
    assert len(engine.create_deck(seed=7, variant_id="jack_diamonds")) == 45


def test_strict_weapon_kill_limit_variant_blocks_equal_and_higher_ranks() -> None:
    state = engine.init_game(seed=1, variant_id="strict_weapon_kill_limit")
    equal = engine.Card(engine.CardType.MONSTER, engine.Suit.SPADES, 6)
    lower = engine.Card(engine.CardType.MONSTER, engine.Suit.CLUBS, 5)
    higher = engine.Card(engine.CardType.MONSTER, engine.Suit.SPADES, 7)
    state.room = [equal, lower, higher]
    state.deck = []
    state.room_being_entered = True
    state.equipped_weapon = engine.Card(engine.CardType.WEAPON, engine.Suit.DIAMONDS, 8)
    state.last_monster_defeated = engine.Card(engine.CardType.MONSTER, engine.Suit.CLUBS, 6)

    actions = engine.get_legal_actions(state)
    weapon_actions = {(action.card_index, action.mode) for action in actions if action.mode == "weapon"}

    assert weapon_actions == {(1, "weapon")}
    assert engine.encode_observation_v3(state)[96] == pytest.approx(0.5)
    with pytest.raises(ValueError, match="weapon-kill limit"):
        engine.play_card(state, 0, "weapon")


def test_unknown_game_variant_is_rejected() -> None:
    assert hasattr(engine, "get_game_variant")
    with pytest.raises(ValueError, match="unknown game variant"):
        engine.get_game_variant("not_a_variant")


def test_unsupported_rule_override_is_rejected() -> None:
    with pytest.raises(ValueError, match="unknown setting"):
        engine.init_game(seed=7, rules_override={"extraPotionRule": True})


@pytest.mark.parametrize("collision", ["base", "removed", "added"])
def test_registry_rejects_duplicate_card_identities(monkeypatch, tmp_path, collision: str) -> None:
    registry = deepcopy(engine._VARIANT_REGISTRY)
    first_card = deepcopy(registry["baseDeck"][0])
    if collision == "base":
        registry["baseDeck"].append(first_card)
    elif collision == "removed":
        registry["variants"]["standard"]["removedCards"] = [
            first_card,
            {**first_card, "type": "weapon"},
        ]
    else:
        registry["variants"]["standard"]["addedCards"] = [first_card]

    registry_path = tmp_path / "game-variants.json"
    registry_path.write_text(json.dumps(registry), encoding="utf-8")
    monkeypatch.setattr(engine, "_REGISTRY_PATH", registry_path)

    with pytest.raises(ValueError, match="duplicate|collide"):
        engine._load_variant_registry()


def test_rule_overrides_set_initial_health_and_are_carried_in_state() -> None:
    assert hasattr(engine, "get_game_variant")
    state = engine.init_game(seed=7, variant_id="standard", rules_override={"startingHealth": 26, "maxHealth": 30})

    assert state.health == 26
    assert state.max_health == 30
    assert state.rules.starting_health == 26
    assert state.rules.max_health == 30
    assert state.variant_id == "standard"


def test_variant_aware_observation_supports_full_card_set_and_variable_health() -> None:
    assert hasattr(engine, "encode_observation_v3")
    state = engine.init_game(seed=7, variant_id="jack_diamonds", rules_override={"startingHealth": 26, "maxHealth": 30})

    obs_v1 = engine.encode_observation(state)
    obs_v2 = engine.encode_observation_v2(state)
    obs_v3 = engine.encode_observation_v3(state)

    assert obs_v1.shape == (74,)
    assert obs_v2.shape == (84,)
    assert obs_v3.shape == (98,)
    assert obs_v3.dtype == np.float32
    assert np.all((obs_v3 >= 0.0) & (obs_v3 <= 1.0))
    assert obs_v3[1] == pytest.approx(30 / 50)


def test_deck_variant_argument_remains_a_compatible_alias() -> None:
    preferred = engine.create_deck(seed=17, variant_id="queen_hearts")
    compatible = engine.create_deck(seed=17, deck_variant="queen_hearts")

    assert preferred == compatible
    assert engine.init_game(seed=17, deck_variant="jack_diamonds").variant_id == "jack_diamonds"


def test_skip_rules_control_legal_actions_and_consecutive_skips() -> None:
    no_skips = engine.init_game(seed=7, rules_override={"canSkipRooms": False})
    assert all(action.action_type != "skipRoom" for action in engine.get_legal_actions(no_skips))
    assert engine.avoid_room(no_skips).room == no_skips.room

    consecutive = engine.init_game(seed=7, rules_override={"canSkipConsecutive": True})
    after_first_skip = engine.avoid_room(consecutive)
    assert any(action.action_type == "skipRoom" for action in engine.get_legal_actions(after_first_skip))


def test_rule_settings_control_potions_and_weapon_limits() -> None:
    potion = engine.Card(engine.CardType.POTION, engine.Suit.HEARTS, 3)
    potion_state = engine.init_game(seed=1, rules_override={"startingHealth": 10, "maxHealth": 30, "potionsPerRoom": 2})
    potion_state.room = [potion, engine.Card(engine.CardType.POTION, engine.Suit.HEARTS, 4)]
    potion_state.deck = []
    potion_state = engine.play_card(potion_state, 0)
    potion_state = engine.play_card(potion_state, 0)
    assert potion_state.health == 17

    monster = engine.Card(engine.CardType.MONSTER, engine.Suit.CLUBS, 9)
    weapon_state = engine.init_game(seed=1, rules_override={"weaponKillLimit": False})
    weapon_state.room = [monster]
    weapon_state.equipped_weapon = engine.Card(engine.CardType.WEAPON, engine.Suit.DIAMONDS, 7)
    weapon_state.last_monster_defeated = engine.Card(engine.CardType.MONSTER, engine.Suit.SPADES, 4)
    assert any(action.mode == "weapon" for action in engine.get_legal_actions(weapon_state))
    assert engine.play_card(weapon_state, 0, "weapon").health == 18

def test_v3_encodes_variant_identity_and_effective_rules() -> None:
    jack = engine.Card(engine.CardType.WEAPON, engine.Suit.DIAMONDS, 11)
    state = engine.init_game(seed=7, variant_id="jack_diamonds", rules_override={
        "startingHealth": 26,
        "maxHealth": 30,
        "potionsPerRoom": 2,
        "canSkipRooms": False,
        "canSkipConsecutive": True,
        "weaponKillLimit": False,
    })
    state.room = [jack]
    state.health = 26

    obs = engine.encode_observation_v3(state)

    # Diamonds occupy identity slots 13–25; J♦ is rank slot 9 within that suit.
    assert obs[30 + 13 + 9] == 1.0
    assert obs[92] == pytest.approx(26 / 46)
    assert obs[93] == pytest.approx(2 / 3)
    assert obs[94:97].tolist() == [0.0, 1.0, 0.0]
    assert obs[97] == pytest.approx(26 / 30)
