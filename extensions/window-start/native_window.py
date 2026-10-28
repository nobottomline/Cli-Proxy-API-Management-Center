"""Run the pinned, genuine Claude Code client for one bounded, pinned message.

The local bridge forwards the client's actual request through the gateway's
credential-specific management API. It never copies OAuth tokens or impersonates
a native client using a hand-written identity. The response budget is one token.
"""
import hmac
import json
import os
from pathlib import Path
import secrets
import subprocess
import tempfile
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

CLI = "/opt/cliproxyapi-window-start/claude"
MODEL = "claude-sonnet-5-5"
MAX_BODY = 8192


def bounded_body(raw):
    if len(raw) > MAX_BODY:
        raise ValueError("Unexpected native context size")
    body = json.loads(raw)
    messages = body.get("messages", [])
    roles = [message.get("role") for message in messages]
    # Current native Claude Code uses a mid-conversation system message even
    # for this first, history-free user turn. It is not a second user request.
    if (body.get("model") != MODEL or body.get("tools")
            or roles.count("user") != 1 or roles.count("system") > 1
            or any(role not in {"user", "system"} for role in roles)):
        raise ValueError("Unexpected native request")
    body["max_tokens"] = 1
    body.pop("thinking", None)
    body.pop("output_config", None)
    return body


def response_usage(text):
    usage = {}
    try:
        events = [json.loads(text)]
    except ValueError:
        events = []
        for line in text.splitlines():
            if line.startswith("data: "):
                try:
                    events.append(json.loads(line[6:]))
                except ValueError:
                    pass
    for event in events:
        usage.update(event.get("message", {}).get("usage", {}))
        usage.update(event.get("usage", {}))
    return {k: v for k, v in usage.items() if k in {
        "input_tokens", "output_tokens", "cache_read_input_tokens", "cache_creation_input_tokens"}}


def native_message(gateway, index, cli=CLI, deadline=80, diagnostics=None):
    finished = threading.Event()
    claimed = threading.Lock()
    result = []
    bearer = secrets.token_urlsafe(32)

    class Bridge(BaseHTTPRequestHandler):
        def log_message(self, *_args):
            pass

        def do_POST(self):
            if not hmac.compare_digest(self.headers.get("Authorization", ""), "Bearer " + bearer):
                self.send_error(401)
                return
            if self.path.split("?")[0] != "/v1/messages":
                self.send_error(404)
                return
            length = int(self.headers.get("Content-Length", 0))
            if not 0 < length <= MAX_BODY:
                self.send_error(413)
                return
            try:
                raw = self.rfile.read(length)
                body = bounded_body(raw)
            except (ValueError, TypeError) as error:
                if diagnostics is not None:
                    try:
                        rejected = json.loads(raw)
                        diagnostics({"bridge_rejected": str(error), "body_bytes": length,
                                     "model": rejected.get("model"),
                                     "roles": [x.get("role") for x in rejected.get("messages", [])],
                                     "tools": len(rejected.get("tools", []))})
                    except (ValueError, TypeError):
                        pass
                self.send_error(400)
                return
            # One upstream inference only, even if the CLI continues a truncated
            # answer, retries an error or dispatches concurrent requests.
            if not claimed.acquire(blocking=False):
                self.send_error(429)
                return
            try:
                headers = {k: v for k, v in self.headers.items() if k.lower() not in {
                    "host", "content-length", "connection", "authorization", "x-api-key", "accept-encoding"}}
                headers["Authorization"] = "Bearer $TOKEN$"
                response = gateway.request("requests/api-call", {
                    "authIndex": index, "method": "POST",
                    "url": "https://api.anthropic.com" + self.path,
                    "header": headers, "data": json.dumps(body)})
                code = response["status_code"]
                text = response.get("body", "")
                result.append((code, {"usage": response_usage(text)}))
                data = text.encode()
                self.send_response(code)
                self.send_header("Content-Type", "text/event-stream" if code == 200 else "application/json")
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)
            except Exception:
                # A timeout has uncertain billing; the caller journals the attempt
                # before entering here and never retries this inference.
                if not result:
                    result.append((502, {}))
            finally:
                finished.set()
                # Intentionally keep claimed locked for this bridge's lifetime.

    server = ThreadingHTTPServer(("127.0.0.1", 0), Bridge)
    server.daemon_threads = True
    threading.Thread(target=server.serve_forever, daemon=True).start()
    process = None
    try:
        with tempfile.TemporaryDirectory(prefix="claude-window-") as directory:
            config = Path(directory) / "config"
            config.mkdir(mode=0o700)
            env = os.environ.copy()
            for key in ("ANTHROPIC_API_KEY", "CLAUDE_CODE_OAUTH_TOKEN", "CLAUDECODE"):
                env.pop(key, None)
            env.update({
                "CLAUDE_CONFIG_DIR": str(config),
                "ANTHROPIC_BASE_URL": f"http://127.0.0.1:{server.server_port}",
                "ANTHROPIC_AUTH_TOKEN": bearer,
                "HTTP_PROXY": "http://127.0.0.1:18790",
                "HTTPS_PROXY": "http://127.0.0.1:18790",
                "http_proxy": "http://127.0.0.1:18790",
                "https_proxy": "http://127.0.0.1:18790",
                "NO_PROXY": "localhost,127.0.0.1,::1",
                "no_proxy": "localhost,127.0.0.1,::1",
                "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC": "1",
                "CLAUDE_CODE_MAX_OUTPUT_TOKENS": "1",
                "MAX_THINKING_TOKENS": "0",
                "DISABLE_AUTOUPDATER": "1",
            })
            stderr = tempfile.TemporaryFile()
            stdout = tempfile.TemporaryFile()
            process = subprocess.Popen([
                cli, "-p", ".", "--model", MODEL, "--effort", "low", "--tools", "",
                "--system-prompt", "Reply with a dot.", "--setting-sources", "",
                "--no-session-persistence", "--output-format", "json"],
                env=env, cwd=directory, stdout=stdout, stderr=stderr)
            until = time.monotonic() + deadline
            while not finished.wait(0.2) and time.monotonic() < until:
                if process.poll() is not None:
                    break
            process.terminate()
            try:
                process.wait(timeout=3)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=3)
            if not result and diagnostics is not None:
                stderr.seek(0)
                stdout.seek(0)
                text = (stderr.read(4096) + stdout.read(4096)).decode(errors="replace").replace(bearer, "[redacted]")
                if getattr(gateway, "key", None):
                    text = text.replace(gateway.key, "[redacted]")
                diagnostics({"exit_code": process.returncode, "stderr": text})
            stderr.close()
            stdout.close()
    finally:
        if process is not None and process.poll() is None:
            process.kill()
            process.wait(timeout=3)
        server.shutdown()
        server.server_close()
    if not result:
        raise TimeoutError("Native request not completed")
    return result[0]
