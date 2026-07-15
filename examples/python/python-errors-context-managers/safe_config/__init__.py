"""A tiny JSON configuration store with explicit error boundaries."""

from .errors import ConfigError, ConfigFormatError, ConfigNotFoundError, ConfigWriteError
from .storage import atomic_text_writer, load_config, save_config

__all__ = [
    "ConfigError",
    "ConfigFormatError",
    "ConfigNotFoundError",
    "ConfigWriteError",
    "atomic_text_writer",
    "load_config",
    "save_config",
]
