// Standalone Discord Rich Presence Bridge for Orca IDE
const net = require('node:net')
const crypto = require('node:crypto')
const path = require('node:path')
const { execSync } = require('node:child_process')

const CLIENT_ID = process.env.DISCORD_CLIENT_ID || '1550289463022977054'
const START_TIME = Math.floor(Date.now() / 1000)

function getDiscordPipePath(index = 0) {
  if (process.platform === 'win32') {
    return `\\\\.\\pipe\\discord-ipc-${index}`
  }
  const xdg = process.env.XDG_RUNTIME_DIR
  const tmp = process.env.TMPDIR || process.env.TMP || process.env.TEMP || '/tmp'
  const base = xdg || tmp
  return path.join(base, `discord-ipc-${index}`)
}

function getActiveBranch() {
  try {
    return (
      execSync('git rev-parse --abbrev-ref HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
        .toString()
        .trim() || 'main'
    )
  } catch {
    return 'main'
  }
}

function getRepoName() {
  try {
    const root = execSync('git rev-parse --show-toplevel', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim()
    return path.basename(root) || 'orca'
  } catch {
    return 'orca'
  }
}

let socket = null
let isConnected = false
let isReady = false

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
    console.error('[Discord Bridge] Send error:', err.message)
  }
}

function updatePresence() {
  if (!isReady) {
    return
  }
  const branch = getActiveBranch()
  const repo = getRepoName()

  sendFrame(1, {
    cmd: 'SET_ACTIVITY',
    args: {
      pid: process.pid,
      activity: {
        details: `Projeto: ${repo}`,
        state: `Branch: ${branch}`,
        timestamps: { start: START_TIME },
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

  let connected = null
  for (let i = 0; i < 10; i++) {
    const pipe = getDiscordPipePath(i)
    try {
      connected = await new Promise((resolve, reject) => {
        const s = net.connect(pipe, () => resolve(s))
        s.once('error', reject)
      })
      break
    } catch {}
  }

  if (!connected) {
    console.log('[Discord Bridge] Discord não detectado localmente. Tentando novamente em 10s...')
    setTimeout(connect, 10000)
    return
  }

  socket = connected
  isConnected = true
  console.log('[Discord Bridge] Conectado ao Discord IPC!')

  socket.on('data', (buf) => {
    try {
      if (buf.length < 8) {
        return
      }
      const opcode = buf.readUInt32LE(0)
      const len = buf.readUInt32LE(4)
      const data = JSON.parse(buf.subarray(8, 8 + len).toString('utf8'))

      if (opcode === 1 && data.cmd === 'DISPATCH' && data.evt === 'READY') {
        isReady = true
        console.log(
          `[Discord Bridge] Rich Presence ATIVO para: @${data.data?.user?.username ?? 'usuario'}`
        )
        updatePresence()
      }
    } catch {}
  })

  socket.on('error', (err) => {
    console.error('[Discord Bridge] Socket error:', err.message)
    scheduleReconnect()
  })

  socket.on('close', () => {
    isConnected = false
    isReady = false
    scheduleReconnect()
  })

  sendFrame(0, { v: 1, client_id: CLIENT_ID })
}

let reconnectTimer = null
function scheduleReconnect() {
  if (reconnectTimer) {
    return
  }
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    connect()
  }, 5000)
}

setInterval(updatePresence, 15000)
connect()
