"""Install the isolated window starter and atomically replace only panel HTML.

Run as root from an uploaded staging directory after native binary verification.
Does not edit gateway configuration, authentication files or network services.
"""
import datetime
import hashlib
from pathlib import Path
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parent
CLI_SHA = "4d704a8aecbe038affa3000f498ae17c1b4f753add8facb8764120affc99b658"
def digest(path):
    with path.open("rb") as source:
        return hashlib.file_digest(source, "sha256").hexdigest()

assert digest(ROOT / "claude") == CLI_SHA
config = Path("/etc/cliproxyapi/config.yaml")
before = hashlib.sha256(config.read_bytes()).hexdigest()
panel = Path("/etc/cliproxyapi/static/management.html")
backup = Path("/var/lib/cliproxyapi-admin-backups") / (datetime.datetime.now().strftime("%Y%m%d-%H%M%S") + "-window-start")
backup.mkdir(mode=0o700, parents=True)
shutil.copy2(panel, backup / "management.html")

directory = Path("/opt/cliproxyapi-window-start")
directory.mkdir(mode=0o755, exist_ok=True)
for name in ("window_start.py", "native_window.py", "claude"):
    target = directory / name
    shutil.copyfile(ROOT / name, target)
    target.chmod(0o755 if name == "claude" else 0o644)
assert digest(directory / "claude") == CLI_SHA
conf = Path("/etc/cliproxyapi-window-start")
conf.mkdir(mode=0o755, exist_ok=True)
key = Path("/etc/cliproxyapi/management-key").read_text().strip()
(conf / "key.sha256").write_text(hashlib.sha256(key.encode()).hexdigest() + "\n")
(conf / "key.sha256").chmod(0o644)
del key
unit = """[Unit]
Description=Private manual Claude session window starter
After=network.target cliproxyapi.service

[Service]
Type=simple
DynamicUser=yes
StateDirectory=cliproxyapi-window-start
StateDirectoryMode=0700
ExecStart=/usr/bin/python3 /opt/cliproxyapi-window-start/window_start.py
Restart=on-failure
RestartSec=5
UMask=0077
NoNewPrivileges=yes
PrivateTmp=yes
PrivateDevices=yes
ProtectSystem=strict
ProtectHome=yes
ProtectKernelTunables=yes
ProtectKernelModules=yes
ProtectControlGroups=yes
RestrictSUIDSGID=yes
CapabilityBoundingSet=
RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6
IPAddressDeny=any
IPAddressAllow=localhost
MemoryMax=600M
TasksMax=80
Nice=10
CPUWeight=20
IOWeight=20
TimeoutStopSec=5

[Install]
WantedBy=multi-user.target
"""
Path("/etc/systemd/system/cliproxyapi-window-start.service").write_text(unit)
subprocess.run(["systemctl", "daemon-reload"], check=True)
subprocess.run(["systemctl", "enable", "--now", "cliproxyapi-window-start.service"], check=True)
subprocess.run(["systemctl", "is-active", "--quiet", "cliproxyapi-window-start.service"], check=True)
if "--activate-panel" in sys.argv:
    new_panel = panel.with_suffix(".html.window-start.tmp")
    shutil.copyfile(ROOT / "management.html", new_panel)
    new_panel.chmod(0o644)
    new_panel.replace(panel)
assert hashlib.sha256(config.read_bytes()).hexdigest() == before
print("WINDOW_START_INSTALLED; GATEWAY_CONFIG_UNCHANGED; BACKUP=" + str(backup))
