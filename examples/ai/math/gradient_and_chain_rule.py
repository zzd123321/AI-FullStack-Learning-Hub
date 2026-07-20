"""Compare analytic gradients with finite differences and optimize a loss."""


def loss(w: float, b: float, x: float, target: float) -> float:
    prediction = w * x + b
    return (prediction - target) ** 2


def analytic_gradient(
    w: float, b: float, x: float, target: float
) -> tuple[float, float]:
    error = w * x + b - target
    upstream = 2.0 * error
    return upstream * x, upstream


def numerical_gradient(
    w: float, b: float, x: float, target: float, h: float = 1e-5
) -> tuple[float, float]:
    dw = (
        loss(w + h, b, x, target) - loss(w - h, b, x, target)
    ) / (2.0 * h)
    db = (
        loss(w, b + h, x, target) - loss(w, b - h, x, target)
    ) / (2.0 * h)
    return dw, db


def main() -> None:
    w, b = 0.5, -1.0
    x, target = 2.0, 5.0

    analytic = analytic_gradient(w, b, x, target)
    numerical = numerical_gradient(w, b, x, target)
    assert all(abs(a - n) < 1e-8 for a, n in zip(analytic, numerical))
    print(f"analytic gradient:  {analytic}")
    print(f"numerical gradient: {numerical}")

    learning_rate = 0.05
    initial_loss = loss(w, b, x, target)
    for _ in range(20):
        dw, db = analytic_gradient(w, b, x, target)
        w -= learning_rate * dw
        b -= learning_rate * db
    final_loss = loss(w, b, x, target)
    assert final_loss < initial_loss
    print(f"loss: {initial_loss:.6f} -> {final_loss:.6f}")
    print(f"parameters: w={w:.6f}, b={b:.6f}")


if __name__ == "__main__":
    main()
