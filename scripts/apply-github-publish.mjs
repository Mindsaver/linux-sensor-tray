#!/usr/bin/env node
/**
 * Patches package.json build.publish for the current GitHub repo.
 * Used in CI: GH_OWNER + GH_REPO must match github.repository_owner / repo name.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const owner = process.env.GH_OWNER
const repo = process.env.GH_REPO

if (!owner || !repo) {
  console.error('apply-github-publish: set GH_OWNER and GH_REPO')
  process.exit(1)
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const pkgPath = path.join(root, 'package.json')
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))

pkg.build = pkg.build ?? {}
pkg.build.publish = {
  provider: 'github',
  owner,
  repo,
  // Default electron-builder GitHub publishing is draft; CI should publish a real release.
  releaseType: 'release'
}

fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`)
console.log(`apply-github-publish: github/${owner}/${repo}`)
