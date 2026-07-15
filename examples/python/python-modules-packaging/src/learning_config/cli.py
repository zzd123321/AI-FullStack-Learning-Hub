"""Console entry point installed from project.scripts."""

from __future__ import annotations

import argparse
import json
from collections.abc import Sequence

from . import __version__
from .plugin_loader import load_transformer
from .service import build_config


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="learning-config")
    parser.add_argument("--environment")
    parser.add_argument(
        "--plugin",
        default="learning_config.plugins.uppercase",
        help="Fully qualified module exposing transform(value)",
    )
    arguments = parser.parse_args(argv)

    overrides = (
        {"environment": arguments.environment}
        if arguments.environment is not None
        else None
    )
    config = build_config(overrides)
    transform = load_transformer(arguments.plugin)
    config["service_name"] = transform(config["service_name"])
    output = {"distribution_version": __version__, "config": config}
    print(json.dumps(output, ensure_ascii=False, indent=2, sort_keys=True))
    return 0
