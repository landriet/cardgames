from __future__ import annotations

import pytest

from evaluate_agent import parse_seed_list


@pytest.mark.parametrize("seed_range", ["-1-3", "-3--1"])
def test_parse_seed_list_rejects_negative_seed_range_bounds(seed_range: str) -> None:
    with pytest.raises(ValueError, match="bounds must be non-negative"):
        parse_seed_list(None, None, seed_range)


def test_parse_seed_list_accepts_non_negative_seed_range() -> None:
    assert parse_seed_list(None, None, "0-2") == [0, 1, 2]
