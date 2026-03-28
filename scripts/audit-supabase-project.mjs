#!/usr/bin/env node
/**
 * Single source of truth for the hosted FuelBot Supabase project.
 * Run: npm run audit:supabase
 */
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')

const FUELBOT_SUPABASE_PROJECT_REF = 'feenwusofmhnpuahekvu'
const FUELBOT_SUPABASE_URL = `https://${FUELBOT_SUPABASE_PROJECT_REF}.supabase.co`

/** Known wrong refs / typos that have appeared in env or screenshots — must not appear in repo or local env. */
const BANNED_SUBSTRINGS = ['feerywusofnhrpuahekvu', 'mykdmlcezekwxelxfvlr']

function jwtRef(anonJwt) {
  try {
    const part = anonJwt.split('.')[1]
    if (!part) return null
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/')
    const pad = b64.length % 4
    const padded = pad ? b64 + '='.repeat(4 - pad) : b64
    const payload = JSON.parse(Buffer.from(padded, 'base64').toString('utf8'))
    return typeof payload.ref === 'string' ? payload.ref : null
  } catch {
    return null
  }
}

function parseEnvValue(line) {
  const i = line.indexOf('=')
  if (i === -1) return ''
  let v = line.slice(i + 1).trim()
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    v = v.slice(1, -1)
  }
  return v
}

/** @type {string[]} */
const errors = []

function checkEnvFile(name) {
  const p = path.join(ROOT, name)
  if (!fs.existsSync(p)) return
  const raw = fs.readFileSync(p, 'utf8')
  for (const b of BANNED_SUBSTRINGS) {
    if (raw.includes(b)) errors.push(`${name}: contains wrong project fragment "${b}"`)
  }
  for (const line of raw.split('\n')) {
    const t = line.trim()
    if (t.startsWith('#') || !t) continue
    if (t.startsWith('VITE_SUPABASE_URL=')) {
      const v = parseEnvValue(t)
      if (v && v !== FUELBOT_SUPABASE_URL) {
        errors.push(`${name}: VITE_SUPABASE_URL must be "${FUELBOT_SUPABASE_URL}" (got "${v}")`)
      }
    }
    if (t.startsWith('VITE_SUPABASE_ANON_KEY=')) {
      const v = parseEnvValue(t)
      const ref = v ? jwtRef(v) : null
      if (ref && ref !== FUELBOT_SUPABASE_PROJECT_REF) {
        errors.push(
          `${name}: VITE_SUPABASE_ANON_KEY JWT ref is "${ref}", expected "${FUELBOT_SUPABASE_PROJECT_REF}"`,
        )
      }
    }
  }
}

function checkMcpJson() {
  const p = path.join(ROOT, '.cursor/mcp.json')
  if (!fs.existsSync(p)) return
  const j = JSON.parse(fs.readFileSync(p, 'utf8'))
  const url = j.mcpServers?.supabase?.url ?? ''
  if (url && !url.includes(`project_ref=${FUELBOT_SUPABASE_PROJECT_REF}`)) {
    errors.push(
      `.cursor/mcp.json: set mcpServers.supabase.url to include project_ref=${FUELBOT_SUPABASE_PROJECT_REF}`,
    )
  }
}

function checkGitTrackedTextFiles() {
  let files
  try {
    files = execSync('git ls-files', { encoding: 'utf8', cwd: ROOT }).trim().split('\n').filter(Boolean)
  } catch {
    return
  }
  const ext = /\.(md|mdc|json|toml|ts|tsx|js|mjs|example|yaml|yml)$/i
  for (const f of files) {
    if (f === '.env' || f.includes('.env.') && !f.endsWith('.example')) continue
    if (!ext.test(f)) continue
    const full = path.join(ROOT, f)
    if (!fs.existsSync(full)) continue
    const raw = fs.readFileSync(full, 'utf8')
    for (const b of BANNED_SUBSTRINGS) {
      if (raw.includes(b)) errors.push(`git ${f}: contains banned ref "${b}"`)
    }
  }
}

checkEnvFile('.env')
checkEnvFile('.env.local')
checkMcpJson()
checkEnvFile('.env.example')
checkGitTrackedTextFiles()

if (errors.length) {
  console.error('Supabase project audit failed:\n' + errors.map((e) => `  - ${e}`).join('\n'))
  process.exit(1)
}

console.log(
  `OK — canonical Supabase project: ${FUELBOT_SUPABASE_PROJECT_REF}\n   API URL: ${FUELBOT_SUPABASE_URL}\n   Checked: .env, .env.local (if present), .env.example, .cursor/mcp.json, git text files for banned refs.`,
)
