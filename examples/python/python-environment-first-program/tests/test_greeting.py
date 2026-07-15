from __future__ import annotations

import subprocess
import sys
import unittest

from learning_backend.greeting import build_greeting


class GreetingTest(unittest.TestCase):
    def test_build_greeting_normalizes_surrounding_whitespace(self) -> None:
        result = build_greeting("  小明  ", " Python API ")
        self.assertEqual(result, "你好，小明！欢迎开始学习 Python API。")

    def test_build_greeting_uses_default_topic(self) -> None:
        self.assertEqual(
            build_greeting("小明"),
            "你好，小明！欢迎开始学习 Python 后端。",
        )

    def test_build_greeting_rejects_blank_name(self) -> None:
        with self.assertRaisesRegex(ValueError, "name must not be blank"):
            build_greeting("   ")

    def test_module_entry_point_returns_zero_on_success(self) -> None:
        completed = subprocess.run(
            [sys.executable, "-m", "learning_backend", "--name", "小明"],
            check=False,
            capture_output=True,
            text=True,
        )
        self.assertEqual(completed.returncode, 0)
        self.assertIn("你好，小明", completed.stdout)
        self.assertEqual(completed.stderr, "")

    def test_module_entry_point_returns_nonzero_for_invalid_input(self) -> None:
        completed = subprocess.run(
            [sys.executable, "-m", "learning_backend", "--name", "   "],
            check=False,
            capture_output=True,
            text=True,
        )
        self.assertEqual(completed.returncode, 2)
        self.assertIn("name must not be blank", completed.stderr)


if __name__ == "__main__":
    unittest.main()
