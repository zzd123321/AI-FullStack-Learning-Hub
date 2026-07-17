"""JSON loading and failure-safe persistence."""

from __future__ import annotations

from collections.abc import Iterator, Mapping
from contextlib import contextmanager
import json
import os
from pathlib import Path
import tempfile
from typing import TextIO

from .errors import ConfigError, ConfigFormatError, ConfigNotFoundError, ConfigWriteError


def _validated_copy(value: object) -> dict[str, str]:
    if not isinstance(value, dict):
        raise ConfigFormatError("configuration root must be a JSON object")

    invalid_keys = [key for key, item in value.items() if not isinstance(key, str) or not isinstance(item, str)]
    if invalid_keys:
        raise ConfigFormatError("every configuration key and value must be a string")

    return dict(value)


def load_config(path: Path) -> dict[str, str]:
    """Load a string-to-string JSON object and translate infrastructure errors."""
    try:
        # with 无论 json.load 成功还是抛异常都会关闭文件对象。
        with path.open("r", encoding="utf-8") as stream:
            value = json.load(stream)
    except FileNotFoundError as error:
        # 领域异常对调用方稳定，同时 from 保留底层异常与 traceback。
        raise ConfigNotFoundError(f"configuration does not exist: {path}") from error
    except json.JSONDecodeError as error:
        raise ConfigFormatError(
            f"invalid JSON in {path} at line {error.lineno}, column {error.colno}"
        ) from error
    except OSError as error:
        raise ConfigError(f"cannot read configuration {path}: {error}") from error

    return _validated_copy(value)


@contextmanager
def atomic_text_writer(target: Path) -> Iterator[TextIO]:
    """Yield a temporary stream, then atomically replace target on success.

    The temporary file is created in the target directory so that os.replace is
    performed on the same filesystem. If the with body fails, the old target is
    left untouched and the temporary file is removed.
    """
    # 临时文件必须与目标同目录，os.replace 才能在同一文件系统内原子替换。
    descriptor, temporary_name = tempfile.mkstemp(
        prefix=f".{target.name}.", suffix=".tmp", dir=target.parent, text=True
    )
    temporary_path = Path(temporary_name)

    try:
        try:
            stream = os.fdopen(descriptor, "w", encoding="utf-8", newline="\n")
        except BaseException:
            os.close(descriptor)
            raise

        with stream:
            yield stream
            # flush 把 Python 缓冲交给 OS，fsync 再请求 OS 把文件内容同步到底层设备。
            stream.flush()
            os.fsync(stream.fileno())

        # 只有 with 主体和同步全部成功，旧目标才被完整新文件替换。
        os.replace(temporary_path, target)
    except BaseException:
        temporary_path.unlink(missing_ok=True)
        raise


def save_config(path: Path, config: Mapping[str, str]) -> None:
    """Validate and persist a configuration without exposing partial JSON."""
    validated = _validated_copy(dict(config))

    try:
        with atomic_text_writer(path) as stream:
            json.dump(validated, stream, ensure_ascii=False, indent=2, sort_keys=True)
            stream.write("\n")
    except OSError as error:
        raise ConfigWriteError(f"cannot write configuration {path}: {error}") from error
