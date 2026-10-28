#!/usr/bin/env python3
"""Synthetic, loopback-only UI fixture. Never connects to real providers."""
import argparse
import collections
import datetime as dt
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--port', type=int, default=18327)
parser.add_argument('--panel', type=Path, default=Path('dist/index.html'))
args = parser.parse_args()
KEY = 'demo-management-key'
COUNTS = collections.Counter()
NOW = dt.datetime.now(dt.timezone.utc)
NAMES = ['Studio', 'Research', 'Workbench', 'Review', 'Personal', 'Reserve']
PERCENTAGES = [(0, 0, 0), (100, 14, 0), (1, 3, 0), (0, 0, 0), (1, 2, 0), (0, 0, 0)]


def at(hours):
    return (NOW + dt.timedelta(hours=hours)).isoformat()


def accounts():
    return [{'name': 'demo-' + str(i) + '.json', 'label': name,
             'type': 'claude', 'provider': 'claude', 'auth_index': 'demo-' + str(i),
             'email': name.lower() + '@example.invalid', 'disabled': False,
             'status': 'active', 'source': 'file', 'runtime_only': False,
             'priority': 100 if i == 0 else 0, 'success': 10, 'failed': 0}
            for i, name in enumerate(NAMES)]


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass

    def send(self, code, value, content_type='application/json'):
        content = value if isinstance(value, bytes) else json.dumps(value).encode()
        self.send_response(code)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(len(content)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-CLIProxyAPI-Version', '8.0.38')
        self.send_header('X-CLIProxyAPI-Plugin-Support', 'false')
        self.end_headers()
        self.wfile.write(content)

    def authorized(self):
        if self.headers.get('Authorization') != 'Bearer ' + KEY:
            self.send(401, {'error': 'Use demo-management-key for this synthetic backend'})
            return False
        return True

    def do_GET(self):
        path = urlparse(self.path).path
        if path in ['/', '/management.html']:
            if not args.panel.exists():
                self.send(503, {'error': 'Run bun run build first'})
                return
            html = args.panel.read_text()
            banner = '<aside style="position:fixed;bottom:6px;left:8px;font:10px system-ui;color:#999;z-index:9999;pointer-events:none">Demo data · local fixture</aside>'
            self.send(200, html.replace('</body>', banner + '</body>').encode(), 'text/html; charset=utf-8')
            return
        if path == '/fixture-counts':
            self.send(200, dict(COUNTS))
            return
        if not self.authorized():
            return
        if path == '/v8/management/config':
            self.send(200, {'config-version': 8, 'server': {'host': '127.0.0.1', 'port': args.port},
                            'management': {'allow-remote': False},
                            'routing': {'strategy': 'fill-first', 'session-affinity': False},
                            'observability': {'logs': {'debug': False}}})
        elif path == '/v8/management/credentials':
            self.send(200, {'files': accounts()})
        elif path == '/v8/management/usage':
            self.send(200, {'usage': {'total_requests': 0, 'apis': {}}})
        elif path == '/v8/management/plugins':
            self.send(200, {'plugins': []})
        else:
            self.send(404, {'error': 'Not implemented by the isolated quota fixture'})

    def do_POST(self):
        if not self.authorized():
            return
        if urlparse(self.path).path != '/v8/management/requests/api-call':
            self.send(405, {'error': 'Fixture does not permit mutations'})
            return
        request = json.loads(self.rfile.read(int(self.headers.get('Content-Length', 0))))
        url = request.get('url', '')
        index = str(request.get('authIndex', 'demo-0'))
        number = int(index.rsplit('-', 1)[-1]) if index.startswith('demo-') else 0
        if url == 'http://127.0.0.1:18319/windows':
            body = json.loads(request.get('data', '{}'))
            COUNTS['window_helper_' + body.get('action', 'unknown')] += 1
            answer = {'busy': False, 'accounts': [
                {'auth_index': x['auth_index'], 'name': x['label'], 'disabled': False}
                for x in accounts()]}
            if body.get('action') == 'start':
                answer = {'accepted': False}
            self.upstream(200, answer)
        elif '/api/oauth/usage' in url and 'cedar_ember' in url:
            COUNTS['reset_grant_reads'] += 1
            self.upstream(200, {'cedar_ember': {
                'eligible': True, 'at_limit': True, 'next_grant_id': 'demo-grant',
                'grants': [{'id': 'demo-grant', 'label': 'Demo reset', 'resets_total': 2,
                            'resets_left': 2, 'starts_at': at(-24), 'ends_at': at(168),
                            'clears': ['five_hour', 'seven_day'], 'paused': False,
                            'usable_now': True, 'use_requires_limit': False}],
                'weekly_resets_at': at(144), 'cooldown_until': None}})
        elif '/api/oauth/usage' in url:
            COUNTS['quota_reads_' + str(number)] += 1
            week, session, fable = PERCENTAGES[number % len(PERCENTAGES)]
            self.upstream(200, {
                'five_hour': {'utilization': session, 'resets_at': at(1 if number == 1 else 4) if session else None},
                'seven_day': {'utilization': week, 'resets_at': at(8 if number == 1 else 72 + number * 12)},
                'limits': [{'kind': 'weekly_scoped', 'scope': {'model': {'display_name': 'Fable 5'}},
                            'percent': fable, 'is_active': True, 'resets_at': at(72 + number * 12)}],
                'extra_usage': {'is_enabled': False}})
        elif '/api/oauth/profile' in url:
            COUNTS['profile_reads'] += 1
            self.upstream(200, {'account': {'has_claude_pro': True, 'has_claude_max': False},
                                'organization': {'uuid': '11111111-1111-4111-8111-111111111111',
                                                 'subscription_status': 'active'}})
        else:
            COUNTS['blocked_mutations_or_unknown'] += 1
            self.upstream(405, {'error': 'No outbound connections or mutations in this fixture'})

    def upstream(self, status, body):
        self.send(200, {'status_code': status, 'header': {}, 'body': json.dumps(body)})


print(f'Synthetic panel: http://127.0.0.1:{args.port}/management.html#/quota', flush=True)
print('Management key: demo-management-key (synthetic only)', flush=True)
ThreadingHTTPServer(('127.0.0.1', args.port), Handler).serve_forever()
