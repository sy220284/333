import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
import zipfile

HERE=Path(__file__).parent

def load(name,filename):
    s=importlib.util.spec_from_file_location(name,HERE/filename)
    x=importlib.util.module_from_spec(s)
    s.loader.exec_module(x)
    return x

packer=load("pack_host","package-host.py")
validator=load("verify_host","verify-host-payload.py")

class ArchiveVerificationTest(unittest.TestCase):
    def make_payload(self,root):
        app=root/"source"
        (app/"lib").mkdir(parents=True)
        (app/"node_modules"/"mock").mkdir(parents=True)
        (app/"lib"/"bin.js").write_text("console.log('host')")
        (app/"package.json").write_text(json.dumps({"version":"0.2.2"}))
        (app/"node_modules"/"mock"/"index.js").write_text("module.exports=true")
        packer.package_host(app,root/"output")
        return app,root/"output"

    def test_full_bundle_roundtrip(self):
        with tempfile.TemporaryDirectory() as d:
            source,out=self.make_payload(Path(d))
            self.assertEqual(validator.verify(out,source)["files"],3)

    def test_internal_package_symlink_accepted(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d)
            source,out=self.make_payload(root)
            (source/"node_modules"/"alias").symlink_to("mock",target_is_directory=True)
            packer.package_host(source,out)
            result=validator.verify(out,source)
            self.assertEqual(result["files"],3)
            meta=json.loads((out/"assets/runtime/dsh-host-manifest.json").read_text())
            self.assertEqual(meta["links"],{"node_modules/alias":"mock"})

    def test_tampered_archive_rejected(self):
        with tempfile.TemporaryDirectory() as d:
            source,out=self.make_payload(Path(d))
            archive=out/"assets/runtime/host/package.zip"
            data = bytearray(archive.read_bytes())
            data[12] ^= 1
            archive.write_bytes(data)
            with self.assertRaisesRegex(AssertionError,"摘要"):
                validator.verify(out,source)

    def test_reports_every_incompatible_native_module_in_one_error(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d)
            source,out=self.make_payload(root)
            binary=source/"node_modules"/"mock"
            (binary/"first.node").write_bytes(
                b"\x7fELF\x02\x01"+b"\0"*12+b"\x3e\0"+b"\0"*64)
            (binary/"second.node").write_bytes(
                b"\x7fELF\x02\x01"+b"\0"*12+b"\x3e\0"+b"\0"*64)
            packer.package_host(source,out)
            with self.assertRaisesRegex(AssertionError,"2 个 Android 不兼容") as error:
                validator.verify(out,source)
            self.assertIn("first.node",str(error.exception))
            self.assertIn("second.node",str(error.exception))

    def test_linux_native_module_rejected(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d)
            source=root/"source"
            (source/"lib").mkdir(parents=True)
            (source/"node_modules"/"mock").mkdir(parents=True)
            (source/"lib"/"bin.js").write_text("console.log(1)")
            (source/"package.json").write_text('{"version":"1"}')
            # 一个 x86_64 ELF 的机器标识，不能被当成 Android arm64 addon。
            (source/"node_modules"/"mock"/"binding.node").write_bytes(
                b"\x7fELF\x02\x01"+b"\0"*12+b"\x3e\0"+b"\0"*100
            )
            packer.package_host(source,root/"output")
            with self.assertRaisesRegex(AssertionError,"并非 Android ARM64"):
                validator.verify(root/"output",source)

if __name__ == "__main__":
    unittest.main()
