"""Public API and installed-distribution metadata."""

from importlib.metadata import PackageNotFoundError, version

try:
    __version__ = version("learning-backend-config")
except PackageNotFoundError:
    __version__ = "0+uninstalled"

from .service import build_config

__all__ = ["build_config"]
