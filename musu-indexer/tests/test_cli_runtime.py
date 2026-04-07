import importlib
import unittest


class CliRuntimeTests(unittest.TestCase):
    def test_cli_module_imports_without_mcp_runtime(self):
        module = importlib.import_module("musu_indexer.cli")
        self.assertTrue(callable(module.main))


if __name__ == "__main__":
    unittest.main()
