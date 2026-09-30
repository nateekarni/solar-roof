import unittest
import runtime

class CredentialsTest(unittest.TestCase):
    def test_backend_and_gateway_are_returned(self):
        self.assertEqual(runtime.credentials({'MQTT_PASSWORD':'backend-password-123','MQTT_GATEWAY_CREDENTIALS':'{"one":"gateway-password-123"}'}), {'solar-backend':'backend-password-123','one':'gateway-password-123'})

    def test_rejects_injection_reserved_short_and_nonobjects_without_secrets(self):
        secret = 'secret-password-123'
        for value in ['{"solar-backend":"'+secret+'"}', '{"a/b":"'+secret+'"}', '{"+":"'+secret+'"}', '{"#":"'+secret+'"}', '{"a\\n":"'+secret+'"}', '{"one":"short"}', '[]', 'null', '{broken']:
            with self.subTest(value=value), self.assertRaises(ValueError) as error:
                runtime.credentials({'MQTT_PASSWORD':secret,'MQTT_GATEWAY_CREDENTIALS':value})
            self.assertNotIn(secret, str(error.exception))
        for value in ['', 'short', secret+'\n', secret+'\x00']:
            with self.subTest(value=value), self.assertRaises(ValueError):
                runtime.credentials({'MQTT_PASSWORD':value,'MQTT_GATEWAY_CREDENTIALS':'{}'})


import shutil
import subprocess
import tempfile
from pathlib import Path

@unittest.skipUnless(shutil.which('openssl'), 'openssl required')
class CertificateTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.path = Path(self.tmp.name)
        subprocess.run(['openssl','req','-x509','-newkey','rsa:2048','-nodes','-days','1','-subj','/CN=localhost','-addext','subjectAltName=DNS:localhost','-keyout',str(self.path/'privkey.pem'),'-out',str(self.path/'fullchain.pem')], check=True, capture_output=True)

    def test_accepts_valid_material_and_rejects_wrong_hostname(self):
        self.assertEqual(len(runtime.certificate_identity(self.path, 'localhost')), 64)
        with self.assertRaises(ValueError):
            runtime.certificate_identity(self.path, 'wrong.example.com')

    def test_rejects_missing_or_mismatched_private_key(self):
        (self.path/'privkey.pem').unlink()
        with self.assertRaises(OSError):
            runtime.certificate_identity(self.path, 'localhost')
        subprocess.run(['openssl','genrsa','-out',str(self.path/'privkey.pem'),'2048'], check=True, capture_output=True)
        with self.assertRaises(OSError):
            runtime.certificate_identity(self.path, 'localhost')



class ChainedHealthcheckTest(unittest.TestCase):
    @unittest.skipUnless(shutil.which('openssl'), 'openssl required')
    def test_acme_fullchain_is_healthy_and_stale_served_leaf_is_not(self):
        import os
        import socket
        import ssl
        import threading
        from unittest.mock import patch
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            def openssl(*args):
                subprocess.run(['openssl', *args], cwd=root, check=True, capture_output=True)
            openssl('req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=Root', '-keyout', 'root.key', '-out', 'root.pem')
            openssl('req', '-new', '-newkey', 'rsa:2048', '-nodes', '-subj', '/CN=Intermediate', '-keyout', 'intermediate.key', '-out', 'intermediate.csr')
            (root/'intermediate.ext').write_text('basicConstraints=critical,CA:TRUE\nkeyUsage=critical,keyCertSign,cRLSign\n')
            openssl('x509', '-req', '-in', 'intermediate.csr', '-CA', 'root.pem', '-CAkey', 'root.key', '-CAcreateserial', '-days', '1', '-extfile', 'intermediate.ext', '-out', 'intermediate.pem')
            (root/'leaf.ext').write_text('basicConstraints=critical,CA:FALSE\nsubjectAltName=DNS:localhost\nextendedKeyUsage=serverAuth\n')
            for name in ('current', 'previous'):
                openssl('req', '-new', '-newkey', 'rsa:2048', '-nodes', '-subj', '/CN=localhost', '-keyout', name+'.key', '-out', name+'.csr')
                openssl('x509', '-req', '-in', name+'.csr', '-CA', 'intermediate.pem', '-CAkey', 'intermediate.key', '-CAcreateserial', '-days', '1', '-extfile', 'leaf.ext', '-out', name+'.pem')
                (root/(name+'-chain.pem')).write_bytes((root/(name+'.pem')).read_bytes()+(root/'intermediate.pem').read_bytes())
            original_context = ssl.create_default_context
            original_connect = socket.create_connection
            for name, expected in [('current', 0), ('previous', 1)]:
                with self.subTest(served=name), socket.socket() as server:
                    server.bind(('127.0.0.1', 0))
                    server.listen(1)
                    server.settimeout(5)
                    endpoint = server.getsockname()
                    context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
                    context.load_cert_chain(root/(name+'-chain.pem'), root/(name+'.key'))
                    failures = []
                    def serve():
                        try:
                            connection, _ = server.accept()
                            with connection, context.wrap_socket(connection, server_side=True):
                                pass
                        except Exception as error:
                            failures.append(error)
                    thread = threading.Thread(target=serve)
                    thread.start()
                    try:
                        with patch.dict(os.environ, {'MQTT_TLS_DOMAIN':'localhost'}), patch.object(runtime, 'certificate_identity', return_value='valid'), patch.object(runtime, 'Path', return_value=root/'current-chain.pem'), patch('ssl.create_default_context', side_effect=lambda **kwargs: original_context(cafile=str(root/'current-chain.pem'))), patch('socket.create_connection', side_effect=lambda *args, **kwargs: original_connect(endpoint, timeout=3)):
                            self.assertEqual(runtime.healthcheck(), expected)
                    finally:
                        thread.join(timeout=6)
                    self.assertFalse(thread.is_alive())
                    self.assertEqual(failures, [])

if __name__ == '__main__': unittest.main()
