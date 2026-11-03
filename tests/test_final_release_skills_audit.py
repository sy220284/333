import hashlib
import importlib.util
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

SCRIPT = Path(__file__).resolve().parents[1] / "tools/upgrade/audit-final-release-skills.py"
spec = importlib.util.spec_from_file_location("target_skill_audit", SCRIPT)
audit_module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit_module)


class TargetSkillAuditTests(unittest.TestCase):
    def test_release_frontmatter_is_detected(self):
        payload = b"---\nname: artifact-design\ndescription: A release skill\n---\nContent\n"
        self.assertEqual(audit_module.classify_skill(payload), "artifact-design")
        self.assertEqual(audit_module.classify_skill(
            b"# Cowork Plugin Authoring\nCreate a plugin."), "cowork-plugin-authoring")

    def test_ordinary_text_does_not_masquerade_as_a_skill(self):
        self.assertIsNone(audit_module.classify_skill(
            b"---\ndescription: no release skill name\n---\nContent"))
        self.assertIsNone(audit_module.classify_skill(b"\xff\x00\x01"))

    def test_reports_exact_changed_missing_and_unlocated_assets(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            base = root / "src/skills/bundled"
            base.mkdir(parents=True)
            for name, payload in (("exact", b"same"),
                                  ("changed", b"candidate"),
                                  ("local-only", b"extra")):
                dest = base / name / "SKILL.md"
                dest.parent.mkdir()
                dest.write_bytes(payload)
            binary = root / "claude"
            binary.write_bytes(b"self-contained-official-fixture")
            expected = hashlib.sha256(binary.read_bytes()).hexdigest()
            found = {
                name: {"name": name, "sha256": hashlib.sha256(payload).hexdigest(),
                       "bytes": len(payload), "frame_offset": 10}
                for name, payload in (("exact", b"same"), ("changed", b"official"),
                                      ("missing", b"official-only"))
            }
            with patch.object(audit_module, "embedded_skills", return_value=(found, 3)):
                result = audit_module.audit(binary, root, expected, "2.1.317")
            self.assertEqual(result["target_version"], "2.1.317")
            self.assertEqual(result["counts"], {
                "MATCH": 1, "DIFFERS": 1, "MISSING": 1, "NOT_LOCATED_IN_BINARY": 1})
            with self.assertRaisesRegex(RuntimeError, "Wrong 2.1.317 native binary"):
                audit_module.audit(binary, root, "0" * 64, "2.1.317")


    def test_official_skill_bytes_are_written_only_to_separate_review_artifacts(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "src/skills/bundled").mkdir(parents=True)
            binary = root / "claude"
            binary.write_bytes(b"official binary fixture")
            expected = hashlib.sha256(binary.read_bytes()).hexdigest()
            original = b"---\\nname: final-skill\\ndescription: from native\\n---\\nReal instructions\\n"
            record = {"final-skill": {
                "name": "final-skill", "sha256": hashlib.sha256(original).hexdigest(),
                "bytes": len(original), "frame_offset": 20,
            }}
            def native_probe(path, extracted):
                self.assertEqual(path, binary)
                self.assertIsNotNone(extracted)
                extracted["final-skill"] = original
                return record, 1
            output = root / "review" / "official-skills"
            with patch.object(audit_module, "embedded_skills", side_effect=native_probe):
                result = audit_module.audit(binary, root, expected, "2.1.317", output)
            self.assertEqual(result["counts"]["MISSING"], 1)
            self.assertEqual(
                (output / "final-skill/SKILL.md").read_bytes(), original)
            self.assertFalse((root / "src/skills/bundled/final-skill/SKILL.md").exists())


if __name__ == "__main__":
    unittest.main()
