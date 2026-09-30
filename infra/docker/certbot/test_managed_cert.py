import contextlib
import datetime as dt
import io
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.x509.oid import NameOID
import service

DOMAIN = 'mqtt.example.test'

def fixture(path, domain=DOMAIN, days=90):
    path.mkdir(parents=True, exist_ok=True)
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    now = dt.datetime.now(dt.timezone.utc)
    name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, domain)])
    cert = (x509.CertificateBuilder().subject_name(name).issuer_name(name)
        .public_key(key.public_key()).serial_number(x509.random_serial_number())
        .not_valid_before(now-dt.timedelta(days=2)).not_valid_after(now+dt.timedelta(days=days))
        .add_extension(x509.SubjectAlternativeName([x509.DNSName(domain)]), False).sign(key, hashes.SHA256()))
    (path/'fullchain.pem').write_bytes(cert.public_bytes(serialization.Encoding.PEM))
    (path/'privkey.pem').write_bytes(key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()))

class Certificates(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.source = self.root/'state/live'/DOMAIN
        self.export = self.root/'export'
        fixture(self.source)

    def test_export_is_atomic_readable_and_idempotent(self):
        service.publish(self.source, self.export, DOMAIN)
        target = os.readlink(self.export/'current')
        self.assertFalse(os.path.isabs(target))
        for name in ('fullchain.pem', 'privkey.pem'):
            file = self.export/'current'/name
            self.assertEqual(file.stat().st_uid, 1883)
            self.assertEqual(file.stat().st_gid, 1883)
            self.assertEqual(file.stat().st_mode & 0o777, 0o640)
        service.publish(self.source, self.export, DOMAIN)
        self.assertEqual(os.readlink(self.export/'current'), target)

    def test_bad_replacement_preserves_previous_generation(self):
        service.publish(self.source, self.export, DOMAIN)
        original = os.readlink(self.export/'current')
        for domain, days in [('wrong.example.test', 90), (DOMAIN, -1)]:
            fixture(self.source, domain, days)
            with self.assertRaises(ValueError):
                service.publish(self.source, self.export, DOMAIN)
            self.assertEqual(os.readlink(self.export/'current'), original)
        fixture(self.source)
        other = self.root/'other'
        fixture(other)
        (self.source/'privkey.pem').write_bytes((other/'privkey.pem').read_bytes())
        with self.assertRaises(ValueError):
            service.publish(self.source, self.export, DOMAIN)

    def test_renewal_failure_is_unhealthy_and_preserves_certificate_and_secret(self):
        fake = self.root/'certbot'
        fake.write_text('#!/usr/bin/env python3\nimport sys, pathlib\np=pathlib.Path(sys.argv[sys.argv.index("--dns-cloudflare-credentials")+1])\nassert p.stat().st_mode & 0o777 == 0o600\nprint(p.read_text())\nsys.exit(1)\n')
        fake.chmod(0o755)
        env = {'CLOUDFLARE_API_TOKEN':'sensitive-token', 'ACME_EMAIL':'ops@example.test', 'MQTT_TLS_DOMAIN':DOMAIN}
        with patch.dict(os.environ, env), contextlib.redirect_stdout(io.StringIO()) as output:
            manager = service.Manager(self.root/'state', self.export, self.root/'runtime', str(fake))
            manager.restore()
            original = os.readlink(self.export/'current')
            self.assertFalse(manager.attempt())
            self.assertFalse(manager.healthy())
            self.assertEqual(os.readlink(self.export/'current'), original)
        self.assertNotIn('sensitive-token', output.getvalue())
        self.assertFalse(list((self.root/'runtime').glob('cloudflare*')))

    def test_success_and_restart_reuse_persistent_certificate(self):
        fake = self.root/'certbot'
        fake.write_text('#!/bin/sh\nexit 0\n')
        fake.chmod(0o755)
        with patch.dict(os.environ, {'CLOUDFLARE_API_TOKEN':'token','ACME_EMAIL':'ops@example.test','MQTT_TLS_DOMAIN':DOMAIN}):
            manager = service.Manager(self.root/'state', self.export, self.root/'runtime', str(fake))
            self.assertTrue(manager.attempt())
            self.assertTrue(manager.healthy())
            restarted = service.Manager(self.root/'state', self.export, self.root/'runtime', str(fake))
            restarted.restore()
            self.assertTrue(restarted.healthy())

if __name__ == '__main__':
    unittest.main()


class Lifecycle(unittest.TestCase):
    setUp = Certificates.setUp
    def test_health_expires_without_fresh_successful_check(self):
        import json
        import time
        with patch.dict(os.environ, {'CLOUDFLARE_API_TOKEN':'token','ACME_EMAIL':'ops@example.test','MQTT_TLS_DOMAIN':DOMAIN}):
            manager = service.Manager(self.root/'state', self.export, self.root/'runtime', '/bin/true')
            manager.restore()
            (manager.runtime/'status.json').write_text(json.dumps({'ok':True, 'time':time.time()-14*3600}))
            self.assertFalse(manager.healthy())

    def test_shutdown_stops_active_certbot_and_removes_token_file(self):
        import threading
        import time
        fake = self.root/'certbot'
        fake.write_text('#!/usr/bin/env python3\nimport time\ntime.sleep(60)\n')
        fake.chmod(0o755)
        with patch.dict(os.environ, {'CLOUDFLARE_API_TOKEN':'token','ACME_EMAIL':'ops@example.test','MQTT_TLS_DOMAIN':DOMAIN}):
            manager = service.Manager(self.root/'state', self.export, self.root/'runtime', str(fake))
            timer = threading.Timer(0.2, service.STOP.set)
            timer.start()
            started = time.monotonic()
            try:
                self.assertFalse(manager.attempt())
                self.assertLess(time.monotonic()-started, 7)
                self.assertFalse(list(manager.runtime.glob('cloudflare*')))
            finally:
                timer.cancel()
                timer.join()
                service.STOP.clear()
