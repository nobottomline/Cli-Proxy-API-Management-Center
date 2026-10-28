import copy
import json
from pathlib import Path
import tempfile
import threading
import unittest

from window_start import Starter, PROMPT, USAGE_URL, MESSAGES_URL, active_window

ACCOUNT = {"auth_index": "synthetic-reserve", "provider": "claude", "disabled": False}
IDLE = {"five_hour": {"utilization": 0, "resets_at": None},
        "seven_day": {"utilization": 25}, "extra_usage": {"is_enabled": False}}
ACTIVE = {**IDLE, "five_hour": {"utilization": 0, "resets_at": "2099-01-01T00:00:00Z"}}


class FakeGateway:
    def __init__(self, quota=None, inference_status=200, confirm=True):
        self.quota = copy.deepcopy(IDLE if quota is None else quota)
        self.status = inference_status
        self.confirm = confirm
        self.calls = []
        self.accounts_value = [copy.deepcopy(ACCOUNT)]

    def accounts(self):
        return self.accounts_value

    def message(self, index):
        return self.call(index, MESSAGES_URL, PROMPT)

    def call(self, index, url, body=None):
        self.calls.append((index, url, copy.deepcopy(body)))
        if url == USAGE_URL:
            return 200, self.quota
        assert url == MESSAGES_URL
        if self.status == "timeout":
            raise TimeoutError()
        if self.status == 200 and self.confirm:
            self.quota = copy.deepcopy(ACTIVE)
        return self.status, {"usage": {"input_tokens": 9, "output_tokens": 1}}


class WindowTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.path = Path(self.tmp.name) / "state.json"
        self.starter = Starter(self.path, sleep=lambda _: None)

    def tearDown(self):
        self.tmp.cleanup()

    def one(self, gateway, account=ACCOUNT):
        self.starter.one(gateway, account)
        return self.starter.results[account["auth_index"]]

    def test_single_pinned_message_and_confirmed_deadline(self):
        gateway = FakeGateway()
        result = self.one(gateway)
        self.assertEqual(result["state"], "started")
        messages = [x for x in gateway.calls if x[1] == MESSAGES_URL]
        self.assertEqual(messages, [(ACCOUNT["auth_index"], MESSAGES_URL, PROMPT)])
        self.assertEqual(PROMPT["max_tokens"], 1)
        self.assertNotIn("tools", PROMPT)
        self.assertNotIn("system", PROMPT)
        self.assertEqual(result["usage"], {"input_tokens": 9, "output_tokens": 1})
        self.assertEqual(gateway.accounts_value, [ACCOUNT])
        self.assertEqual(self.path.stat().st_mode & 0o777, 0o600)

    def test_active_zero_percent_is_skipped(self):
        gateway = FakeGateway(ACTIVE)
        self.assertEqual(self.one(gateway)["state"], "active")
        self.assertEqual(len(gateway.calls), 1)

    def test_exhausted_disabled_unknown_and_paid_credits_are_skipped(self):
        for quota in [
            {**IDLE, "seven_day": {"utilization": 100}},
            {**IDLE, "seven_day_opus": {"utilization": 100}},
            {**IDLE, "seven_day": {}},
            {**IDLE, "extra_usage": {"is_enabled": True}},
        ]:
            gateway = FakeGateway(quota)
            self.one(gateway)
            self.assertFalse(any(x[1] == MESSAGES_URL for x in gateway.calls))
        gateway = FakeGateway()
        self.one(gateway, {**ACCOUNT, "disabled": True})
        self.assertEqual(gateway.calls, [])

    def test_no_retry_after_rejection_or_unconfirmed_response(self):
        for code in [429, 401, 500, 200]:
            gateway = FakeGateway(inference_status=code, confirm=False)
            self.starter.attempts.clear()
            result = self.one(gateway)
            self.assertEqual(result["state"], "unconfirmed" if code == 200 else "error")
            self.assertEqual(sum(x[1] == MESSAGES_URL for x in gateway.calls), 1)
            restarted = Starter(self.path, sleep=lambda _: None)
            restarted.one(gateway, ACCOUNT)
            self.assertEqual(sum(x[1] == MESSAGES_URL for x in gateway.calls), 1)

    def test_timeout_is_journalled_before_send_and_does_not_retry(self):
        gateway = FakeGateway(inference_status="timeout")
        self.starter.run(gateway, [ACCOUNT])
        self.assertEqual(self.starter.results[ACCOUNT["auth_index"]]["state"], "error")
        restarted = Starter(self.path, sleep=lambda _: None)
        restarted.one(gateway, ACCOUNT)
        self.assertEqual(sum(x[1] == MESSAGES_URL for x in gateway.calls), 1)

    def test_one_global_job_across_browser_sessions(self):
        gate = threading.Event()
        entered = threading.Event()
        gateway = FakeGateway()
        starter = Starter(self.path, gateway_factory=lambda _: gateway)
        def worker(*_):
            entered.set()
            gate.wait(2)
            with starter.lock:
                starter.busy = False
        starter.run = worker
        self.assertTrue(starter.start("synthetic-management-key"))
        self.assertTrue(entered.wait(1))
        self.assertFalse(starter.start("synthetic-management-key"))
        gate.set()

    def test_unknown_account_is_rejected_without_inference(self):
        gateway = FakeGateway()
        starter = Starter(self.path, gateway_factory=lambda _: gateway)
        with self.assertRaises(ValueError):
            starter.start("synthetic-key", "missing")
        self.assertEqual(gateway.calls, [])

    def test_restart_marks_inflight_result_interrupted(self):
        self.path.write_text(json.dumps({"results": {"fake": {"state": "sending"}}}))
        self.assertEqual(Starter(self.path).results["fake"]["state"], "interrupted")


if __name__ == "__main__":
    unittest.main()
