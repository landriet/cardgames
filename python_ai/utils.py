from __future__ import annotations

import numpy as np


def bootstrap_mean_ci(
    values: np.ndarray,
    confidence: float = 0.95,
    num_bootstrap: int = 1000,
    seed: int = 12345,
) -> tuple[float, float]:
    """Compute a bootstrap confidence interval for the mean of `values`."""
    if values.size == 0:
        return (0.0, 0.0)
    if values.size == 1:
        v = float(values[0])
        return (v, v)

    rng = np.random.default_rng(seed)
    samples = rng.choice(values, size=(num_bootstrap, values.size), replace=True)
    means = samples.mean(axis=1)
    alpha = 1.0 - confidence
    low = float(np.quantile(means, alpha / 2.0))
    high = float(np.quantile(means, 1.0 - alpha / 2.0))
    return (low, high)
