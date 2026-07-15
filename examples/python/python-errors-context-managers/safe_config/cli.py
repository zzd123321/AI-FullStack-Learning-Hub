"""Command-line boundary for reading configuration."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys
from collections.abc import Sequence

from .errors import ConfigError
from .storage import load_config


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Read a safe-config JSON file")
    parser.add_argument("path", type=Path)
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        config = load_config(args.path)
    except ConfigError as error:
        print(f"config error: {error}", file=sys.stderr)
        return 2

    print(json.dumps(config, ensure_ascii=False, sort_keys=True))
    return 0
