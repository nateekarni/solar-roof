"""Fail-closed supervisor for the managed Mosquitto image."""
import hashlib
import json
import os
from pathlib import Path
import re
import signal
import ssl
import subprocess
import sys
import time


def credentials(env):
    try:
        gateways = json.loads(env.get('MQTT_GATEWAY_CREDENTIALS', '{}'))
    except (ValueError, TypeError):
        raise ValueError('Invalid MQTT gateway credentials') from None
    if not isinstance(gateways, dict):
        raise ValueError('Invalid MQTT gateway credentials')
    for name in gateways:
        if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_-]{0,63}', name) or name == 'solar-backend':
            raise ValueError('Invalid MQTT gateway username')
    accounts = {'solar-backend': env.get('MQTT_PASSWORD', ''), **gateways}
    for password in accounts.values():
        if not isinstance(password, str) or len(password) < 16 or any(ord(c) < 32 or ord(c) == 127 for c in password):
            raise ValueError('Invalid MQTT password (minimum 16 characters; no control characters)')
    return accounts


def certificate_identity(directory, domain):
    """Validate one immutable generation, returning its fingerprint."""
    directory = Path(directory).resolve(strict=True)
    cert, key = directory / 'fullchain.pem', directory / 'privkey.pem'
    context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    context.load_cert_chain(cert, key)  # Also rejects mismatched keys.
    for args in [['-checkend', '0'], ['-checkhost', domain]]:
        result = subprocess.run(['openssl', 'x509', '-in', str(cert), '-noout', *args], capture_output=True)
        if result.returncode:
            raise ValueError('TLS certificate is expired or does not match MQTT_TLS_DOMAIN')
    # checkend only tests notAfter; verify also rejects not-yet-valid certificates.
    result = subprocess.run(['openssl', 'verify', '-partial_chain', '-trusted', str(cert), str(cert)], capture_output=True)
    if result.returncode:
        raise ValueError('TLS certificate is not currently valid')
    return hashlib.sha256(cert.read_bytes() + key.read_bytes()).hexdigest()


def write_passwords(accounts):
    directory = Path('/mosquitto/auth')
    directory.mkdir(mode=0o700, exist_ok=True)
    path = directory / 'passwords'
    # Conversion avoids passing cleartext passwords in process arguments.
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, 'w') as stream:
        for name, password in accounts.items():
            stream.write(f'{name}:{password}\n')
    subprocess.run(['mosquitto_passwd', '-U', str(path)], check=True, capture_output=True)
    os.chown(directory, 1883, 1883)
    os.chown(path, 1883, 1883)


def main():
    child = None
    stopped = False
    def stop(signum, frame):
        nonlocal stopped
        stopped = True
    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    try:
        accounts = credentials(os.environ)
        domain = os.environ.get('MQTT_TLS_DOMAIN', '')
        if not re.fullmatch(r'(?=.{1,253}$)[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?', domain):
            raise ValueError('Invalid MQTT_TLS_DOMAIN')
        timeout = int(os.environ.get('MQTT_CERT_WAIT_SECONDS', '300'))
        if not 1 <= timeout <= 3600:
            raise ValueError('Invalid MQTT_CERT_WAIT_SECONDS')
        write_passwords(accounts)
        del accounts
        deadline = time.monotonic() + timeout
        identity = None
        while not stopped:
            try:
                identity = certificate_identity('/mosquitto/certs/current', domain)
                break
            except (OSError, ValueError, ssl.SSLError):
                if time.monotonic() >= deadline:
                    raise ValueError('Usable MQTT TLS certificate unavailable; startup deadline exceeded') from None
                time.sleep(1)
        if stopped:
            return 0
        # Preserve existing volume data while ensuring the broker can persist it.
        os.chown('/mosquitto/data', 1883, 1883)
        child = subprocess.Popen(['mosquitto', '-c', '/mosquitto/config/managed.conf'], env={'PATH':os.environ['PATH']})
        while not stopped and child.poll() is None:
            time.sleep(1)
            try:
                current = certificate_identity('/mosquitto/certs/current', domain)
            except (OSError, ValueError, ssl.SSLError):
                raise ValueError('MQTT TLS material became unusable; stopping broker') from None
            if current != identity:
                child.send_signal(signal.SIGHUP)
                identity = current
                print('MQTT TLS certificate reloaded', flush=True)
        return 0 if stopped else (child.returncode or 1)
    except (ValueError, OSError, subprocess.SubprocessError):
        # No exception payload: JSON, tool output, paths, or env may contain secrets.
        print('MQTT startup/runtime validation failed; broker stopped', file=sys.stderr, flush=True)
        return 1
    finally:
        if child is not None and child.poll() is None:
            child.terminate()
            try:
                child.wait(timeout=15)
            except subprocess.TimeoutExpired:
                child.kill()
                child.wait()


def healthcheck():
    try:
        certificate_identity('/mosquitto/certs/current', os.environ['MQTT_TLS_DOMAIN'])
        # Verify the listener is serving the current certificate for this hostname.
        import socket
        context = ssl.create_default_context(cafile='/mosquitto/certs/current/fullchain.pem')
        # ACME fullchain contains the leaf and intermediate, not the root.
        context.verify_flags |= ssl.VERIFY_X509_PARTIAL_CHAIN
        leaf_pem = Path('/mosquitto/certs/current/fullchain.pem').read_text().split('-----END CERTIFICATE-----', 1)[0] + '-----END CERTIFICATE-----'
        expected = ssl.PEM_cert_to_DER_cert(leaf_pem)
        with socket.create_connection(('127.0.0.1', 8883), timeout=3) as connection:
            with context.wrap_socket(connection, server_hostname=os.environ['MQTT_TLS_DOMAIN']) as listener:
                if listener.getpeercert(binary_form=True) != expected:
                    return 1
        return 0
    except (OSError, ValueError, KeyError, ssl.SSLError):
        return 1

if __name__ == '__main__':
    sys.exit(healthcheck() if '--healthcheck' in sys.argv else main())
