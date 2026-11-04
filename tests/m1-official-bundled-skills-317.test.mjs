import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
// Source: official Anthropic 2.1.317 Linux x64 ELF embedded zstd frames;
// artifact m1-official-2.1.317-linux-x64-reference/skill-resource-parity.json.
// Regenerating these checksums requires verification against the *official binary*.
const officialSkills = [
  [
    "artifact-design",
    "8e4917f5394af51deb3552fdb962051074b9b5df2de2a77a8773009a9d86a62f"
  ],
  [
    "claude-api",
    "35c1458f04fcfddc6d3f46faa6c66e9b44ba71709daf343a8e63a05a63eb976d"
  ],
  [
    "claude-test-conversation",
    "e205c5bb84639a8312953d44da4489964f3d2ee45c32b236b8ea2e17b1c08ae7"
  ],
  [
    "claude-test-runner",
    "c04e3c59c28cda399cfd7c44eb97acc429ca4a5ff1142bbfe2b24456010b7409"
  ],
  [
    "claude-test-spec",
    "f226a04d001a957aa88afdc6cee8cd6c210f54fb33ed33e029cf060a9da7963e"
  ],
  [
    "cowork-plugin-authoring",
    "23416ed0054f0d323fb6adfd67b3ffd990128888755e359762af797cb98ace63"
  ],
  [
    "design-sync",
    "1411614218146f0e37ccad94ce33e7a258555c4cdc2ac6ed4d9f31e33edde5d7"
  ],
  [
    "design-sync-package",
    "78fa6e4ce2153422b8598b6702f9363dc6f8c789569463f94b6a36fd5d24eb53"
  ],
  [
    "design-sync-storybook",
    "5135a286341c6f0110c5cb8a5a23080851095ee019e4eeadc2ceaa4de6dc2d6b"
  ],
  [
    "plugin-authoring",
    "05f4c4017a8cbc12329ff8fbbfd49023015d7e937a9cc5912f5270af1e7138ed"
  ],
  [
    "run-skill-generator",
    "0809696a81a4c063a02f12df590a79a41d9595618e9825309c5a6cebb1320486"
  ],
  [
    "verify",
    "1555c291f4eaf9a496176f3d07c0e86449a6650f91179fa5d3ac1712b63837ac"
  ]
]

test('2.1.317 all twelve embedded main skills match official byte-for-byte', () => {
  assert.equal(officialSkills.length, 12)
  for (const [name, expectedSha] of officialSkills) {
    const path = resolve(root, 'src/skills/bundled', name, 'SKILL.md')
    const actual = createHash('sha256').update(readFileSync(path)).digest('hex')
    assert.equal(actual, expectedSha, name + ': official 2.1.317 source mismatch')
  }
})
