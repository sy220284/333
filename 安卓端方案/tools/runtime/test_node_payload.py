#!/usr/bin/env python3
"""No-network tests of content-addressed Android Node payload integrity."""
import json
import struct
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).with_name("verify-node-payload.py")
class PayloadTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        exe = self.root / "jniLibs/arm64-v8a/libdsh_node.so"
        exe.parent.mkdir(parents=True)
        data = bytearray(1_001_000)
        data[:6] = b"\x7fELF\x02\x01"
        struct.pack_into("<H", data, 18, 183)
        exe.write_bytes(data)
        assets = self.root / "assets/runtime/node"
        (assets / "node-version.txt").parent.mkdir(parents=True)
        (assets / "node-version.txt").write_text("26.13.1\n")
        (assets / "arm64-v8a/packages.tsv").parent.mkdir(parents=True)
        (assets / "arm64-v8a/packages.tsv").write_text("nodejs\t26.13.1\tverified.deb\t" + "a"*64)
        lib = assets / "arm64-v8a/lib"
        lib.mkdir(parents=True)
        (lib / "libcrypto.so").write_bytes(b"same-verified-binary")
        (lib / "libcrypto.so.3").write_bytes(b"same-verified-binary")
        (lib / "libssl.so").write_bytes(b"different-verified-binary")

    def invoke(self, *args):
        return subprocess.run([sys.executable, str(SCRIPT), str(self.root), *args],
                              capture_output=True, text=True)

    def test_compacts_aliases_and_checks_every_blob(self):
        self.assertEqual(self.invoke().returncode, 0)
        manifest = json.loads((self.root / "assets/runtime/node/integrity-manifest.json").read_text())
        self.assertEqual(manifest["format"], "333-node-v2")
        self.assertEqual(len(manifest["libraries"]), 3)
        self.assertEqual(len(manifest["blobs"]), 2)
        self.assertFalse((self.root / "assets/runtime/node/arm64-v8a/lib").exists())
        self.assertEqual(self.invoke("--check-only").returncode, 0)
        path = self.root / "assets/runtime/node/arm64-v8a/blobs" / next(iter(manifest["blobs"]))
        path.write_bytes(b"tampered")
        self.assertNotEqual(self.invoke("--check-only").returncode, 0)

    def test_rejects_wrong_elf_architecture(self):
        exe = self.root / "jniLibs/arm64-v8a/libdsh_node.so"
        data = bytearray(exe.read_bytes())
        struct.pack_into("<H", data, 18, 62)
        exe.write_bytes(data)
        self.assertNotEqual(self.invoke().returncode, 0)

if __name__ == "__main__":
    unittest.main()
