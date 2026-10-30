// Worker for Discord Rich Presence & Game Activity plugin.
import net from 'node:net'
import crypto from 'node:crypto'
import path from 'node:path'

const DEFAULT_CLIENT_ID = '1550289463022977054'
const RECONNECT_DELAY_MS = 10000

function getDiscordPipePath(index = 0) {
  if (process.platform === 'win32') {
    return `\\\\.\\pipe\\discord-ipc-${index}`
  }
  const xdg = process.env.XDG_RUNTIME_DIR
  const tmp = process.env.TMPDIR || process.env.TMP || process.env.TEMP || '/tmp'
  const base = xdg || tmp
  return path.join(base, `discord-ipc-${index}`)
}

export default function activate(orca) {
  let socket = null
  let isConnected = false
  let isReady = false
  let isEnabled = true
  let clientId = DEFAULT_CLIENT_ID
  let reconnectTimer = null
  let startTime = Math.floor(Date.now() / 1000)
  let currentActivity = {
    details: 'Desenvolvendo no Orca IDE',
    state: 'Agente Pronto',
    branch: 'main'
  }

  function sendFrame(opcode, payload) {
    if (!socket || socket.destroyed || !isConnected) {
      return
    }
    try {
      const payloadBuffer = Buffer.from(JSON.stringify(payload), 'utf8')
      const header = Buffer.alloc(8)
      header.writeUInt32LE(opcode, 0)
      header.writeUInt32LE(payloadBuffer.length, 4)
      socket.write(Buffer.concat([header, payloadBuffer]))
    } catch (err) {
      orca.log(`[Discord] Send frame error: ${err.message}`)
    }
  }

  function setActivity(activity) {
    if (!isReady || !isEnabled) {
      return
    }
    sendFrame(1, {
      cmd: 'SET_ACTIVITY',
      args: {
        pid: process.pid,
        activity: activity
          ? {
              details: activity.details || currentActivity.details,
              state: activity.state || currentActivity.state,
              timestamps: { start: startTime },
              assets: {
                large_image: 'orca',
                large_text: 'Orca IDE - Next-gen Agentic IDE',
                small_text: 'Orca'
              },
              buttons: [
                {
                  label: 'Conhecer o Orca',
                  url: 'https://github.com/stablyai/orca'
                }
              ]
            }
          : null
      },
      nonce: crypto.randomUUID()
    })
  }

  async function connect() {
    if (socket) {
      try {
        socket.destroy()
      } catch {}
      socket = null
    }

    isConnected = false
    isReady = false

    let connectedSocket = null
    for (let i = 0; i < 10; i++) {
      const pipePath = getDiscordPipePath(i)
      try {
        connectedSocket = await new Promise((resolve, reject) => {
          const s = net.connect(pipePath, () => resolve(s))
          s.once('error', reject)
        })
        orca.log(`[Discord] Connected to pipe ${pipePath}`)
        break
      } catch {
        // try next pipe index
      }
    }

    if (!connectedSocket) {
      orca.log('[Discord] No active Discord pipe found, will retry...')
      scheduleReconnect()
      return
    }

    socket = connectedSocket
    isConnected = true
    orca.log('[Discord] Connected to local pipe, sending handshake...')
    sendFrame(0, { v: 1, client_id: clientId })

    socket.on('data', (buffer) => {
      try {
        if (buffer.length < 8) {
          return
        }
        const opcode = buffer.readUInt32LE(0)
        const length = buffer.readUInt32LE(4)
        const raw = buffer.subarray(8, 8 + length).toString('utf8')
        const data = JSON.parse(raw)

        if (opcode === 1 && data.cmd === 'DISPATCH' && data.evt === 'READY') {
          isReady = true
          const user = data.data?.user
          orca.log(`[Discord] Rich Presence READY for ${user?.username ?? 'user'}`)
          setActivity(currentActivity)
        }
      } catch (parseErr) {
        orca.log(`[Discord] Parse error: ${parseErr.message}`)
      }
    })

    socket.on('error', (err) => {
      orca.log(`[Discord] IPC socket error: ${err.message}`)
      scheduleReconnect()
    })

    socket.on('close', () => {
      isConnected = false
      isReady = false
      scheduleReconnect()
    })
  }

  function scheduleReconnect() {
    if (reconnectTimer) {
      return
    }
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null
      if (isEnabled) {
        connect()
      }
    }, RECONNECT_DELAY_MS)
  }

  orca.commands.register('discord.togglePresence', async () => {
    isEnabled = !isEnabled
    if (isEnabled) {
      startTime = Math.floor(Date.now() / 1000)
      if (!isReady) {
        connect()
      } else {
        setActivity(currentActivity)
      }
    } else {
      setActivity(null)
    }
    await orca.host.call('notifications.show', {
      title: 'Discord Game Activity',
      body: isEnabled ? 'Rich Presence ativado no seu perfil.' : 'Rich Presence pausado.'
    })
    return { ok: true, enabled: isEnabled }
  })

  orca.commands.register('discord.updateActivity', async (args) => {
    if (args && typeof args === 'object') {
      if (args.details) {
        currentActivity.details = String(args.details)
      }
      if (args.state) {
        currentActivity.state = String(args.state)
      }
    }
    setActivity(currentActivity)
    return { ok: true, isReady, currentActivity }
  })

  orca.commands.register('discord.reconnect', async () => {
    connect()
    return { ok: true }
  })

  async function syncInitialContext() {
    try {
      const res = await orca.host.call('workspace.readContext')
      if (res?.value?.branch) {
        const branch = res.value.branch.replace(/^refs\/heads\//, '')
        currentActivity.details = `Worktree: ${branch}`
      }
      setActivity(currentActivity)
    } catch {}
  }

  orca.events.on('agent.status.changed', (payload) => {
    const isWorking =
      payload.state === 'running' || payload.state === 'working' || payload.state === 'busy'
    const stateName = isWorking
      ? 'Agente em Execução'
      : payload.state === 'idle'
        ? 'Agente Pronto'
        : `Agente: ${payload.state}`
    currentActivity.state = `${stateName} (${payload.worktreeId ? 'worktree ativa' : 'global'})`
    setActivity(currentActivity)
  })

  orca.events.on('worktree.created', (payload) => {
    currentActivity.details = `Worktree: ${payload.worktreeId}`
    setActivity(currentActivity)
  })

  orca.events.on('worktree.removed', () => {
    setActivity(currentActivity)
  })

  // Start connection immediately and fetch initial context
  connect()
  syncInitialContext()
}
