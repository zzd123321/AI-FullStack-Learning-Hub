"""Load a plugin module dynamically by its fully qualified module name."""

from __future__ import annotations

from collections.abc import Callable
from importlib import import_module

Transformer = Callable[[str], str]


def load_transformer(module_name: str) -> Transformer:
    # import_module 使用完整模块名走正常 import 机制，并复用 sys.modules 缓存。
    module = import_module(module_name)
    # 外部插件属于不可信边界：成功 import 不代表它提供了约定能力。
    transform = getattr(module, "transform", None)
    if not callable(transform):
        raise TypeError(f"{module_name} must expose a callable named transform")
    return transform
