"""317原版PTY重试阶段动画比较的可复现反例和正例。"""
import importlib.util
import pathlib
import unittest

script = pathlib.Path(__file__).with_name("m1-x64-conversation-ui-scenarios.py")
spec = importlib.util.spec_from_file_location("m1_x64_conversation_ui_scenarios", script)
probe = importlib.util.module_from_spec(spec)
spec.loader.exec_module(probe)


class RetryPhaseGlyphsTest(unittest.TestCase):
    def test_pre_retry_frame_does_not_look_like_retry_animation(self):
        official = {"frames": [
            {"glyph": "✢", "screen_rows": ["✢ Noodling…"]},
            {"glyph": None, "screen_rows": ["✻ API error · Retrying in 2s · attempt 1/10"]},
        ]}
        rebuilt = {"frames": [
            {"glyph": None, "screen_rows": ["✻ API error · Retrying in 2s · attempt 1/10"]},
        ]}
        self.assertEqual(probe.retry_phase_glyphs(official), [])
        self.assertEqual(probe.retry_phase_glyphs(rebuilt), [])

    def test_glyph_during_actual_retry_still_fails_strict_comparison(self):
        official = {"frames": [
            {"glyph": "✢", "screen_rows": ["✢ Retrying in 2s · attempt 1/10"]},
        ]}
        rebuilt = {"frames": [
            {"glyph": "✻", "screen_rows": ["✻ Retrying in 2s · attempt 1/10"]},
        ]}
        self.assertNotEqual(probe.retry_phase_glyphs(official), probe.retry_phase_glyphs(rebuilt))


if __name__ == "__main__":
    unittest.main()
