#!/usr/bin/env python3
"""Back up and atomically deploy just the compiled panel over an existing SSH alias.

No credentials are embedded or copied, no services restart, and gateway config,
account files and routing are untouched. Run bun run verify/build first.
"""
import argparse
import hashlib
import shlex
from pathlib import Path
import subprocess

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--ssh-host', required=True, help='An existing trusted SSH host alias')
parser.add_argument('--artifact', type=Path, default=Path('dist/index.html'))
args = parser.parse_args()
if args.ssh_host.startswith('-') or any(character.isspace() for character in args.ssh_host):
    parser.error('Use one SSH alias, without options or whitespace')
data = args.artifact.read_bytes()
if b'<html' not in data[:1024] or b'quota_ledger' not in data:
    parser.error('Expected the built, single-file Ledger panel')
digest = hashlib.sha256(data).hexdigest()
remote = r'''
import datetime,fcntl,hashlib,json,os,pathlib,shutil,sys,urllib.request
os.umask(0o077)
data=sys.stdin.buffer.read()
expected="DIGEST"
assert hashlib.sha256(data).hexdigest()==expected
panel=pathlib.Path('/etc/cliproxyapi/static/management.html')
config=pathlib.Path('/etc/cliproxyapi/config.yaml')
root=pathlib.Path('/var/lib/cliproxyapi-admin-backups')
root.mkdir(mode=0o700,parents=True,exist_ok=True)
with (root/'.panel-deploy.lock').open('a') as lock:
    fcntl.flock(lock,fcntl.LOCK_EX)
    previous=panel.read_bytes()
    config_hash=hashlib.sha256(config.read_bytes()).hexdigest()
    changed=hashlib.sha256(previous).hexdigest()!=expected
    if changed:
        backup=root/(datetime.datetime.now().strftime('%Y%m%d-%H%M%S-%f')+'-ledger-panel')
        backup.mkdir(mode=0o700)
        shutil.copy2(panel,backup/'management.html')
    temp=panel.with_suffix('.html.ledger-'+str(os.getpid())+'.tmp')
    try:
        if changed:
            temp.write_bytes(data)
            temp.chmod(0o644)
            os.replace(temp,panel)
        assert hashlib.sha256(config.read_bytes()).hexdigest()==config_hash
        opener=urllib.request.build_opener(urllib.request.ProxyHandler({}))
        with opener.open('http://127.0.0.1:8317/management.html',timeout=15) as response:
            assert hashlib.sha256(response.read()).hexdigest()==expected
    except Exception:
        if changed:
            temp.write_bytes(previous)
            temp.chmod(0o644)
            os.replace(temp,panel)
        raise
    finally:
        temp.unlink(missing_ok=True)
print(json.dumps({'panel_sha256':expected,'gateway_configuration_unchanged':True,'served_artifact_verified':True}))
'''.replace('DIGEST', digest)
# This is a fixed Python program, not interpolated user text. Single quotes are
# escaped before it becomes the one remote shell argument; the alias is argv.
command = "python3 -c " + shlex.quote(remote)
subprocess.run(['ssh', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=20', args.ssh_host, command],
               input=data, check=True)
