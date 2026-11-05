import { describe, expect, test } from 'bun:test'
import { parseGithubRepository } from '../src/commands/install-github-app/githubRepository.js'
describe('GitHub 仓库地址真实主机名核验', () => {
  test.each([
    ['owner/repo','owner/repo'],
    ['https://github.com/owner/repo','owner/repo'],
    ['https://GITHUB.COM/owner/repo.git','owner/repo'],
    ['ssh://git@github.com/owner/repo.git','owner/repo'],
    ['git@github.com:owner/repo.git','owner/repo'],
    ['github.com:owner/repo','owner/repo'],
  ])('接受合法地址 %s', (input,expected) => expect(parseGithubRepository(input)).toBe(expected))
  test.each([
    'https://github.com.attacker.example/owner/repo',
    'https://attacker.example/github.com/owner/repo',
    'https://github.com@attacker.example/owner/repo',
    'https://attacker.example@github.com/owner/repo',
    'https://github.com:443/owner/repo?token=secret',
    'https://github.com/owner/repo/issues',
    'https://github.com/owner/../repo',
    'owner/repo;rm','othergithub.com:owner/repo','foo/bar/baz','owner/..',
  ])('拒绝伪造与不合法地址 %s', input => expect(parseGithubRepository(input)).toBeNull())
})
