"""Private, manual, credential-specific Claude session-window starter.

Only loopback management calls are made here. The gateway owns OAuth tokens and
the mandatory ISP transport. No routing, credential or provider setting is edited.
"""
import datetime as dt
import hashlib
import hmac
import json
import os
from pathlib import Path
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.request import ProxyHandler, Request, build_opener

BASE = "http://127.0.0.1:8317/v8/management/"
MODEL = "claude-sonnet-5-5"
PROMPT = {"model": MODEL, "max_tokens": 1,
          "messages": [{"role": "user", "content": "."}]}
USAGE_URL = "https://api.anthropic.com/api/oauth/usage"
MESSAGES_URL = "https://api.anthropic.com/v1/messages"


def timestamp():
    return dt.datetime.now(dt.timezone.utc).isoformat()


def active_window(quota, now=None):
    reset = (quota.get("five_hour") or {}).get("resets_at")
    if not reset:
        return False
    deadline = dt.datetime.fromisoformat(reset.replace("Z", "+00:00"))
    return deadline.timestamp() > (time.time() if now is None else now)


def exhausted(quota):
    # Conservatively avoid requests when any reported session/weekly pool is full.
    return any(isinstance(v, dict) and isinstance(v.get("utilization"), (int, float))
               and v["utilization"] >= 100
               for k, v in quota.items() if k == "five_hour" or k.startswith("seven_day"))


class Gateway:
    def __init__(self, key):
        self.key = key
        self.opener = build_opener(ProxyHandler({}))

    def request(self, path, body=None):
        req = Request(BASE + path,
                      data=json.dumps(body).encode() if body is not None else None,
                      headers={"Authorization": "Bearer " + self.key,
                               "Content-Type": "application/json"})
        with self.opener.open(req, timeout=65) as response:
            return json.load(response)

    def accounts(self):
        return [x for x in self.request("credentials")["files"]
                if (x.get("provider") or x.get("type")) == "claude"]

    def message(self, index):
        from native_window import native_message
        return native_message(self, index)

    def call(self, index, url, body=None):
        payload = {"authIndex": index, "method": "GET" if body is None else "POST",
                   "url": url, "header": {
                       "Authorization": "Bearer $TOKEN$", "Accept": "application/json",
                       "anthropic-beta": "oauth-2025-04-20"}}
        if body is not None:
            payload["data"] = json.dumps(body, separators=(",", ":"))
        result = self.request("requests/api-call", payload)
        text = result.get("body", {})
        try:
            parsed = json.loads(text) if isinstance(text, str) else text
        except ValueError:
            parsed = {}
        return result["status_code"], parsed


class Starter:
    def __init__(self, state_path, gateway_factory=Gateway, sleep=time.sleep):
        self.path = Path(state_path)
        self.factory = gateway_factory
        self.sleep = sleep
        self.lock = threading.Lock()
        self.busy = False
        self.results = {}
        self.attempts = {}
        if self.path.exists():
            state = json.loads(self.path.read_text())
            self.results = state.get("results", {})
            self.attempts = state.get("attempts", {})
            for result in self.results.values():
                if result.get("state") in {"queued", "checking", "sending", "confirming"}:
                    result["state"] = "interrupted"

    def save(self):
        self.path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        tmp = self.path.with_suffix(".tmp")
        tmp.write_text(json.dumps({"results": self.results, "attempts": self.attempts}))
        tmp.chmod(0o600)
        tmp.replace(self.path)

    def status(self, key):
        accounts = self.factory(key).accounts()
        with self.lock:
            return {"busy": self.busy, "model": MODEL, "accounts": [
                {"auth_index": x["auth_index"], "name": x.get("email") or x.get("name"),
                 "disabled": bool(x.get("disabled")),
                 "result": self.results.get(x["auth_index"])} for x in accounts]}

    def start(self, key, index=None):
        gateway = self.factory(key)
        accounts = gateway.accounts()
        if index is not None:
            accounts = [x for x in accounts if x["auth_index"] == index]
            if not accounts:
                raise ValueError("Unknown Claude account")
        with self.lock:
            if self.busy:
                return False
            self.busy = True
            for account in accounts:
                self.results[account["auth_index"]] = {"state": "queued", "at": timestamp()}
            self.save()
        threading.Thread(target=self.run, args=(gateway, accounts), daemon=True).start()
        return True

    def record(self, index, state, **values):
        with self.lock:
            self.results[index] = {"state": state, "at": timestamp(), **values}
            self.save()

    def run(self, gateway, accounts):
        try:
            for account in accounts:
                index = account["auth_index"]
                try:
                    self.one(gateway, account)
                except Exception:
                    # No upstream body, key, token, identity or traceback is logged.
                    self.record(index, "error", message="Не удалось проверить запрос. Автоповтора нет.")
        finally:
            with self.lock:
                self.busy = False

    def one(self, gateway, account):
        index = account["auth_index"]
        if account.get("disabled"):
            self.record(index, "skipped", message="Аккаунт отключён")
            return
        self.record(index, "checking")
        code, quota = gateway.call(index, USAGE_URL)
        weekly = quota.get("seven_day") or {}
        if (code != 200 or not isinstance(quota.get("five_hour"), dict)
                or not isinstance(weekly.get("utilization"), (int, float))):
            self.record(index, "error", message="Лимиты недоступны; сообщение не отправлено", http_status=code)
            return
        if active_window(quota):
            self.record(index, "active", resets_at=quota["five_hour"]["resets_at"],
                        message="Окно уже идёт; сообщение не отправлено")
            return
        if exhausted(quota):
            self.record(index, "skipped", message="Лимит исчерпан; сообщение не отправлено")
            return
        if (quota.get("extra_usage") or {}).get("is_enabled"):
            self.record(index, "skipped", message="Включены платные usage credits; сообщение не отправлено")
            return
        with self.lock:
            if time.time() - self.attempts.get(index, 0) < 600:
                guarded = True
            else:
                guarded = False
                # Journal BEFORE inference: network timeouts/restarts must not cause duplicates.
                self.attempts[index] = time.time()
                self.save()
        if guarded:
            self.record(index, "skipped", message="Защита от повтора: подождите 10 минут")
            return
        self.record(index, "sending")
        code, response = gateway.message(index)
        if code != 200:
            self.record(index, "error", http_status=code,
                        message="Сообщение не принято. Автоповтора и переключения аккаунта нет.")
            return
        usage = {k: v for k, v in (response.get("usage") or {}).items()
                 if k in {"input_tokens", "output_tokens", "cache_read_input_tokens", "cache_creation_input_tokens"}}
        self.record(index, "confirming", usage=usage)
        for delay in (2, 5, 10):
            self.sleep(delay)
            code, after = gateway.call(index, USAGE_URL)
            if code == 200 and active_window(after):
                self.record(index, "started", usage=usage,
                            resets_at=after["five_hour"]["resets_at"],
                            message="Начало окна подтверждено Anthropic")
                return
        self.record(index, "unconfirmed", usage=usage,
                    message="Ответ получен, но начало окна не подтверждено. Автоповтора нет.")


def handler(starter, key_digest):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_args):
            pass

        def do_POST(self):
            key = self.headers.get("Authorization", "").removeprefix("Bearer ")
            if not hmac.compare_digest(hashlib.sha256(key.encode()).hexdigest(), key_digest):
                self.reply(401, {"error": "Unauthorized"})
                return
            length = int(self.headers.get("Content-Length", 0))
            if self.path != "/windows" or not 0 < length <= 4096:
                self.reply(400, {"error": "Invalid request"})
                return
            try:
                body = json.loads(self.rfile.read(length))
                action = body.get("action")
                if action == "status":
                    result = starter.status(key)
                elif action == "start":
                    index = body.get("auth_index")
                    if index is not None and (not isinstance(index, str) or not index):
                        raise ValueError("Invalid account")
                    result = {"accepted": starter.start(key, index)}
                else:
                    raise ValueError("Unknown action")
                self.reply(200, result)
            except (ValueError, TypeError, KeyError):
                self.reply(400, {"error": "Invalid request"})
            except Exception:
                self.reply(502, {"error": "Gateway unavailable"})

        def reply(self, status, body):
            data = json.dumps(body).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

    return Handler


if __name__ == "__main__":
    os.umask(0o077)
    digest = Path("/etc/cliproxyapi-window-start/key.sha256").read_text().strip()
    service = Starter("/var/lib/cliproxyapi-window-start/state.json")
    ThreadingHTTPServer(("127.0.0.1", 18319), handler(service, digest)).serve_forever()
