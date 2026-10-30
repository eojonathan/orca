// Worker for Orca Agent Telemetry plugin.
export default function activate(orca) {
  orca.commands.register('telemetry.resetStats', async () => {
    await orca.host.call('storage.set', {
      key: 'agent_telemetry_stats',
      value: { promptTokens: 0, completionTokens: 0, totalTokens: 0, turns: 0, resets: 1 }
    })
    await orca.host.call('notifications.show', {
      title: 'Agent Telemetry',
      body: 'Session counters and token metrics have been reset.'
    })
    return { ok: true }
  })

  orca.events.on('agent.status.changed', async (payload) => {
    orca.log(
      `[Telemetry] Agent state changed: ${payload.state} in worktree: ${payload.worktreeId ?? 'global'}`
    )
    const stored = await orca.host
      .call('storage.get', { key: 'agent_telemetry_stats' })
      .catch(() => null)
    const stats =
      stored?.value && typeof stored.value === 'object'
        ? stored.value
        : { promptTokens: 0, completionTokens: 0, totalTokens: 0, turns: 0 }
    stats.turns = (stats.turns || 0) + 1
    await orca.host.call('storage.set', { key: 'agent_telemetry_stats', value: stats })
  })

  orca.events.on('worktree.created', async (payload) => {
    orca.log(`[Telemetry] New worktree tracked: ${payload.worktreeId}`)
  })
}
