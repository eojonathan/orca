import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parsePluginManifest, type PluginManifest } from './manifest/plugin-manifest'
import { pluginMarketplaceSchema } from './catalog/plugin-marketplace'

const launchRoot = join(process.cwd(), 'resources', 'plugins', 'launch')

function loadManifest(pluginDirName: string): PluginManifest {
  const manifestPath = join(launchRoot, pluginDirName, 'orca-plugin.json')
  expect(existsSync(manifestPath), `Manifest missing: ${manifestPath}`).toBe(true)
  const content = JSON.parse(readFileSync(manifestPath, 'utf8'))
  const result = parsePluginManifest(content)
  expect(result.ok, `Manifest failed validation: ${result.ok ? '' : result.error}`).toBe(true)
  if (!result.ok) {
    throw new Error(result.error)
  }
  return result.manifest
}

describe('Official Launch Plugins Suite', () => {
  const newPluginKeys = [
    'stablyai.orca-agent-telemetry',
    'stablyai.orca-ci-monitor',
    'stablyai.orca-services-inspector',
    'stablyai.orca-pre-pr-sentinel',
    'stablyai.orca-discord-presence'
  ] as const

  for (const pluginKey of newPluginKeys) {
    describe(`Plugin: ${pluginKey}`, () => {
      it('validates manifest contract, publisher, engine range, and files', () => {
        const manifest = loadManifest(pluginKey)
        expect(manifest.manifestVersion).toBe(1)
        expect(manifest.pluginApi).toBe(1)
        expect(manifest.publisher).toBe('stablyai')
        expect(manifest.engines.orca).toBe('>=1.4.0')
        expect(`${manifest.publisher}.${manifest.id}`).toBe(pluginKey)

        if (manifest.main) {
          const mainPath = join(launchRoot, pluginKey, manifest.main)
          expect(existsSync(mainPath), `main.mjs missing: ${mainPath}`).toBe(true)
        }

        for (const panel of manifest.contributes.panels) {
          const panelPath = join(launchRoot, pluginKey, panel.entry)
          expect(existsSync(panelPath), `panel entry missing: ${panelPath}`).toBe(true)
          expect(panel.title.length).toBeGreaterThan(0)
          expect(panel.icon).toBeDefined()
        }
      })
    })
  }

  it('verifies telemetry plugin specific subscriptions and capabilities', () => {
    const manifest = loadManifest('stablyai.orca-agent-telemetry')
    expect(manifest.contributes.events.map((e) => e.on)).toEqual([
      'agent.status.changed',
      'workspace.created'
    ])
    expect(manifest.capabilities.map((c) => c.kind)).toContain('workspace:read')
    expect(manifest.capabilities.map((c) => c.kind)).toContain('storage:own')
    expect(manifest.contributes.commands.map((c) => c.id)).toContain('telemetry.resetStats')
  })

  it('verifies ci monitor plugin capabilities and commands', () => {
    const manifest = loadManifest('stablyai.orca-ci-monitor')
    expect(manifest.capabilities.map((c) => c.kind)).toContain('terminal:send')
    expect(manifest.capabilities.map((c) => c.kind)).toContain('notifications:show')
    expect(manifest.contributes.commands.map((c) => c.id)).toContain('ci.refreshBranchStatus')
  })

  it('verifies services inspector plugin panel and commands', () => {
    const manifest = loadManifest('stablyai.orca-services-inspector')
    expect(manifest.contributes.panels[0].id).toBe('services-inspector')
    expect(manifest.contributes.commands[0].id).toBe('services.inspectLocal')
    expect(manifest.capabilities.map((c) => c.kind)).toContain('terminal:send')
  })

  it('verifies pre-pr sentinel plugin panel and commands', () => {
    const manifest = loadManifest('stablyai.orca-pre-pr-sentinel')
    expect(manifest.contributes.panels[0].id).toBe('pre-pr-sentinel')
    expect(manifest.contributes.commands[0].id).toBe('sentinel.runAudit')
    expect(manifest.capabilities.map((c) => c.kind)).toContain('workspace:read')
  })

  it('verifies discord presence plugin panel, commands and events', () => {
    const manifest = loadManifest('stablyai.orca-discord-presence')
    expect(manifest.contributes.panels[0].id).toBe('discord-presence')
    expect(manifest.contributes.panels[0].icon).toBe('bot')
    expect(manifest.contributes.commands.map((c) => c.id)).toContain('discord.togglePresence')
    expect(manifest.contributes.events.map((e) => e.on)).toContain('agent.status.changed')
    expect(manifest.capabilities.map((c) => c.kind)).toContain('workspace:read')
  })

  it('verifies orca-marketplace.json contains all 8 official plugins', () => {
    const raw = JSON.parse(readFileSync(join(launchRoot, 'orca-marketplace.json'), 'utf8'))
    const parsed = pluginMarketplaceSchema.parse(raw)
    const pluginIds = parsed.plugins.map((p) => p.id)

    expect(pluginIds).toEqual([
      'stablyai.orca-multipass-recipes',
      'stablyai.orca-agent-telemetry',
      'stablyai.orca-ci-monitor',
      'stablyai.orca-services-inspector',
      'stablyai.orca-pre-pr-sentinel',
      'stablyai.orca-discord-presence'
    ])
  })
})
