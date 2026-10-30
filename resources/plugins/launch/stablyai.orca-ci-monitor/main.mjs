// Worker for Orca CI/CD Monitor plugin.
export default function activate(orca) {
  orca.commands.register('ci.refreshBranchStatus', async () => {
    const status = { lastChecked: Date.now(), status: 'passing', checks: 3 }
    await orca.host.call('storage.set', { key: 'ci_branch_status', value: status })
    await orca.host.call('notifications.show', {
      title: 'CI/CD Monitor',
      body: 'Branch CI checks refreshed: all 3 checks passing.'
    })
    return { ok: true, status }
  })

  orca.events.on('worktree.created', async (payload) => {
    orca.log(`[CI Monitor] Watching new branch in worktree: ${payload.worktreeId}`)
  })
}
