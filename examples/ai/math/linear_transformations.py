"""Explore linear combinations, affine maps, and matrix composition."""

from collections.abc import Sequence
from math import isclose
from typing import TypeAlias


Vector: TypeAlias = list[float]
Matrix: TypeAlias = list[Vector]


def add(left: Sequence[float], right: Sequence[float]) -> Vector:
    if len(left) != len(right):
        raise ValueError("vectors must have the same length")
    return [a + b for a, b in zip(left, right)]


def scale(scalar: float, vector: Sequence[float]) -> Vector:
    return [scalar * value for value in vector]


def dot(left: Sequence[float], right: Sequence[float]) -> float:
    if len(left) != len(right):
        raise ValueError("vectors must have the same length")
    return sum(a * b for a, b in zip(left, right))


def validate_matrix(matrix: Sequence[Sequence[float]]) -> tuple[int, int]:
    if not matrix or not matrix[0]:
        raise ValueError("matrix must be non-empty")
    column_count = len(matrix[0])
    if any(len(row) != column_count for row in matrix):
        raise ValueError("matrix rows must have equal length")
    return len(matrix), column_count


def transform(matrix: Matrix, vector: Sequence[float]) -> Vector:
    _, column_count = validate_matrix(matrix)
    if column_count != len(vector):
        raise ValueError("matrix columns must match vector length")
    return [dot(row, vector) for row in matrix]


def transpose(matrix: Matrix) -> Matrix:
    validate_matrix(matrix)
    return [list(column) for column in zip(*matrix)]


def matrix_multiply(left: Matrix, right: Matrix) -> Matrix:
    _, left_columns = validate_matrix(left)
    right_rows, _ = validate_matrix(right)
    if left_columns != right_rows:
        raise ValueError("inner matrix dimensions must match")
    right_columns = transpose(right)
    return [[dot(row, column) for column in right_columns] for row in left]


def column_combination(matrix: Matrix, coefficients: Sequence[float]) -> Vector:
    """Combine matrix columns using the given coefficients."""
    columns = transpose(matrix)
    if len(columns) != len(coefficients):
        raise ValueError("one coefficient is required for each matrix column")

    result = [0.0] * len(columns[0])
    for coefficient, column in zip(coefficients, columns):
        result = add(result, scale(coefficient, column))
    return result


def affine(matrix: Matrix, vector: Sequence[float], bias: Sequence[float]) -> Vector:
    return add(transform(matrix, vector), bias)


def close(left: Sequence[float], right: Sequence[float]) -> bool:
    return len(left) == len(right) and all(
        isclose(a, b, rel_tol=1e-9, abs_tol=1e-9)
        for a, b in zip(left, right)
    )


def main() -> None:
    matrix = [[2.0, 1.0], [1.0, 2.0]]
    vector = [3.0, 4.0]

    row_view = transform(matrix, vector)
    column_view = column_combination(matrix, vector)
    assert close(row_view, column_view)
    print(f"A x by row dot products:   {row_view}")
    print(f"A x by column combination: {column_view}")

    u = [1.0, 2.0]
    v = [3.0, -1.0]
    alpha, beta = 2.0, -0.5
    combined_input = add(scale(alpha, u), scale(beta, v))
    left = transform(matrix, combined_input)
    right = add(
        scale(alpha, transform(matrix, u)),
        scale(beta, transform(matrix, v)),
    )
    assert close(left, right)
    print(f"linearity check:            {left} == {right}")

    zero = [0.0, 0.0]
    bias = [1.0, -2.0]
    print(f"linear map sends 0 to:      {transform(matrix, zero)}")
    print(f"affine map sends 0 to:      {affine(matrix, zero, bias)}")

    scale_matrix = [[2.0, 0.0], [0.0, 0.5]]
    shear_matrix = [[1.0, 1.0], [0.0, 1.0]]
    point = [2.0, 4.0]

    sequential = transform(shear_matrix, transform(scale_matrix, point))
    composed_matrix = matrix_multiply(shear_matrix, scale_matrix)
    composed = transform(composed_matrix, point)
    assert close(sequential, composed)
    print(f"scale then shear:           {composed}")

    reversed_matrix = matrix_multiply(scale_matrix, shear_matrix)
    reversed_result = transform(reversed_matrix, point)
    print(f"shear then scale:           {reversed_result}")
    assert not close(composed, reversed_result)


if __name__ == "__main__":
    main()
