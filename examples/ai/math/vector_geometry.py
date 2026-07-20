"""Explore norms, distances, projections, and cosine similarity."""

from collections.abc import Sequence
from math import inf, isclose, sqrt
from typing import TypeAlias


Vector: TypeAlias = list[float]
EPSILON = 1e-12


def require_same_length(left: Sequence[float], right: Sequence[float]) -> None:
    if len(left) != len(right):
        raise ValueError("vectors must have the same length")


def dot(left: Sequence[float], right: Sequence[float]) -> float:
    require_same_length(left, right)
    return sum(a * b for a, b in zip(left, right))


def subtract(left: Sequence[float], right: Sequence[float]) -> Vector:
    require_same_length(left, right)
    return [a - b for a, b in zip(left, right)]


def scale(scalar: float, vector: Sequence[float]) -> Vector:
    return [scalar * value for value in vector]


def lp_norm(vector: Sequence[float], p: float = 2.0) -> float:
    if p == inf:
        return max((abs(value) for value in vector), default=0.0)
    if p < 1.0:
        raise ValueError("p must be at least 1 for an Lp norm")
    return sum(abs(value) ** p for value in vector) ** (1.0 / p)


def l2_norm(vector: Sequence[float]) -> float:
    return sqrt(dot(vector, vector))


def distance(
    left: Sequence[float], right: Sequence[float], p: float = 2.0
) -> float:
    return lp_norm(subtract(left, right), p)


def normalize(vector: Sequence[float]) -> Vector:
    length = l2_norm(vector)
    if length <= EPSILON:
        raise ValueError("cannot normalize a zero or near-zero vector")
    return scale(1.0 / length, vector)


def clamp(value: float, lower: float, upper: float) -> float:
    return min(max(value, lower), upper)


def cosine_similarity(left: Sequence[float], right: Sequence[float]) -> float:
    left_norm = l2_norm(left)
    right_norm = l2_norm(right)
    if left_norm <= EPSILON or right_norm <= EPSILON:
        raise ValueError("cosine similarity is undefined for a zero vector")
    return clamp(dot(left, right) / (left_norm * right_norm), -1.0, 1.0)


def project(vector: Sequence[float], direction: Sequence[float]) -> Vector:
    denominator = dot(direction, direction)
    if denominator <= EPSILON * EPSILON:
        raise ValueError("projection direction must be non-zero")
    return scale(dot(vector, direction) / denominator, direction)


def scaled_dot_score(
    query: Sequence[float], key: Sequence[float]
) -> float:
    require_same_length(query, key)
    if not query:
        raise ValueError("query and key must be non-empty")
    return dot(query, key) / sqrt(len(query))


def rank_by_cosine(
    query: Sequence[float], items: Sequence[tuple[str, Vector]]
) -> list[tuple[str, float]]:
    scored = [
        (label, cosine_similarity(query, embedding))
        for label, embedding in items
    ]
    return sorted(scored, key=lambda item: item[1], reverse=True)


def main() -> None:
    vector = [3.0, -4.0]
    print(f"L1 norm:   {lp_norm(vector, 1.0):.2f}")
    print(f"L2 norm:   {lp_norm(vector, 2.0):.2f}")
    print(f"L∞ norm:   {lp_norm(vector, inf):.2f}")

    x = [3.0, 4.0]
    direction = [1.0, 1.0]
    projected = project(x, direction)
    residual = subtract(x, projected)
    assert isclose(dot(residual, direction), 0.0, abs_tol=1e-12)
    print(f"projection: {projected}")
    print(f"residual:   {residual}")

    left = normalize([2.0, 1.0, 0.0])
    right = normalize([1.0, 2.0, 0.0])
    cosine = cosine_similarity(left, right)
    squared_euclidean = distance(left, right) ** 2
    assert isclose(dot(left, right), cosine)
    assert isclose(squared_euclidean, 2.0 - 2.0 * cosine)
    print(f"normalized cosine:          {cosine:.4f}")
    print(f"normalized squared L2:      {squared_euclidean:.4f}")

    embeddings = [
        ("Python 教程", [1.0, 0.1, 0.0]),
        ("数据库索引", [0.8, 0.3, 0.0]),
        ("烹饪方法", [0.0, 0.1, 1.0]),
    ]
    query = [0.9, 0.2, 0.0]
    print("cosine ranking:")
    for label, score in rank_by_cosine(query, embeddings):
        print(f"  {score:.4f}  {label}")

    attention_query = [2.0, 0.0]
    attention_key = [3.0, 0.0]
    print(
        "scaled dot vs cosine: "
        f"{scaled_dot_score(attention_query, attention_key):.4f} vs "
        f"{cosine_similarity(attention_query, attention_key):.4f}"
    )


if __name__ == "__main__":
    main()
