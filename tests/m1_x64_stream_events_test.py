import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location(
    "m1_x64_local_api", Path(__file__).with_name("m1-x64-local-api.py")
)
probe = importlib.util.module_from_spec(spec)
spec.loader.exec_module(probe)


class StreamEventsTest(unittest.TestCase):
    def test_ui_invalidation_is_optional_and_may_follow_init(self):
        init = {"type": "system", "subtype": "init"}
        invalidation = {"type": "system", "subtype": "ui_invalidate", "event": "ui.render"}
        result = {"type": "result", "subtype": "success"}
        self.assertEqual(probe.validate_stream_events([init, result]), 0)
        self.assertEqual(probe.validate_stream_events([invalidation, init, result]), 1)
        self.assertEqual(probe.validate_stream_events([init, invalidation, result]), 1)

    def test_missing_init_and_malformed_invalidation_fail(self):
        with self.assertRaises(AssertionError):
            probe.validate_stream_events([{"type": "result"}])
        with self.assertRaises(AssertionError):
            probe.validate_stream_events([
                {"type": "system", "subtype": "init"},
                {"type": "system", "subtype": "ui_invalidate", "event": "bad"},
                {"type": "result"},
            ])


if __name__ == "__main__":
    unittest.main()
