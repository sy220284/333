import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
import zipfile

spec=importlib.util.spec_from_file_location("host_archive",Path(__file__).with_name("package-host.py"))
host=importlib.util.module_from_spec(spec)
spec.loader.exec_module(host)

class HostTests(unittest.TestCase):
    def test_verified_archive(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp)
            app=root/"app"
            (app/"lib").mkdir(parents=True)
            (app/"node_modules").mkdir()
            (app/"lib/bin.js").write_text("console.log('host')")
            (app/"package.json").write_text(json.dumps({"version":"0.2.2"}))
            result=host.package_host(app,root/"output")
            self.assertEqual(result["format"],"333-host-v1")
            with zipfile.ZipFile(root/"output/assets/runtime/host/package.zip") as z:
                self.assertIn("lib/bin.js",z.namelist())
            self.assertEqual(json.loads((root/"output/assets/runtime/dsh-host-manifest.json").read_text()),result)

    def test_symlink_rejected(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp); app=root/"app"
            (app/"lib").mkdir(parents=True);(app/"node_modules").mkdir()
            (app/"package.json").write_text('{"version":"1"}')
            (app/"lib/bin.js").write_text("ok")
            (app/"lib/copy").symlink_to(app/"lib/bin.js")
            with self.assertRaisesRegex(ValueError,"符号链接"):
                host.package_host(app,root/"output")
