#!/usr/bin/env python3
"""Prevent background API calls from masquerading as a second REPL turn."""
import importlib.util
import unittest
from pathlib import Path


spec = importlib.util.spec_from_file_location(
    'spinner_probe', Path(__file__).with_name('m1-x64-spinner-tips.py')
)
probe = importlib.util.module_from_spec(spec)
spec.loader.exec_module(probe)


class SpinnerConversationTests(unittest.TestCase):
    def test_first_user_message_with_system_reminder_is_first_turn(self):
        body = {'messages': [{'role': 'user', 'content': [
            {'type': 'text', 'text': '<system-reminder>context</system-reminder>'},
            {'type': 'text', 'text': 'SPINNER_FIRST_MARKER'},
        ]}]}
        self.assertTrue(probe.is_first_turn_request(body))

    def test_background_title_request_is_not_a_first_or_second_turn(self):
        body = {'messages': [{'role': 'user', 'content': [
            {'type': 'text', 'text': '<session>SPINNER_FIRST_MARKER</session>\nWrite a title'}
        ]}]}
        self.assertFalse(probe.is_first_turn_request(body))
        self.assertFalse(probe.is_second_turn_request(body))

    def test_second_turn_requires_first_user_assistant_answer_and_second_user(self):
        body = {'messages': [
            {'role': 'user', 'content': [{'type': 'text', 'text': 'SPINNER_FIRST_MARKER'}]},
            {'role': 'assistant', 'content': [{'type': 'text', 'text': 'PROBE_DONE'}]},
            {'role': 'user', 'content': [{'type': 'text', 'text': 'SPINNER_SECOND_MARKER'}]},
        ]}
        classify = probe.is_second_turn_request
        self.assertTrue(classify(body))
        self.assertFalse(classify({'messages': body['messages'][::2]}))
        self.assertFalse(classify({'messages': list(reversed(body['messages']))}))

    def test_second_turn_accepts_string_content_and_ignores_non_text_blocks(self):
        body = {'messages': [
            {'role': 'user', 'content': 'SPINNER_FIRST_MARKER'},
            {'role': 'assistant', 'content': 'PROBE_DONE'},
            {'role': 'user', 'content': [
                {'type': 'image', 'source': {}},
                {'type': 'text', 'text': 'SPINNER_SECOND_MARKER'},
            ]},
        ]}
        self.assertTrue(probe.is_second_turn_request(body))


if __name__ == '__main__':
    unittest.main()
