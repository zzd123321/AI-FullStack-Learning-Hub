"""Allow the package to run with ``python -m learning_backend``."""

from .cli import main

if __name__ == "__main__":
    raise SystemExit(main())
