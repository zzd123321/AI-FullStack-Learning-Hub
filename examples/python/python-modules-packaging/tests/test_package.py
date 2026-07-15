from __future__ import annotations

import importlib
import json
import subprocess
import sys
import unittest
from pathlib import Path

import learning_config
from learning_config.plugin_loader import load_transformer
from learning_config.service import build_config, load_defaults


class InstalledPackageTest(unittest.TestCase):
    def test_public_package_api(self) -> None:
        self.assertEqual(learning_config.__all__, ["build_config"])
        self.assertEqual(build_config({"environment": "test"})["environment"], "test")

    def test_resource_loading_does_not_depend_on_working_directory(self) -> None:
        previous = Path.cwd()
        try:
            import os
            os.chdir(previous.parent)
            self.assertEqual(load_defaults()["service_name"], "learning-api")
        finally:
            os.chdir(previous)

    def test_import_cache_returns_same_module_object(self) -> None:
        first = importlib.import_module("learning_config.service")
        second = importlib.import_module("learning_config.service")
        self.assertIs(first, second)
        self.assertIs(first, sys.modules["learning_config.service"])

    def test_dynamic_plugin_loading(self) -> None:
        transform = load_transformer("learning_config.plugins.uppercase")
        self.assertEqual(transform("learning-api"), "LEARNING-API")

    def test_module_entry_point_works_outside_source_directory(self) -> None:
        completed = subprocess.run(
            [sys.executable, "-m", "learning_config", "--environment", "test"],
            cwd=Path.cwd().parent,
            check=False,
            capture_output=True,
            text=True,
        )
        self.assertEqual(completed.returncode, 0, completed.stderr)
        output = json.loads(completed.stdout)
        self.assertIn(output["distribution_version"], {"0.1.0", "0+uninstalled"})
        self.assertEqual(output["config"]["environment"], "test")


if __name__ == "__main__":
    unittest.main()
