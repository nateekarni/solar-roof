"""Own ACME lifecycle and publish validated MQTT certificates without host access."""
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import signal
import subprocess
import sys
import tempfile
import threading
import time
from cryptography import x509
from cryptography.hazmat.primitives import serialization

STOP = threading.Event()
NAMES = ('fullchain.pem', 'privkey.pem')


def validated(source, domain):
    certificate, private = ((source/name).read_bytes() for name in NAMES)
    try:
        cert = x509.load_pem_x509_certificate(certificate)
        key = serialization.load_pem_private_key(private, password=None)
        encode = lambda k: k.public_bytes(serialization.Encoding.DER, serialization.PublicFormat.SubjectPublicKeyInfo)
        now = dt.datetime.now(dt.timezone.utc)
        if encode(cert.public_key()) != encode(key.public_key()):
            raise ValueError('key mismatch')
        if not cert.not_valid_before_utc <= now < cert.not_valid_after_utc:
            raise ValueError('certificate outside validity period')
        if domain not in cert.extensions.get_extension_for_class(x509.SubjectAlternativeName).value.get_values_for_type(x509.DNSName):
            raise ValueError('hostname mismatch')
    except Exception:
        raise ValueError('invalid certificate material') from None
    return certificate, private


def publish(source, export, domain):
    data = validated(source, domain)
    export.mkdir(parents=True, exist_ok=True)
    export.chmod(0o755)
    generation = 'generation-' + hashlib.sha256(b''.join(data)).hexdigest()
    destination = export/generation
    if not destination.exists():
        staging = Path(tempfile.mkdtemp(prefix='.pending-', dir=export))
        try:
            os.chown(staging, 0, 1883)
            staging.chmod(0o750)
            for name, value in zip(NAMES, data):
                path = staging/name
                with path.open('wb') as file:
                    file.write(value)
                    file.flush()
                    os.fsync(file.fileno())
                os.chown(path, 1883, 1883)
                path.chmod(0o640)
            staging.rename(destination)
        finally:
            if staging.exists():
                shutil.rmtree(staging)
    validated(destination, domain)
    temporary = export/'.current-next'
    temporary.unlink(missing_ok=True)
    temporary.symlink_to(generation)
    temporary.replace(export/'current')


class Manager:
    def __init__(self, state=Path('/etc/letsencrypt'), export=Path('/export'), runtime=Path('/run/solar-certbot'), binary='certbot'):
        self.state, self.export, self.runtime, self.binary = state, export, runtime, binary
        self.domain = os.environ.get('MQTT_TLS_DOMAIN', '')
        self.email = os.environ.get('ACME_EMAIL', '')
        self.token = os.environ.get('CLOUDFLARE_API_TOKEN', '')
        if not re.fullmatch(r'(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?', self.domain):
            raise ValueError('invalid MQTT_TLS_DOMAIN')
        if not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+', self.email):
            raise ValueError('invalid ACME_EMAIL')
        if not self.token or any(c.isspace() for c in self.token):
            raise ValueError('invalid CLOUDFLARE_API_TOKEN')
        self.runtime.mkdir(parents=True, exist_ok=True)
        self.runtime.chmod(0o700)
        self.source = state/'live'/self.domain

    def status(self, ok):
        temporary = self.runtime/'status.next'
        temporary.write_text(json.dumps({'ok': ok, 'time': time.time()}))
        temporary.replace(self.runtime/'status.json')

    def restore(self):
        try:
            publish(self.source, self.export, self.domain)
            if not (self.runtime/'status.json').exists():
                self.status(True)
        except (ValueError, OSError):
            self.status(False)

    def healthy(self):
        try:
            validated(self.export/'current', self.domain)
            status = json.loads((self.runtime/'status.json').read_text())
            return status['ok'] is True and 0 <= time.time()-status['time'] < 13*3600
        except (ValueError, OSError, KeyError, TypeError):
            return False

    def attempt(self):
        credentials = None
        process = None
        try:
            descriptor, filename = tempfile.mkstemp(prefix='cloudflare-', suffix='.ini', dir=self.runtime)
            credentials = Path(filename)
            with os.fdopen(descriptor, 'w') as file:
                file.write('dns_cloudflare_api_token = '+self.token+'\n')
            command = [self.binary, 'certonly', '--non-interactive', '--agree-tos', '--keep-until-expiring',
                '--dns-cloudflare', '--dns-cloudflare-credentials', str(credentials),
                '--dns-cloudflare-propagation-seconds', '60', '--email', self.email,
                '--cert-name', self.domain, '-d', self.domain, '--config-dir', str(self.state),
                '--work-dir', str(self.runtime/'work'), '--logs-dir', str(self.runtime/'logs')]
            env = dict(os.environ)
            env.pop('CLOUDFLARE_API_TOKEN', None)
            process = subprocess.Popen(command, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, env=env)
            deadline = time.monotonic()+900
            while process.poll() is None:
                if STOP.wait(0.25) or time.monotonic() >= deadline:
                    raise RuntimeError('certificate attempt interrupted or timed out')
            if process.returncode != 0:
                raise RuntimeError('certificate attempt failed')
            publish(self.source, self.export, self.domain)
            self.status(True)
            print('Certificate is ready; next check in 12 hours.', flush=True)
            return True
        except Exception:
            self.status(False)
            print('Certificate check failed; retaining previous material; retry in 1 hour.', flush=True)
            return False
        finally:
            if process is not None and process.poll() is None:
                process.terminate()
                try:
                    process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait(timeout=5)
            if credentials is not None:
                credentials.unlink(missing_ok=True)


def main():
    os.umask(0o077)
    try:
        manager = Manager()
        if '--healthcheck' in sys.argv:
            return 0 if manager.healthy() else 1
        for signum in (signal.SIGTERM, signal.SIGINT):
            signal.signal(signum, lambda *_: STOP.set())
        manager.restore()
        while not STOP.is_set():
            ok = manager.attempt()
            STOP.wait(12*3600 if ok else 3600)
        return 0
    except Exception:
        print('Certificate service configuration or filesystem is invalid.', flush=True)
        return 1


if __name__ == '__main__':
    sys.exit(main())
