"""Load packaged defaults without depending on the process working directory."""

from __future__ import annotations

import json
from importlib.resources import files
from typing import TypeAlias

Config: TypeAlias = dict[str, str]


def load_defaults() -> Config:
    resource = files("learning_config").joinpath("defaults.json")
    data = json.loads(resource.read_text(encoding="utf-8"))
    if not isinstance(data, dict) or not all(
        isinstance(key, str) and isinstance(value, str)
        for key, value in data.items()
    ):
        raise ValueError("packaged defaults must be a string-to-string object")
    return data


def build_config(overrides: Config | None = None) -> Config:
    config = load_defaults()
    if overrides is not None:
        config.update(overrides)
    return config
