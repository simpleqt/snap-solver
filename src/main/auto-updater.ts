import { app, ipcMain } from 'electron'
import { autoUpdater } from 'electron-updater'
import { settings, registerSettingsChangeHook } from './settings'

/**
 * Auto-update from GitHub Releases: checks after startup (and every 4 h),
 * downloads in the background, and installs silently over the existing
 * install path on quit (NSIS keeps the registry install location). macOS is
 * excluded — unsigned builds cannot auto-update, users download the dmg.
 */

const STARTUP_DELAY_MS = 15 * 1000
const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000

export interface UpdateStatus {
  status:
    | 'idle'
    | 'checking'
    | 'downloading'
    | 'downloaded'
    | 'not-available'
    | 'error'
    | 'unsupported'
  currentVersion: string
  version?: string
  progress?: number
  message?: string
}

let status: UpdateStatus = { status: 'idle', currentVersion: app.getVersion() }
let startupTimer: NodeJS.Timeout | null = null
let intervalTimer: NodeJS.Timeout | null = null
let lastAvailableVersion = ''
let initialized = false

function sendToRenderer(channel: string, ...args: unknown[]) {
  const mainWindow = global.mainWindow
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, ...args)
  }
}

function setStatus(next: Partial<UpdateStatus> & { status: UpdateStatus['status'] }): void {
  status = { ...status, ...next }
  sendToRenderer('update-status', status)
}

function checkNow(): UpdateStatus {
  if (!initialized) {
    setStatus({
      status: 'unsupported',
      message: 'macOS 暂不支持自动更新，请到 GitHub Releases 手动下载 dmg'
    })
    return status
  }
  if (status.status === 'checking' || status.status === 'downloading') {
    return status // a check/download is already in flight
  }
  autoUpdater.checkForUpdates().catch((err) => {
    console.error('Auto update check failed:', err)
    setStatus({ status: 'error', message: err instanceof Error ? err.message : String(err) })
  })
  setStatus({ status: 'checking', message: undefined })
  return status
}

function syncSchedule(): void {
  if (startupTimer) {
    clearTimeout(startupTimer)
    startupTimer = null
  }
  if (intervalTimer) {
    clearInterval(intervalTimer)
    intervalTimer = null
  }
  if (!initialized || !settings.autoUpdateEnabled) return
  startupTimer = setTimeout(() => {
    startupTimer = null
    checkNow()
  }, STARTUP_DELAY_MS)
  intervalTimer = setInterval(() => checkNow(), CHECK_INTERVAL_MS)
}

export function getUpdateStatus(): UpdateStatus {
  return status
}

export function initAutoUpdater(): void {
  // IPC is registered on every platform so the renderer UI stays consistent
  ipcMain.handle('get-update-status', () => getUpdateStatus())
  ipcMain.handle('check-update', () => checkNow())
  ipcMain.handle('install-update', () => {
    if (initialized && status.status === 'downloaded') {
      // Silent install over the current install path, relaunch after
      autoUpdater.quitAndInstall(true, true)
    }
    return getUpdateStatus()
  })

  registerSettingsChangeHook((changed) => {
    if ('autoUpdateEnabled' in changed) {
      syncSchedule()
    }
  })

  if (process.platform === 'darwin') {
    return
  }

  initialized = true
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () => setStatus({ status: 'checking', message: undefined }))
  autoUpdater.on('update-available', (info) => {
    lastAvailableVersion = info.version
    setStatus({ status: 'downloading', version: info.version, progress: 0 })
  })
  autoUpdater.on('download-progress', (progress) => {
    setStatus({
      status: 'downloading',
      version: lastAvailableVersion || undefined,
      progress: Math.round(progress.percent)
    })
  })
  autoUpdater.on('update-downloaded', (info) => {
    setStatus({ status: 'downloaded', version: info.version, progress: 100 })
  })
  autoUpdater.on('update-not-available', () =>
    setStatus({ status: 'not-available', message: undefined })
  )
  autoUpdater.on('error', (err) => {
    console.error('Auto update error:', err)
    setStatus({ status: 'error', message: err.message })
  })

  syncSchedule()
}
