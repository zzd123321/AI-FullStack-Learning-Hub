"""Print the runtime facts that are often confused with one another."""

from __future__ import annotations

import json
import platform
import sys


def runtime_facts() -> dict[str, object]:
    return {
        "implementation": platform.python_implementation(),
        "version": platform.python_version(),
        "executable": sys.executable,
        "prefix": sys.prefix,
        "base_prefix": sys.base_prefix,
        "in_virtual_environment": sys.prefix != sys.base_prefix,
        "bytecode_cache_tag": sys.implementation.cache_tag,
        "module_name": __name__,
    }


if __name__ == "__main__":
    print(json.dumps(runtime_facts(), ensure_ascii=False, indent=2))
