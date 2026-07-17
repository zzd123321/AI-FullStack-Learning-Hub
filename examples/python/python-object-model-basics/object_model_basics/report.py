"""Print deterministic demonstrations of core object-model behavior."""

from __future__ import annotations

import json
from typing import Any

from .quote import build_quote


def build_report() -> dict[str, Any]:
    original = ["Python"]
    # 赋值只增加一个指向同一 list 的名称，不会复制 list。
    alias = original
    # copy 创建新的外层 list；其中元素引用仍会被共享。
    shallow_copy = original.copy()
    alias.append("FastAPI")

    nested = [["shared"]]
    nested_copy = nested.copy()
    nested_copy[0].append("still shared")

    number = 10
    previous_number = number
    # int 不可变，+= 产生新整数并让 number 重新绑定，previous_number 仍指向 10。
    number += 1

    return {
        "same_list_identity": original is alias,
        "copy_has_different_identity": original is not shallow_copy,
        "alias_observes_mutation": original,
        "copy_does_not_observe_later_append": shallow_copy,
        "shallow_copy_shares_nested_item": nested == nested_copy,
        "integer_rebinding": {"before": previous_number, "after": number},
        "and_returns_operand": "ready" and {"status": "ok"},
        "or_returns_operand": "" or "fallback",
        "none_is_singleton": None is None,
        "negative_floor_division": -7 // 3,
        "quote": build_quote(1_299, 2, [" new ", "", "member"]),
    }


def main() -> int:
    print(json.dumps(build_report(), ensure_ascii=False, indent=2))
    return 0
