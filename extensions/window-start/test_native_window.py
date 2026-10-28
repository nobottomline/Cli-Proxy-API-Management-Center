import json
import unittest

from native_window import bounded_body, response_usage, MODEL, MAX_BODY


class NativeBudgetTests(unittest.TestCase):
    def test_enforces_budget_and_removes_thinking(self):
        native = {"model": MODEL, "max_tokens": 64000, "thinking": {"type": "adaptive"},
                  "output_config": {"effort": "max"}, "messages": [{"role": "user", "content": "."}]}
        bounded = bounded_body(json.dumps(native).encode())
        self.assertEqual(bounded["max_tokens"], 1)
        self.assertNotIn("thinking", bounded)
        self.assertNotIn("output_config", bounded)

    def test_rejects_context_growth_tools_and_unexpected_model(self):
        for native in [
            {"model": MODEL, "messages": [{}], "tools": [{"name": "Read"}]},
            {"model": "other", "messages": [{}]},
            {"model": MODEL, "messages": [{}, {}]},
        ]:
            with self.assertRaises(ValueError):
                bounded_body(json.dumps(native).encode())
        with self.assertRaises(ValueError):
            bounded_body(b" " * (MAX_BODY + 1))

    def test_native_system_message_is_not_mistaken_for_conversation_history(self):
        body = {"model": MODEL, "messages": [{"role": "user", "content": "."},
                                             {"role": "system", "content": "Reply with a dot."}]}
        self.assertEqual(bounded_body(json.dumps(body).encode())["max_tokens"], 1)
        body["messages"].append({"role": "assistant", "content": "."})
        with self.assertRaises(ValueError):
            bounded_body(json.dumps(body).encode())

    def test_merges_native_stream_usage_without_persisting_content(self):
        stream = '\n'.join([
            'event: message_start',
            'data: ' + json.dumps({"message": {"content": "synthetic-private", "usage": {"input_tokens": 409, "output_tokens": 0}}}),
            'event: content_block_delta',
            'data: ' + json.dumps({"delta": {"text": "synthetic-private"}}),
            'data: ' + json.dumps({"usage": {"output_tokens": 1}}),
        ])
        self.assertEqual(response_usage(stream), {"input_tokens": 409, "output_tokens": 1})


if __name__ == "__main__":
    unittest.main()
