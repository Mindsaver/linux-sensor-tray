#!/usr/bin/env node
/**
 * CI helper: set root package.json + package-lock.json "" version so npm ci passes
 * and electron-builder names artifacts correctly.
 *
 * RELEASE_VERSION: tag like v1.2.3 or bare 1.2.3; empty = no-op.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const raw = (process.env.RELEASE_VERSION ?? '').trim()
if (!raw) {
  console.log('[set-root-version] RELEASE_VERSION unset; leaving versions unchanged.')
  process.exit(0)
}

const v = raw.startsWith('v') ? raw.slice(1) : raw
// Loose semver: core + optional pre-release/build (npm-compatible subset)
if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$/.test(v)) {
  console.error('[set-root-version] Invalid semver:', raw)
  process.exit(1)
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const pkgPath = path.join(root, 'package.json')
const lockPath = path.join(root, 'package-lock.json')

const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
const prev = pkg.version
pkg.version = v
fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`)

const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'))
lock.version = v
if (lock.packages?.['']) lock.packages[''].version = v
fs.writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`)

console.log(`[set-root-version] ${prev} → ${v}`)
