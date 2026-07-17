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
    # argv 可由测试显式传入；生产运行时传 None，argparse 会读取 sys.argv。
    parser = create_parser()
    arguments = parser.parse_args(argv)

    try:
        # CLI 只做输入/输出适配，真正的业务校验留在可独立测试的函数中。
        message = build_greeting(arguments.name, arguments.topic)
    except ValueError as error:
        parser.error(str(error))

    print(message)
    # 返回值由 __main__ 转成进程退出状态；0 表示程序正常完成。
    return 0
