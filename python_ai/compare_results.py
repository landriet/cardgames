from __future__ import annotations

import argparse
import json
from pathlib import Path


def load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def main() -> None:
    parser = argparse.ArgumentParser(description="Compare eval vs random baseline metrics.")
    parser.add_argument("--baseline", type=Path, required=True, help="Path to random baseline JSON.")
    parser.add_argument("--eval", type=Path, required=True, help="Path to eval JSON.")
    parser.add_argument("--target-lift", type=float, default=30.0, help="Target score lift percentage.")
    args = parser.parse_args()

    baseline = load_json(args.baseline)
    evaluation = load_json(args.eval)

    b = float(baseline.get("avg_score", 0.0))
    e = float(evaluation.get("avg_score", 0.0))

    if b == 0.0:
        lift = float("inf") if e > 0 else float("-inf") if e < 0 else 0.0
    else:
        lift = ((e - b) / abs(b)) * 100.0

    print(f"baseline avg_score: {b:.3f}")
    print(f"eval avg_score:     {e:.3f}")
    print(f"score lift:         {lift:.2f}%")
    print(f"baseline win_rate:  {float(baseline.get('win_rate', 0.0)):.3%}")
    print(f"eval win_rate:      {float(evaluation.get('win_rate', 0.0)):.3%}")

    passed = lift >= args.target_lift
    print(f"target lift:        {args.target_lift:.2f}%")
    print(f"target status:      {'PASS' if passed else 'FAIL'}")


if __name__ == "__main__":
    main()
