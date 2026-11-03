#!/usr/bin/env python3
"""Keep background title generation from consuming real-tool test steps."""
import importlib.util
import unittest
from types import SimpleNamespace
from pathlib import Path
import pyte

script = Path(__file__).with_name('m1-x64-conversation-ui-scenarios.py')
spec = importlib.util.spec_from_file_location('conversation_ui', script)
probe = importlib.util.module_from_spec(spec)
spec.loader.exec_module(probe)


class ConversationRequestRoutingTests(unittest.TestCase):
    def test_background_title_contains_marker_but_must_not_advance_tool_flow(self):
        request = {
            'messages': [{'role': 'user', 'content': [
                {'type': 'text', 'text': f'<session>{probe.PROMPT}</session>\nWrite a title'}
            ]}],
            'tools': [],
        }
        self.assertFalse(probe.is_main_conversation_request(request))

    def test_real_first_turn_exposes_read_tool(self):
        request = {
            'messages': [{'role': 'user', 'content': probe.PROMPT}],
            'tools': [{'name': 'Read'}, {'name': 'Bash'}],
        }
        self.assertTrue(probe.is_main_conversation_request(request))

    def test_tool_result_turn_remains_part_of_real_conversation(self):
        request = {
            'messages': [
                {'role': 'user', 'content': probe.PROMPT},
                {'role': 'assistant', 'content': [{'type': 'tool_use', 'name': 'Read'}]},
                {'role': 'user', 'content': [{'type': 'tool_result', 'content': probe.FIXTURE}]},
            ],
            'tools': [{'name': 'Read'}],
        }
        self.assertTrue(probe.is_main_conversation_request(request))

    def test_unrelated_tool_capable_background_request_is_not_a_turn(self):
        request = {
            'messages': [{'role': 'user', 'content': 'unrelated background request'}],
            'tools': [{'name': 'Read'}],
        }
        self.assertFalse(probe.is_main_conversation_request(request))


class TerminalScreenUnicodeTests(unittest.TestCase):
    def test_empty_character_cell_and_chinese_wide_character(self):
        screen = pyte.Screen(6, 2)
        screen.buffer[0][0] = SimpleNamespace(data='')
        screen.buffer[0][1] = SimpleNamespace(data='你')
        screen.buffer[0][2] = SimpleNamespace(data='')
        screen.buffer[0][3] = SimpleNamespace(data='好')
        screen.buffer[0][4] = SimpleNamespace(data='')
        self.assertEqual(probe.screen_rows(screen)[0].strip(), '你好')

    def test_ordinary_screen_preserves_existing_text(self):
        screen = pyte.Screen(12, 2)
        stream = pyte.Stream(screen)
        stream.feed('SUCCESS')
        self.assertEqual(probe.screen_rows(screen)[0].rstrip(), 'SUCCESS')


class TerminalParityAssertions(unittest.TestCase):
    def test_core_transcript_anchors_preserve_relative_layout(self):
        screen = pyte.Screen(80, 12)
        pyte.Stream(screen).feed('❯ UI_REAL_PTY_PROMPT\r\n  Read 1 file\r\n● UI_TOOL_COMPLETE_OK\r\n✻ Worked for 3s')
        actual = probe.terminal_anchors(screen, probe.TOOL_RESULT, 'tool')
        self.assertEqual(set(actual), {'user', 'tool', 'assistant', 'completed'})
        matching = {'terminal_anchors': actual}
        self.assertTrue(probe.compare_core_layout(matching, matching, 'tool')['passed'])
        shifted = {k: dict(v) for k, v in actual.items()}
        shifted['completed']['row'] += 1
        self.assertFalse(probe.compare_core_layout(matching, {'terminal_anchors': shifted}, 'tool')['passed'])

    def test_retry_screen_comparison_keeps_error_label_and_ignores_live_seconds(self):
        first = {'frames': [{'screen_rows': ['✻ API error · Retrying in 2s · attempt 1/10']}]}
        later = {'frames': [{'screen_rows': ['✻ API error · Retrying in 1s · attempt 1/10']}]}
        wrong = {'frames': [{'screen_rows': ['✻ 429 error · Retrying in 1s · attempt 1/10']}]}
        self.assertEqual(probe.normalize_retry_status_frame(first), probe.normalize_retry_status_frame(later))
        self.assertNotEqual(probe.normalize_retry_status_frame(first), probe.normalize_retry_status_frame(wrong))

    def test_spinner_glyph_comes_from_animation_row_not_footer(self):
        lines = [
            '✶ 正在处理… (1s · ↓ 20 tokens)',
            '  ⏵⏵ 自动模式开启 · esc 中断',
        ]
        self.assertEqual(probe.active_spinner_glyph(lines), '✶')
        self.assertIsNone(probe.active_spinner_glyph(['◐ medium · /effort']))
        self.assertIsNone(probe.active_spinner_glyph(['✻ API error · Retrying in 2s']))

    def test_timed_frame_comparison_reports_differences(self):
        official = {'frames': [{'ms': 100, 'screen_rows': ['expected']}]}
        rebuilt = {'frames': [{'ms': 105, 'screen_rows': ['different']}]}
        self.assertFalse(probe.compare_terminal_frames(official, rebuilt)['exact'])
        self.assertEqual(probe.compare_terminal_frames(official, rebuilt)['equal_fraction'], 0.0)


if __name__ == '__main__':
    unittest.main()
