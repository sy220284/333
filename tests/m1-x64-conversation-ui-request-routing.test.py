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


if __name__ == '__main__':
    unittest.main()
