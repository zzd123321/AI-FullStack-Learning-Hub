"""A transparent two-dimensional PCA implementation for learning purposes."""

from collections.abc import Sequence
from math import isclose, sqrt
from typing import TypeAlias


Vector: TypeAlias = list[float]
Matrix: TypeAlias = list[Vector]


def dot(left: Sequence[float], right: Sequence[float]) -> float:
    if len(left) != len(right):
        raise ValueError("vectors must have the same length")
    return sum(a * b for a, b in zip(left, right))


def norm(vector: Sequence[float]) -> float:
    return sqrt(dot(vector, vector))


def normalize(vector: Sequence[float]) -> Vector:
    length = norm(vector)
    if length <= 1e-12:
        raise ValueError("cannot normalize a zero vector")
    return [value / length for value in vector]


def matrix_vector(matrix: Matrix, vector: Sequence[float]) -> Vector:
    if not matrix or any(len(row) != len(vector) for row in matrix):
        raise ValueError("matrix shape must match vector length")
    return [dot(row, vector) for row in matrix]


def column_mean(data: Matrix) -> Vector:
    if not data or not data[0]:
        raise ValueError("data must be non-empty")
    width = len(data[0])
    if any(len(row) != width for row in data):
        raise ValueError("data rows must have equal length")
    return [sum(row[j] for row in data) / len(data) for j in range(width)]


def center(data: Matrix, mean: Sequence[float]) -> Matrix:
    if any(len(row) != len(mean) for row in data):
        raise ValueError("mean length must match every row")
    return [[value - mean[j] for j, value in enumerate(row)] for row in data]


def sample_covariance(centered: Matrix) -> Matrix:
    if len(centered) < 2:
        raise ValueError("sample covariance needs at least two rows")
    width = len(centered[0])
    if width == 0 or any(len(row) != width for row in centered):
        raise ValueError("centered data must have a regular non-empty shape")
    denominator = len(centered) - 1
    return [
        [
            sum(row[i] * row[j] for row in centered) / denominator
            for j in range(width)
        ]
        for i in range(width)
    ]


def power_iteration(
    matrix: Matrix, initial: Vector, iterations: int = 100
) -> tuple[float, Vector]:
    vector = normalize(initial)
    for _ in range(iterations):
        vector = normalize(matrix_vector(matrix, vector))
    eigenvalue = dot(vector, matrix_vector(matrix, vector))
    return eigenvalue, vector


def project(centered: Matrix, component: Sequence[float]) -> Vector:
    return [dot(row, component) for row in centered]


def reconstruct(
    scores: Sequence[float], component: Sequence[float], mean: Sequence[float]
) -> Matrix:
    return [
        [mean[j] + score * component[j] for j in range(len(mean))]
        for score in scores
    ]


def mean_squared_error(actual: Matrix, predicted: Matrix) -> float:
    if len(actual) != len(predicted) or not actual:
        raise ValueError("matrices must have the same non-empty shape")
    squared_errors = [
        (value - predicted[i][j]) ** 2
        for i, row in enumerate(actual)
        for j, value in enumerate(row)
    ]
    return sum(squared_errors) / len(squared_errors)


def main() -> None:
    data = [
        [2.0, 1.0],
        [3.0, 2.0],
        [4.0, 3.2],
        [5.0, 3.8],
        [6.0, 5.1],
        [7.0, 5.9],
    ]

    mean = column_mean(data)
    centered = center(data, mean)
    covariance = sample_covariance(centered)

    first_value, first_component = power_iteration(
        covariance, initial=[1.0, 0.0]
    )
    second_component = [-first_component[1], first_component[0]]
    second_value = dot(
        second_component, matrix_vector(covariance, second_component)
    )

    scores = project(centered, first_component)
    reconstructed = reconstruct(scores, first_component, mean)
    explained_ratio = first_value / (first_value + second_value)

    transformed_first = matrix_vector(covariance, first_component)
    expected_first = [first_value * value for value in first_component]
    assert all(
        isclose(actual, expected, rel_tol=1e-9, abs_tol=1e-9)
        for actual, expected in zip(transformed_first, expected_first)
    )
    assert isclose(dot(first_component, second_component), 0.0, abs_tol=1e-12)

    print(f"mean:                 {[round(value, 4) for value in mean]}")
    print(f"covariance:           {covariance}")
    print(f"first eigenvalue:     {first_value:.6f}")
    print(
        "first component:      "
        f"{[round(value, 6) for value in first_component]}"
    )
    print(f"explained ratio:      {explained_ratio:.4%}")
    print(f"reconstruction MSE:   {mean_squared_error(data, reconstructed):.6f}")


if __name__ == "__main__":
    main()
