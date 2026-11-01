#!/usr/bin/env python3
"""333 工具链本地测试：版本/组件拆分、缺失规划、损坏 Artifact 拒绝、无联网安装。"""
import os
import pathlib
import subprocess
import tempfile
import unittest

DEV = pathlib.Path(__file__).resolve().parent
ROOT = DEV.parents[1]


def shell(*args, env=None):
    return subprocess.run(
        ["bash", *map(str, args)],
        cwd=ROOT,
        env=env,
        text=True,
        capture_output=True,
        check=False,
    )


class ToolchainTests(unittest.TestCase):
    def test_syntax_and_components(self):
        for p in DEV.glob("*.sh"):
            res = shell("-n", p)
            self.assertEqual(res.returncode, 0, (p.name, res.stderr))
        res = shell(
            "-c",
            'TOOLCHAIN_DIR="$PWD/tools/dev"; source "$TOOLCHAIN_DIR/lib.sh"; '
            'load_manifest; artifacts_for npm-public; artifacts_for source-deps',
        )
        self.assertEqual(res.returncode, 0, res.stderr)
        self.assertEqual(
            res.stdout.splitlines(),
            [f"333-toolchain-npm-public-part-{i:02d}-latest" for i in range(1, 5)]
            + ["333-toolchain-source-deps-latest"],
        )

    def test_missing_artifacts_are_requested_without_download(self):
        with tempfile.TemporaryDirectory() as d:
            root = pathlib.Path(d)
            (root / "build").mkdir()
            (root / "package.json").write_text('{"scripts":{"rebuild":"true"}}')
            (root / "build/public-dependencies.lock.json").write_text("{}")
            env = os.environ.copy()
            env.update(
                DEV333_REPO_ROOT=str(root),
                DEV333_TOOLS_ROOT=str(root / "tools"),
                DEV333_TOOLCHAIN_ENV_FILE=str(root / "env"),
            )
            plan = shell("tools/dev/ai-toolchain.sh", "plan", "build", env=env)
            self.assertEqual(plan.returncode, 0, plan.stderr)
            self.assertIn("333-toolchain-source-deps-latest", plan.stdout)
            self.assertIn("333-toolchain-npm-public-part-01-latest", plan.stdout)
            self.assertIn("333-toolchain-npm-public-part-04-latest", plan.stdout)
            self.assertFalse((root / ".rebuild").exists())

    def test_corrupt_artifact_rejected_before_extraction(self):
        # 前置工具在 CI 已安装。构造损坏的首个缺失组件，验证失败有明确报错。
        with tempfile.TemporaryDirectory() as d:
            root = pathlib.Path(d)
            (root / "build").mkdir()
            (root / "package.json").write_text("{}")
            (root / "build/public-dependencies.lock.json").write_text("{}")
            artifacts = root / "artifacts"
            artifacts.mkdir()
            env = os.environ.copy()
            env.update(
                DEV333_REPO_ROOT=str(root),
                DEV333_TOOLS_ROOT=str(root / "tools"),
                DEV333_TOOLCHAIN_ENV_FILE=str(root / "env"),
            )
            plan = shell("tools/dev/ai-toolchain.sh", "plan", "build", env=env)
            self.assertEqual(plan.returncode, 0, plan.stderr)
            first = plan.stdout.splitlines()[0]
            comp = first.removeprefix("333-toolchain-").split("-part-")[0].removesuffix("-latest")
            bad = artifacts / first
            bad.mkdir()
            (bad / "component.env").write_text("ARTIFACT_SCHEMA=1\n")
            (bad / "payload.part" if "-part-" in first else bad / "payload.tar.gz").write_bytes(b"tampered")
            (bad / "SHA256SUMS").write_text("0" * 64 + "  component.env\n")
            res = shell("tools/dev/ai-toolchain.sh", "install", "build",
                        "--artifacts-dir", artifacts, env=env)
            self.assertNotEqual(res.returncode, 0)
            self.assertIn("SHA-256", res.stderr)
            self.assertFalse((root / ".rebuild").exists())
            self.assertTrue(comp)


if __name__ == "__main__":
    unittest.main(verbosity=2)
