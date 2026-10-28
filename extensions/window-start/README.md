# Optional manual session-window service

These are the source files for the existing private window starter. They are not
required for quota reads, the Ledger view, Refresh quota or banked reset grants.
Set `VITE_SESSION_WINDOW_CONTROLS=false` when building for a backend without this
extension; its play controls will disappear without making helper requests.

The service listens only on loopback 18319. Its actions travel through the
existing authenticated v8 `requests/api-call` management endpoint. The extra
`proxy_url: direct` hop targets loopback only; provider traffic uses the backend's
configured proxy and operating-system egress restrictions. Do not expose it.

The service uses a separate management-key digest, a global job lock, a private
attempt journal, quota eligibility checks and a pinned genuine Claude Code client.
It does not change account priorities. It skips active/disabled/exhausted accounts
and enabled usage credits; ambiguous inference is never retried automatically.
The native bridge permits one user turn and at most one native system message,
one output token, no tools/thinking and one upstream inference. This is not a
promise of zero token use or provider acceptance for arbitrary integrations.

The installer is an operator tool for an already configured private Linux setup.
It expects staged Python sources, a verified official `claude` Linux executable,
and `management.html`. Review its paths and mandatory proxy port before use.
Do not commit or upload native auth files, management keys, private SSH keys,
provider profiles or real account fixtures.

Run the isolated pure regressions with:

```sh
python3 -m unittest discover -s extensions/window-start -p 'test_*.py'
```

`verify_native_bridge.py` is an optional Linux integration fixture. It requires
the pinned native executable and should run in a private network namespace. It
uses synthetic credentials/responses and does not connect to a provider.
