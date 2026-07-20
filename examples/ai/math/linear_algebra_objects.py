"""Build basic linear-algebra operations with Python lists.

This example favors transparent shape checks over performance. NumPy and
PyTorch should be used for real numerical workloads.
"""

from collections.abc import Sequence
from numbers import Real
from typing import TypeAlias


Vector: TypeAlias = list[float]
Matrix: TypeAlias = list[Vector]
Shape: TypeAlias = tuple[int, ...]


def shape(data: object) -> Shape:
    """Infer the shape of a scalar or a non-empty, regular nested sequence."""
    if isinstance(data, Real):
        return ()
    if isinstance(data, (str, bytes)) or not isinstance(data, Sequence):
        raise TypeError("tensor data must contain only numbers or sequences")
    if not data:
        return (0,)

    child_shapes = [shape(item) for item in data]
    first_shape = child_shapes[0]
    if any(child_shape != first_shape for child_shape in child_shapes[1:]):
        raise ValueError("nested sequences must form a regular shape")
    return (len(data), *first_shape)


def dot(left: Sequence[float], right: Sequence[float]) -> float:
    """Return the dot product of two equally sized vectors."""
    if len(left) != len(right):
        raise ValueError("vectors must have the same length")
    return sum(a * b for a, b in zip(left, right))


def matrix_vector(
    matrix: Sequence[Sequence[float]], vector: Sequence[float]
) -> Vector:
    """Multiply an (output, input) weight matrix by an input vector."""
    if not matrix:
        raise ValueError("matrix must contain at least one row")
    if any(len(row) != len(vector) for row in matrix):
        raise ValueError("every matrix row must match the vector length")
    return [dot(row, vector) for row in matrix]


def add_vectors(left: Sequence[float], right: Sequence[float]) -> Vector:
    """Add two vectors element by element."""
    if len(left) != len(right):
        raise ValueError("vectors must have the same length")
    return [a + b for a, b in zip(left, right)]


def linear_layer(weights: Matrix, inputs: Vector, bias: Vector) -> Vector:
    """Compute y = W x + b for one sample."""
    weighted_inputs = matrix_vector(weights, inputs)
    return add_vectors(weighted_inputs, bias)


def main() -> None:
    # x has three features: study hours, completed chapters, quiz score.
    inputs = [4.5, 6.0, 82.0]

    # Each row produces one output score, so W has shape (2, 3).
    weights = [
        [0.8, 0.3, 0.02],
        [-0.4, 0.1, 0.01],
    ]
    bias = [-1.0, 0.5]

    outputs = linear_layer(weights, inputs, bias)

    print(f"scalar shape: {shape(0.001)}")
    print(f"vector shape: {shape(inputs)}")
    print(f"matrix shape: {shape(weights)}")
    print(f"tensor shape: {shape([weights, weights])}")
    print(f"first dot product: {dot(weights[0], inputs):.2f}")
    print(f"linear outputs: {[round(value, 2) for value in outputs]}")


if __name__ == "__main__":
    main()
