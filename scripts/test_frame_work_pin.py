import importlib.util
from pathlib import Path
import unittest

class PinTests(unittest.TestCase):
    def test_lowest_load_distinct_physical_cores(self):
        path = Path(__file__).with_name('frame-work-pin.py')
        self.assertTrue(path.exists(), 'pin wrapper must exist')
        spec = importlib.util.spec_from_file_location('pin', path)
        assert spec is not None and spec.loader is not None
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        self.assertEqual(mod.choose([(0.1, 0), (0.11, 10), (0.2, 2), (0.3, 3)], {0: 0, 10: 0, 2: 2, 3: 3}, 2), [0, 2])

if __name__ == '__main__':
    unittest.main()
