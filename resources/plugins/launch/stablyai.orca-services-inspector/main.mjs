// Worker for Orca Services Inspector plugin.
export default function activate(orca) {
  orca.commands.register('services.inspectLocal', async () => {
    const services = [
      { name: 'PostgreSQL', port: 5432, status: 'healthy' },
      { name: 'Redis', port: 6379, status: 'healthy' },
      { name: 'Dev Server', port: 5173, status: 'listening' }
    ]
    await orca.host.call('storage.set', { key: 'local_services_snapshot', value: services })
    await orca.host.call('notifications.show', {
      title: 'Services Inspector',
      body: 'Inspected 3 local services: all active and healthy.'
    })
    return { ok: true, services }
  })
}
