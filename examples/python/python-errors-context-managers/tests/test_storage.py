from __future__ import annotations

import json
from pathlib import Path
import tempfile
import unittest

from safe_config.cli import main
from safe_config.errors import ConfigFormatError, ConfigNotFoundError
from safe_config.storage import atomic_text_writer, load_config, save_config


class ConfigStorageTests(unittest.TestCase):
    def test_save_and_load_round_trip(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "config.json"

            save_config(path, {"model": "gpt", "language": "中文"})

            self.assertEqual(load_config(path), {"language": "中文", "model": "gpt"})
            self.assertTrue(path.read_text(encoding="utf-8").endswith("\n"))

    def test_missing_file_is_translated_and_preserves_cause(self) -> None:
        path = Path("definitely-missing-config.json")

        with self.assertRaises(ConfigNotFoundError) as captured:
            load_config(path)

        self.assertIsInstance(captured.exception.__cause__, FileNotFoundError)

    def test_invalid_json_reports_location_and_preserves_cause(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "broken.json"
            path.write_text('{"port": }', encoding="utf-8")

            with self.assertRaises(ConfigFormatError) as captured:
                load_config(path)

        self.assertIsInstance(captured.exception.__cause__, json.JSONDecodeError)
        self.assertIn("line 1", str(captured.exception))

    def test_wrong_shape_is_a_domain_format_error(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "list.json"
            path.write_text('["not", "an", "object"]', encoding="utf-8")

            with self.assertRaises(ConfigFormatError):
                load_config(path)

    def test_failed_atomic_write_preserves_old_file_and_removes_temp(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "config.json"
            path.write_text('{"stable": true}\n', encoding="utf-8")

            with self.assertRaisesRegex(RuntimeError, "simulated failure"):
                with atomic_text_writer(path) as stream:
                    stream.write('{"partial":')
                    raise RuntimeError("simulated failure")

            self.assertEqual(path.read_text(encoding="utf-8"), '{"stable": true}\n')
            self.assertEqual(list(Path(directory).glob(".config.json.*.tmp")), [])

    def test_cli_returns_nonzero_and_writes_error_to_stderr(self) -> None:
        from contextlib import redirect_stderr
        from io import StringIO

        errors = StringIO()
        with redirect_stderr(errors):
            status = main(["missing.json"])

        self.assertEqual(status, 2)
        self.assertIn("config error:", errors.getvalue())


if __name__ == "__main__":
    unittest.main()
