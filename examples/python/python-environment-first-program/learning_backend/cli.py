"""Command-line adapter for the first Python program."""

from __future__ import annotations

import argparse
from collections.abc import Sequence

from .greeting import build_greeting


def create_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="python -m learning_backend",
        description="输出一条经过校验的学习问候语。",
    )
    parser.add_argument("--name", required=True, help="学习者姓名")
    parser.add_argument("--topic", default="Python 后端", help="当前学习主题")
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    parser = create_parser()
    arguments = parser.parse_args(argv)

    try:
        message = build_greeting(arguments.name, arguments.topic)
    except ValueError as error:
        parser.error(str(error))

    print(message)
    return 0
