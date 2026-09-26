from __future__ import annotations

from bridge_client import EngineWorkerClient


def test_rl_session_sends_variant_observation_and_rules_fields(monkeypatch) -> None:
    client = EngineWorkerClient()
    monkeypatch.setattr(client, "request", lambda method, params: {"method": method, "params": params})

    result = client.create_session_rl(
        deck_seed=21,
        variant_id="jack_diamonds",
        obs_version=3,
        rules={"startingHealth": 24},
    )

    assert result == {
        "method": "create_session_rl",
        "params": {
            "deckSeed": 21,
            "variantId": "jack_diamonds",
            "obsVersion": 3,
            "rules": {"startingHealth": 24},
        },
    }
