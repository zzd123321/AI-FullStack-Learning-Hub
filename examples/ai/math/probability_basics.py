"""Discrete probability, Bayes' rule, and reproducible simulation."""

from collections.abc import Mapping
from random import Random


Distribution = Mapping[int, float]


def validate_pmf(pmf: Distribution) -> None:
    if not pmf or any(probability < 0.0 for probability in pmf.values()):
        raise ValueError("PMF probabilities must be non-negative")
    if abs(sum(pmf.values()) - 1.0) > 1e-12:
        raise ValueError("PMF probabilities must sum to 1")


def expectation(pmf: Distribution) -> float:
    validate_pmf(pmf)
    return sum(value * probability for value, probability in pmf.items())


def variance(pmf: Distribution) -> float:
    mean = expectation(pmf)
    return sum(
        (value - mean) ** 2 * probability
        for value, probability in pmf.items()
    )


def cdf(pmf: Distribution, threshold: int) -> float:
    validate_pmf(pmf)
    return sum(
        probability
        for value, probability in pmf.items()
        if value <= threshold
    )


def bayes_posterior(
    prior: float, sensitivity: float, false_positive_rate: float
) -> float:
    positive_probability = (
        sensitivity * prior + false_positive_rate * (1.0 - prior)
    )
    if positive_probability == 0.0:
        raise ValueError("the conditioning event has zero probability")
    return sensitivity * prior / positive_probability


def empirical_head_frequency(trials: int, seed: int = 42) -> float:
    if trials <= 0:
        raise ValueError("trials must be positive")
    rng = Random(seed)
    heads = sum(rng.random() < 0.5 for _ in range(trials))
    return heads / trials


def main() -> None:
    heads_in_two_tosses = {0: 0.25, 1: 0.50, 2: 0.25}
    print(f"expectation: {expectation(heads_in_two_tosses):.2f}")
    print(f"variance:    {variance(heads_in_two_tosses):.2f}")
    print(f"P(X <= 1):  {cdf(heads_in_two_tosses, 1):.2f}")

    posterior = bayes_posterior(
        prior=0.01,
        sensitivity=0.90,
        false_positive_rate=0.05,
    )
    print(f"P(condition | positive): {posterior:.2%}")

    for trials in (100, 10_000, 1_000_000):
        frequency = empirical_head_frequency(trials)
        print(f"heads in {trials:>9,} trials: {frequency:.4f}")


if __name__ == "__main__":
    main()
