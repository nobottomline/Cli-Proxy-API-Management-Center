"""Linux native-client regression with synthetic credentials and no provider I/O.

Run in systemd PrivateNetwork=yes. The real pinned CLI generates its request;
the management gateway is replaced with this local, deterministic fixture.
"""
import json
from native_window import native_message, MODEL


class SyntheticGateway:
    def __init__(self):
        self.calls = 0

    def request(self, path, payload):
        self.calls += 1
        assert self.calls == 1
        assert path == "requests/api-call"
        assert payload["authIndex"] == "synthetic-reserve"
        assert payload["url"].split("?")[0] == "https://api.anthropic.com/v1/messages"
        body = json.loads(payload["data"])
        assert body["max_tokens"] == 1
        assert body["model"] == MODEL
        assert not body.get("tools")
        assert "thinking" not in body
        assert [x["role"] for x in body["messages"]].count("user") == 1
        assert len(body["messages"]) <= 2
        assert len(payload["data"]) < 8192
        assert payload["header"]["Authorization"] == "Bearer $TOKEN$"
        events = [
            {"type": "message_start", "message": {
                "id": "synthetic-message", "type": "message", "role": "assistant", "model": MODEL,
                "content": [], "stop_reason": None, "stop_sequence": None,
                "usage": {"input_tokens": 409, "output_tokens": 0}}},
            {"type": "content_block_start", "index": 0, "content_block": {"type": "text", "text": ""}},
            {"type": "content_block_delta", "index": 0, "delta": {"type": "text_delta", "text": "."}},
            {"type": "content_block_stop", "index": 0},
            {"type": "message_delta", "delta": {"stop_reason": "max_tokens", "stop_sequence": None},
             "usage": {"output_tokens": 1}},
            {"type": "message_stop"},
        ]
        text = "".join("event: " + event["type"] + "\ndata: " + json.dumps(event) + "\n\n" for event in events)
        return {"status_code": 200, "body": text}


gateway = SyntheticGateway()
status, response = native_message(gateway, "synthetic-reserve", diagnostics=lambda value: print(json.dumps(value), flush=True))
assert status == 200 and gateway.calls == 1
assert response["usage"] == {"input_tokens": 409, "output_tokens": 1}
print(json.dumps({"linux_native_bridge": "passed", "upstream_calls": gateway.calls,
                  "response_budget": 1, "real_accounts_used": 0, "provider_connections": 0}))
