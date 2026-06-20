#!/usr/bin/env node
/**
 * Single source of truth for the FuelBot Supabase backend (self-hosted VPS).
 * Run: npm run audit:supabase
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')

const FUELBOT_SUPABASE_URL = 'https://fuelbot.lucas-dev-server.tech'
const FUELBOT_STUDIO_URL = 'https://studio.fuelbot.lucas-dev-server.tech'

/** Legacy cloud URL — must not appear in env or active docs. */
const LEGACY_CLOUD_URL = 'https://feenwusofmhnpuahekvu.supabase.co'

/** Known wrong refs / typos that have appeared in env or screenshots. */
const BANNED_SUBSTRINGS = ['feerywusofnhrpuahekvu', 'mykdmlcezekwxelxfvlr', 'feenwusofmhnpuahekvu.supabase.co']

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
    if (raw.includes(b)) errors.push(`${name}: contains legacy/banned fragment "${b}"`)
  }
  for (const line of raw.split('\n')) {
    const t = line.trim()
    if (t.startsWith('#') || !t) continue
    if (t.startsWith('VITE_SUPABASE_URL=')) {
      const v = parseEnvValue(t)
      if (v && v !== FUELBOT_SUPABASE_URL) {
        errors.push(`${name}: VITE_SUPABASE_URL must be "${FUELBOT_SUPABASE_URL}" (got "${v}")`)
      }
      if (v === LEGACY_CLOUD_URL) {
        errors.push(`${name}: still points at Supabase Cloud — use VPS URL`)
      }
    }
  }
}

function checkMcpJson() {
  const p = path.join(ROOT, '.cursor/mcp.json')
  if (!fs.existsSync(p)) return
  const raw = fs.readFileSync(p, 'utf8')
  if (raw.includes('mcp.supabase.com')) {
    errors.push('.cursor/mcp.json: remove Supabase Cloud MCP (use Studio on VPS for SQL)')
  }
}

checkEnvFile('.env')
checkEnvFile('.env.local')
checkEnvFile('.env.example')
checkMcpJson()

if (errors.length) {
  console.error('Supabase project audit failed:\n' + errors.map((e) => `  - ${e}`).join('\n'))
  process.exit(1)
}

console.log(
  `OK — VPS Supabase backend\n   API URL: ${FUELBOT_SUPABASE_URL}\n   Studio:  ${FUELBOT_STUDIO_URL}\n   Checked: .env, .env.local (if present), .env.example, .cursor/mcp.json`,
)
