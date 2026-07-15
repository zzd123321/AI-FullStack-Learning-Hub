"""Load a plugin module dynamically by its fully qualified module name."""

from __future__ import annotations

from collections.abc import Callable
from importlib import import_module

Transformer = Callable[[str], str]


def load_transformer(module_name: str) -> Transformer:
    module = import_module(module_name)
    transform = getattr(module, "transform", None)
    if not callable(transform):
        raise TypeError(f"{module_name} must expose a callable named transform")
    return transform
