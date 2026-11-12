#!/usr/bin/env python3
"""No-network validator unit tests for the locked Android Node package format."""
import hashlib
import json
import struct
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).with_name("verify-node-payload.py")

class ManifestTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        node = self.root / "jniLibs/arm64-v8a/libdsh_node.so"
        node.parent.mkdir(parents=True)
        # Synthetic ELF with the exact AArch64 64-bit header metadata.
        data = bytearray(1_000_100)
        data[:6] = b"\x7fELF\x02\x01"
        struct.pack_into("<H", data, 18, 183)
        node.write_bytes(data)
        lib = self.root / "assets/runtime/node/arm64-v8a/lib/libc++_shared.so"
        lib.parent.mkdir(parents=True)
        lib.write_bytes(b"sample-verified-library")
        (self.root / "assets/runtime/node/node-version.txt").write_text("26.0.0\n")
        (lib.parent.parent / "packages.tsv").write_text("nodejs\t26.0.0\n")

    def invoke(self, *args):
        return subprocess.run([sys.executable, str(SCRIPT), str(self.root), *args],
                              capture_output=True, text=True)

    def test_manifest_checks_exact_files(self):
        result = self.invoke()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.invoke("--check-only").returncode, 0)
        (self.root / "assets/runtime/node/arm64-v8a/lib/libc++_shared.so").write_bytes(b"modified")
        self.assertNotEqual(self.invoke("--check-only").returncode, 0)

    def test_rejects_wrong_architecture(self):
        node = self.root / "jniLibs/arm64-v8a/libdsh_node.so"
        data = bytearray(node.read_bytes())
        struct.pack_into("<H", data, 18, 62)
        node.write_bytes(data)
        self.assertNotEqual(self.invoke().returncode, 0)

if __name__ == "__main__":
    unittest.main()
