import os
import sys
import json
import base64
import unittest
import urllib.request
from unittest.mock import patch, MagicMock

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, BASE_DIR)

from cloud_daemon import restore_secret_file, HealthHandler, state, start_health_server


class TestCloudDaemon(unittest.TestCase):
    def test_restore_secret_file_from_json(self):
        test_file = "test_secret_tmp.json"
        test_path = os.path.join(BASE_DIR, test_file)
        if os.path.exists(test_path):
            os.remove(test_path)

        try:
            with patch.dict(os.environ, {"TEST_ENV_JSON": '{"foo": "bar", "val": 123}'}):
                success = restore_secret_file(test_file, "TEST_ENV_JSON", "TEST_ENV_B64")
                self.assertTrue(success)
                self.assertTrue(os.path.exists(test_path))
                with open(test_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                self.assertEqual(data["foo"], "bar")
                self.assertEqual(data["val"], 123)
        finally:
            if os.path.exists(test_path):
                os.remove(test_path)

    def test_restore_secret_file_from_b64(self):
        test_file = "test_secret_b64_tmp.json"
        test_path = os.path.join(BASE_DIR, test_file)
        if os.path.exists(test_path):
            os.remove(test_path)

        try:
            b64_str = base64.b64encode(b'{"hello": "world"}').decode("utf-8")
            with patch.dict(os.environ, {"TEST_ENV_B64": b64_str}):
                success = restore_secret_file(test_file, "TEST_ENV_JSON_NONE", "TEST_ENV_B64")
                self.assertTrue(success)
                self.assertTrue(os.path.exists(test_path))
                with open(test_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                self.assertEqual(data["hello"], "world")
        finally:
            if os.path.exists(test_path):
                os.remove(test_path)

    def test_health_server(self):
        port = 18999
        start_health_server(port)
        # Query /health
        req = urllib.request.Request(f"http://127.0.0.1:{port}/health")
        with urllib.request.urlopen(req, timeout=5) as resp:
            self.assertEqual(resp.status, 200)
            data = json.loads(resp.read().decode("utf-8"))
            self.assertEqual(data["status"], "healthy")

        # Query /status
        req2 = urllib.request.Request(f"http://127.0.0.1:{port}/status")
        with urllib.request.urlopen(req2, timeout=5) as resp2:
            self.assertEqual(resp2.status, 200)
            data2 = json.loads(resp2.read().decode("utf-8"))
            self.assertIn("workers", data2)
            self.assertEqual(data2["service"], "Authority Magazine 24/7 Cloud Auto Responder")


if __name__ == "__main__":
    unittest.main()
