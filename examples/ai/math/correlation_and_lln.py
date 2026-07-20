"""Explore covariance, correlation, nonlinear dependence, and the LLN."""

from collections.abc import Sequence
from math import sqrt
from random import Random


def mean(values: Sequence[float]) -> float:
    if not values:
        raise ValueError("values must be non-empty")
    return sum(values) / len(values)


def covariance(left: Sequence[float], right: Sequence[float]) -> float:
    if len(left) != len(right) or not left:
        raise ValueError("sequences must have the same positive length")
    left_mean, right_mean = mean(left), mean(right)
    return sum(
        (x - left_mean) * (y - right_mean)
        for x, y in zip(left, right)
    ) / len(left)


def correlation(left: Sequence[float], right: Sequence[float]) -> float:
    left_variance = covariance(left, left)
    right_variance = covariance(right, right)
    denominator = sqrt(left_variance * right_variance)
    if denominator <= 1e-12:
        raise ValueError("correlation is undefined for a constant variable")
    return covariance(left, right) / denominator


def bernoulli_mean(probability: float, trials: int, seed: int = 7) -> float:
    if not 0.0 <= probability <= 1.0 or trials <= 0:
        raise ValueError("invalid probability or trial count")
    rng = Random(seed)
    return sum(rng.random() < probability for _ in range(trials)) / trials


def main() -> None:
    x = [-2.0, -1.0, 0.0, 1.0, 2.0]
    y = [2.0 * value + 1.0 for value in x]
    scaled_y = [100.0 * value for value in y]

    print(f"cov(X, Y):      {covariance(x, y):.4f}")
    print(f"cov(X, 100Y):   {covariance(x, scaled_y):.4f}")
    print(f"corr(X, Y):     {correlation(x, y):.4f}")
    print(f"corr(X, 100Y):  {correlation(x, scaled_y):.4f}")

    symmetric_x = [-2.0, -1.0, 0.0, 1.0, 2.0]
    squared_x = [value**2 for value in symmetric_x]
    print(f"corr(X, X²):    {correlation(symmetric_x, squared_x):.4f}")

    probability = 0.3
    for trials in (10, 1_000, 100_000):
        estimate = bernoulli_mean(probability, trials)
        print(f"Bernoulli mean, n={trials:>7,}: {estimate:.4f}")


if __name__ == "__main__":
    main()
