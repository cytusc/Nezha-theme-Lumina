import os
import posixpath
import tarfile
import tempfile
import time
from pathlib import Path

import paramiko


def getenv(name: str, default: str = "") -> str:
    return os.environ.get(name, default).strip()


def log(msg: str) -> None:
    print(msg, flush=True)


host = getenv('DEPLOY_HOST')
port = int(getenv('DEPLOY_PORT', '22'))
user = getenv('DEPLOY_USER')
remote_root = getenv('DEPLOY_PATH')
identity_file = getenv('DEPLOY_IDENTITY_FILE')
password = getenv('DEPLOY_PASSWORD')
restart_command = getenv('DEPLOY_RESTART_COMMAND')
clean_remote = getenv('DEPLOY_CLEAN', 'true').lower() in {'1', 'true', 'yes', 'y', 'on'}
local_dist = Path(getenv('LOCAL_DIST'))

if not host or not user or not remote_root:
    raise SystemExit('Missing DEPLOY_HOST / DEPLOY_USER / DEPLOY_PATH')
if not local_dist.exists():
    raise SystemExit(f'Local dist not found: {local_dist}')

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())

connect_errors = []
connected = False

if password:
    try:
        client.connect(hostname=host, port=port, username=user, password=password, timeout=20, banner_timeout=20, auth_timeout=20)
        connected = True
        log('Connected with password auth')
    except Exception as e:
        connect_errors.append(f'password auth failed: {e}')

if not connected and identity_file:
    try:
        pkey = paramiko.Ed25519Key.from_private_key_file(identity_file)
        client.connect(hostname=host, port=port, username=user, pkey=pkey, timeout=20, banner_timeout=20, auth_timeout=20)
        connected = True
        log('Connected with key auth')
    except Exception as e:
        connect_errors.append(f'key auth failed: {e}')

if not connected:
    raise SystemExit(' ; '.join(connect_errors) or 'Unable to connect')


def run(cmd: str) -> None:
    stdin, stdout, stderr = client.exec_command(cmd)
    code = stdout.channel.recv_exit_status()
    out = stdout.read().decode('utf-8', 'replace').strip()
    err = stderr.read().decode('utf-8', 'replace').strip()
    if out:
        print(out, flush=True)
    if err:
        print(err, flush=True)
    if code != 0:
        raise SystemExit(f'remote command failed ({code}): {cmd}')


safe_remote = remote_root.replace("'", "'\\''")
archive_name = f"lumina-dist-{int(time.time())}.tar.gz"
remote_archive = f"/tmp/{archive_name}"

with tempfile.NamedTemporaryFile(prefix='lumina-dist-', suffix='.tar.gz', delete=False) as tmp:
    local_archive = Path(tmp.name)

try:
    log(f'Packing dist: {local_archive}')
    with tarfile.open(local_archive, 'w:gz') as tar:
        tar.add(local_dist, arcname='.')

    sftp = client.open_sftp()
    log(f'Uploading archive to {remote_archive}')
    sftp.put(str(local_archive), remote_archive)
    sftp.close()

    run(f"mkdir -p -- '{safe_remote}'")
    if clean_remote:
        run(f"find '{safe_remote}' -mindepth 1 -maxdepth 1 -exec rm -rf -- {{}} +")
    run(f"tar -xzf '{remote_archive}' -C '{safe_remote}'")
    run(f"rm -f '{remote_archive}'")

    if restart_command:
        run(restart_command)

    run(f"echo deploy-ok && find '{safe_remote}' -maxdepth 2 -type f | sed -n '1,20p'")
    log('Remote upload finished')
finally:
    try:
        local_archive.unlink(missing_ok=True)
    except Exception:
        pass
    client.close()
