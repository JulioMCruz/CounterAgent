#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..')
const manifestPath = process.env.AGENT_ENS_MANIFEST || path.join(root, 'ENS/agent-identities.json')
const pluginUrl = process.env.ENS_PLUGIN_URL || ''

const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'))
const agents = manifest.agents.map((agent) => ({
  role: agent.role,
  label: agent.label,
  displayName: agent.displayName,
  wallet: process.env[agent.walletEnv] || '',
  service: agent.service,
  endpoint: process.env[agent.endpointEnv] || '',
  description: agent.description,
  capabilities: agent.capabilities,
  protocols: agent.protocols,
}))

const request = {
  parentName: process.env.ENS_PARENT_NAME || manifest.parentName,
  manifestUri: process.env.AGENT_ENS_MANIFEST_URI || '',
  agents,
}

if (pluginUrl) {
  const response = await fetch(`${pluginUrl.replace(/\/$/, '')}/ens/agents/records`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(request),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok || payload.ok === false) {
    console.error(JSON.stringify({ ok: false, status: response.status, payload }, null, 2))
    process.exit(1)
  }
  console.log(JSON.stringify(payload, null, 2))
} else {
  const parentName = request.parentName.toLowerCase()
  const subnames = agents.map((agent) => `${agent.label || agent.role}.${parentName}`)
  console.log(JSON.stringify({ ok: true, parentName, subnames, request }, null, 2))
}
