"""Compare a hand-written rule with a threshold learned from labelled data."""

from collections.abc import Iterable, Sequence


TrainingExample = tuple[float, int]


def predict_with_rule(hours: float) -> int:
    """A person chooses the threshold directly."""
    return int(hours >= 6.0)


def candidate_thresholds(values: Iterable[float]) -> list[float]:
    """Return thresholds before, between, and after the observed values."""
    unique_values = sorted(set(values))
    if not unique_values:
        raise ValueError("at least one training example is required")

    thresholds = [unique_values[0] - 1.0]
    thresholds.extend(
        (left + right) / 2
        for left, right in zip(unique_values, unique_values[1:])
    )
    thresholds.append(unique_values[-1] + 1.0)
    return thresholds


def learn_threshold(examples: Sequence[TrainingExample]) -> float:
    """Choose the threshold with the fewest training classification errors."""
    if not examples:
        raise ValueError("at least one training example is required")

    def error_count(threshold: float) -> int:
        return sum(int(hours >= threshold) != label for hours, label in examples)

    return min(
        candidate_thresholds(hours for hours, _ in examples),
        key=lambda threshold: (error_count(threshold), threshold),
    )


def predict_with_model(hours: float, threshold: float) -> int:
    """Use the parameter selected during training for inference."""
    return int(hours >= threshold)


def main() -> None:
    training_data: list[TrainingExample] = [
        (1.0, 0),
        (2.5, 0),
        (4.0, 0),
        (5.5, 1),
        (7.0, 1),
        (8.0, 1),
    ]

    learned_threshold = learn_threshold(training_data)
    print(f"Hand-written threshold: 6.00 hours")
    print(f"Learned threshold:      {learned_threshold:.2f} hours")

    for hours in (3.0, 5.7, 7.5):
        rule_prediction = predict_with_rule(hours)
        model_prediction = predict_with_model(hours, learned_threshold)
        print(
            f"hours={hours:>3.1f} | "
            f"rule={rule_prediction} | model={model_prediction}"
        )


if __name__ == "__main__":
    main()
