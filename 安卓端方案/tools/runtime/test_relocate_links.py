import importlib.util
import json
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
        for name in ("vendor","packages","native","apps","python","website","benchmarks"):
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

    def test_missing_macos_optional_is_explicitly_pruned(self):
        with tempfile.TemporaryDirectory() as temp:
            checkout, deploy = self.workspace(Path(temp))
            macos = checkout / "packages" / "experimental" / "cua-macos"
            macos.mkdir(parents=True)
            (macos / "package.json").write_text(json.dumps({
                "name": "@deepseek-ai/dsh-experimental-cua-macos",
                "os": ["darwin"]
            }))
            caller = checkout / "packages" / "experimental" / "cua-bundle"
            caller.mkdir()
            (caller / "package.json").write_text(json.dumps({
                "name": "@deepseek-ai/dsh-cua-bundle",
                "optionalDependencies": {"@deepseek-ai/dsh-experimental-cua-macos": "workspace:*"}
            }))
            broken = deploy / "node_modules" / "cua-macos"
            broken.symlink_to(str(macos) + "(" + "a"*32 + ")", target_is_directory=True)
            result = module.relocate(deploy, checkout)
            self.assertEqual(result["prunedPlatformOptionals"], 1)
            self.assertFalse(broken.is_symlink())

    def test_missing_required_workspace_dependency_is_error(self):
        with tempfile.TemporaryDirectory() as temp:
            checkout, deploy = self.workspace(Path(temp))
            required = checkout / "packages" / "experimental" / "required"
            required.mkdir(parents=True)
            (required / "package.json").write_text(json.dumps({
                "name": "@deepseek-ai/required", "os": ["darwin"]
            }))
            broken = deploy / "node_modules" / "required"
            broken.symlink_to(str(required) + "(" + "a"*32 + ")")
            with self.assertRaisesRegex(ValueError, "未声明的缺失"):
                module.relocate(deploy, checkout)

    def test_required_internal_workspace_link_is_restored(self):
        with tempfile.TemporaryDirectory() as temp:
            checkout, deploy = self.workspace(Path(temp))
            vendor = checkout / "vendor" / "cosmokit"
            vendor.mkdir()
            (vendor / "package.json").write_text(json.dumps({
                "name": "@deepseek-ai/cosmokit"
            }))
            (vendor / "lib").mkdir()
            (vendor / "lib/index.js").write_text("export const one=1")
            importer = deploy / "node_modules" / "schemastery"
            (importer / "node_modules" / "@deepseek-ai").mkdir(parents=True)
            (importer / "package.json").write_text(json.dumps({
                "name": "@deepseek-ai/schemastery",
                "dependencies": {"@deepseek-ai/cosmokit": "workspace:~"}
            }))
            broken = importer / "node_modules" / "@deepseek-ai" / "cosmokit"
            broken.symlink_to("../../../missing-cosmokit", target_is_directory=True)
            result = module.relocate(deploy, checkout)
            self.assertEqual(result["relocated"], 1)
            self.assertTrue((broken / "lib/index.js").is_file())

    def test_broken_internal_link_not_declared_is_rejected(self):
        with tempfile.TemporaryDirectory() as temp:
            checkout, deploy = self.workspace(Path(temp))
            vendor = checkout / "vendor" / "cosmokit"
            vendor.mkdir()
            (vendor / "package.json").write_text(json.dumps({
                "name": "@deepseek-ai/cosmokit"
            }))
            importer = deploy / "node_modules" / "unknown"
            (importer / "node_modules" / "@deepseek-ai").mkdir(parents=True)
            (importer / "package.json").write_text('{"name":"other"}')
            (importer / "node_modules" / "@deepseek-ai" / "cosmokit").symlink_to(
                "../../../missing-cosmokit"
            )
            with self.assertRaisesRegex(ValueError, "未声明的缺失"):
                module.relocate(deploy, checkout)

    def test_missing_registry_link_recovered_from_verified_deploy_package(self):
        with tempfile.TemporaryDirectory() as temp:
            checkout, deploy = self.workspace(Path(temp))
            archive = deploy/"node_modules"/".pnpm"/"@standard-schema+spec@1.1.0"/"node_modules"/"@standard-schema"/"spec"
            archive.mkdir(parents=True)
            (archive/"package.json").write_text(json.dumps({
                "name":"@standard-schema/spec", "version":"1.1.0"
            }))
            (archive/"index.js").write_text("export const valid=true")
            importing = deploy/"node_modules"/"@deepseek-ai"/"schemastery"
            (importing/"node_modules"/"@standard-schema").mkdir(parents=True)
            (importing/"package.json").write_text(json.dumps({
                "name":"@deepseek-ai/schemastery",
                "dependencies":{"@standard-schema/spec":"^1.1.0"}
            }))
            link=importing/"node_modules"/"@standard-schema"/"spec"
            link.symlink_to("../../../missing-spec",target_is_directory=True)
            result=module.relocate(deploy,checkout)
            self.assertEqual(result["relocated"],1)
            self.assertEqual((link/"index.js").read_text(),"export const valid=true")

    def test_checkout_registry_dependency_restored_when_deploy_omits_package(self):
        with tempfile.TemporaryDirectory() as temp:
            checkout, deploy = self.workspace(Path(temp))
            real=checkout/"node_modules"/".pnpm"/"mime@4.1.1"/"node_modules"/"mime"
            real.mkdir(parents=True)
            (real/"package.json").write_text('{"name":"mime","version":"4.1.1"}')
            (real/"index.js").write_text("export default true")
            importer=deploy/"node_modules"/"reader"
            importer.mkdir()
            (importer/"package.json").write_text('{"name":"reader","dependencies":{"mime":"^4.1.1"}}')
            missing=importer/"mime"
            missing.symlink_to("../node_modules/mime")
            result=module.relocate(deploy,checkout)
            self.assertEqual(result["relocated"],1)
            self.assertEqual((missing/"index.js").read_text(),"export default true")

    def test_registry_version_conflict_rejected(self):
        with tempfile.TemporaryDirectory() as temp:
            checkout, deploy = self.workspace(Path(temp))
            archive = deploy/"node_modules"/".pnpm"/"spec@2.0.0"/"node_modules"/"spec"
            archive.mkdir(parents=True)
            (archive/"package.json").write_text('{"name":"spec","version":"2.0.0"}')
            importer = deploy/"node_modules"/"my-package"
            importer.mkdir()
            (importer/"package.json").write_text(json.dumps({
                "name":"my-package","dependencies":{"spec":"^1.0.0"}
            }))
            link=importer/"spec"
            link.symlink_to("../missing")
            with self.assertRaisesRegex(ValueError,"版本无法唯一校验"):
                module.relocate(deploy,checkout)

    def test_development_only_link_is_pruned_with_explicit_manifest(self):
        with tempfile.TemporaryDirectory() as temp:
            checkout, deploy=self.workspace(Path(temp))
            pkg=deploy/"node_modules"/"generator"
            pkg.mkdir()
            (pkg/"package.json").write_text(json.dumps({
                "name":"generator", "dependencies":{"semver":"^7.0.0"},
                "devDependencies":{"tsx":"^4.22.4"}
            }))
            link=pkg/"tsx"
            link.symlink_to("missing-tsx")
            result=module.relocate(deploy,checkout)
            self.assertEqual(result["prunedPlatformOptionals"],1)
            self.assertFalse(link.is_symlink())

    def test_required_dependency_not_pruned_even_when_also_dev(self):
        with tempfile.TemporaryDirectory() as temp:
            checkout, deploy=self.workspace(Path(temp))
            pkg=deploy/"node_modules"/"generator"
            pkg.mkdir()
            (pkg/"package.json").write_text(json.dumps({
                "name":"generator", "dependencies":{"tsx":"^4.22.4"},
                "devDependencies":{"tsx":"^4.22.4"}
            }))
            link=pkg/"tsx"
            link.symlink_to("missing-tsx")
            with self.assertRaisesRegex(ValueError, "版本无法唯一校验|冻结依赖版本无法唯一校验"):
                module.relocate(deploy,checkout)

    def test_checkout_as_deployment_rejected(self):
        with tempfile.TemporaryDirectory() as temp:
            checkout,deploy=self.workspace(Path(temp))
            with self.assertRaisesRegex(ValueError,"工作区外"):
                module.relocate(checkout,checkout)

if __name__ == "__main__":
    unittest.main()
