import { ipcMain } from 'electron'
import WebSocket from 'ws'
import { randomUUID } from 'node:crypto'

const WS_URL = 'wss://dashscope.aliyuncs.com/api-ws/v1/inference/'

let ws: WebSocket | null = null
let wsConnectTimer: NodeJS.Timeout | null = null
let taskId: string | null = null
let isTranscribing = false
let taskStarted = false
let accumulatedText = ''
let currentPartial = ''

function sendToRenderer(channel: string, ...args: unknown[]) {
  const mainWindow = global.mainWindow
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, ...args)
  }
}

function cleanup() {
  if (wsConnectTimer) {
    clearTimeout(wsConnectTimer)
    wsConnectTimer = null
  }
  if (ws) {
    const sock = ws
    ws = null
    // Keep a no-op 'error' listener attached until after close(): closing a
    // still-CONNECTING socket emits 'error', and an unhandled 'error' event
    // on an EventEmitter throws — which previously swallowed the real reason
    // the connection failed (user saw no transcription and no error).
    sock.on('error', () => {})
    try {
      if (sock.readyState === WebSocket.OPEN || sock.readyState === WebSocket.CONNECTING) {
        sock.close()
      }
    } catch (e) {
      console.error('Error closing transcription websocket:', e)
    }
    sock.removeAllListeners()
  }
  taskId = null
  isTranscribing = false
  taskStarted = false
}

function startTranscription(apiKey: string) {
  if (isTranscribing) return

  cleanup()
  isTranscribing = true
  taskId = randomUUID()

  ws = new WebSocket(WS_URL, {
    headers: { Authorization: `bearer ${apiKey}` }
  })

  // Surface connection failures instead of silently waiting forever.
  // WS handshake normally completes in <1s; if it is still CONNECTING
  // after 10s the network / API key is likely the problem.
  wsConnectTimer = setTimeout(() => {
    if (ws && ws.readyState === WebSocket.CONNECTING) {
      console.error('Transcription WebSocket connection timed out')
      sendToRenderer(
        'transcription-error',
        '连接百炼语音服务超时，请检查网络或 API Key 是否正确'
      )
      cleanup()
      sendToRenderer('transcription-stopped')
    }
  }, 10000)

  ws.on('open', () => {
    if (wsConnectTimer) {
      clearTimeout(wsConnectTimer)
      wsConnectTimer = null
    }
    const runTask = {
      header: {
        action: 'run-task',
        task_id: taskId,
        streaming: 'duplex'
      },
      payload: {
        task_group: 'audio',
        task: 'asr',
        function: 'recognition',
        model: 'fun-asr-realtime',
        parameters: {
          format: 'pcm',
          sample_rate: 16000
        },
        input: {}
      }
    }
    ws!.send(JSON.stringify(runTask))
  })

  ws.on('message', (data: WebSocket.Data) => {
    try {
      const msg = JSON.parse(data.toString())
      const event = msg.header?.event

      if (event === 'task-started') {
        taskStarted = true
        return
      }

      if (event === 'result-generated') {
        const sentence = msg.payload?.output?.sentence
        if (!sentence) return

        const text: string = sentence.text || ''
        const sentenceEnd: boolean = sentence.sentence_end === true

        if (sentenceEnd) {
          if (text) {
            accumulatedText += (accumulatedText ? '' : '') + text
          }
          currentPartial = ''
        } else {
          currentPartial = text
        }

        sendToRenderer('transcription-text', {
          text: getTranscriptionText(),
          isPartial: !sentenceEnd
        })
        return
      }

      if (event === 'task-failed') {
        const errorMsg = msg.header?.error_message || '语音识别失败'
        console.error('Transcription task failed:', errorMsg)
        sendToRenderer('transcription-error', errorMsg)
        cleanup()
        sendToRenderer('transcription-stopped')
        return
      }

      if (event === 'task-finished') {
        cleanup()
        sendToRenderer('transcription-stopped')
      }
    } catch (e) {
      console.error('Failed to parse transcription message:', e)
    }
  })

  ws.on('error', (err) => {
    console.error('Transcription WebSocket error:', err)
    sendToRenderer('transcription-error', err.message || 'WebSocket 连接失败')
    cleanup()
    sendToRenderer('transcription-stopped')
  })

  ws.on('close', () => {
    if (isTranscribing) {
      isTranscribing = false
      sendToRenderer('transcription-stopped')
    }
    ws = null
    taskStarted = false
  })
}

function stopTranscription() {
  if (!isTranscribing) return

  if (ws && ws.readyState === WebSocket.OPEN && taskId && taskStarted) {
    const finishTask = {
      header: {
        action: 'finish-task',
        task_id: taskId,
        streaming: 'duplex'
      },
      payload: {
        input: {}
      }
    }
    ws.send(JSON.stringify(finishTask))
  }

  isTranscribing = false
  cleanup()
  sendToRenderer('transcription-stopped')
}

function handleAudioChunk(chunk: ArrayBuffer) {
  if (!ws || ws.readyState !== WebSocket.OPEN || !taskStarted) return
  ws.send(Buffer.from(chunk))
}

export function getTranscriptionText(): string {
  return accumulatedText + currentPartial
}

export function clearTranscriptionText() {
  accumulatedText = ''
  currentPartial = ''
}

ipcMain.handle('start-transcription', (_event, apiKey: string) => {
  startTranscription(apiKey)
})

ipcMain.handle('stop-transcription', () => {
  stopTranscription()
})

ipcMain.on('transcription-audio-chunk', (_event, chunk: ArrayBuffer) => {
  handleAudioChunk(chunk)
})

ipcMain.handle('get-transcription-text', () => {
  return getTranscriptionText()
})

ipcMain.handle('clear-transcription-text', () => {
  clearTranscriptionText()
})
