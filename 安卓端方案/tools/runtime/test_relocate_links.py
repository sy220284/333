import importlib.util
from pathlib import Path
import tempfile
import unittest

HERE=Path(__file__).parent
spec=importlib.util.spec_from_file_location("relocate_links",HERE/"relocate-external-links.py")
module=importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class RelocateExternalLinksTests(unittest.TestCase):
    def workspace(self,root):
        checkout=root/"checkout"
        for name in ("vendor","packages","native","apps"):
            (checkout/name).mkdir(parents=True)
        deploy=root/"deploy"
        (deploy/"node_modules").mkdir(parents=True)
        (deploy/"package.json").write_text('{"name":"host","version":"1"}')
        return checkout,deploy

    def test_vendored_package_becomes_self_contained(self):
        with tempfile.TemporaryDirectory() as temp:
            checkout,deploy=self.workspace(Path(temp))
            vendor=checkout/"vendor"/"cosmokit"
            vendor.mkdir();(vendor/"index.js").write_text("export const ok = true")
            (deploy/"node_modules"/"cosmokit").symlink_to(vendor,target_is_directory=True)
            summary=module.relocate(deploy,checkout)
            self.assertEqual(summary["relocated"],1)
            self.assertFalse((deploy/"node_modules"/"cosmokit").is_symlink())
            self.assertTrue((deploy/"node_modules"/"cosmokit"/"index.js").is_file())

    def test_internal_pnpm_link_is_preserved(self):
        with tempfile.TemporaryDirectory() as temp:
            checkout,deploy=self.workspace(Path(temp))
            (deploy/"node_modules"/"pkg").mkdir()
            (deploy/"node_modules"/"alias").symlink_to("pkg",target_is_directory=True)
            self.assertEqual(module.relocate(deploy,checkout)["relocated"],0)
            self.assertTrue((deploy/"node_modules"/"alias").is_symlink())

    def test_unknown_external_target_rejected(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);checkout,deploy=self.workspace(root)
            outside=root/"secret";outside.write_text("do not package")
            (deploy/"node_modules"/"leak").symlink_to(outside)
            with self.assertRaisesRegex(ValueError,"受信任源码"):
                module.relocate(deploy,checkout)

    def test_checkout_as_deployment_rejected(self):
        with tempfile.TemporaryDirectory() as temp:
            checkout,deploy=self.workspace(Path(temp))
            with self.assertRaisesRegex(ValueError,"工作区外"):
                module.relocate(checkout,checkout)

if __name__ == "__main__":
    unittest.main()
