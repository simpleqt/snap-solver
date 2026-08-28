import { systemPreferences } from 'electron'
import { uIOhook } from 'uiohook-napi'
import { settings, registerSettingsChangeHook, type ClickCaptureMode } from './settings'
import { acquireGlobalMouse, releaseGlobalMouse } from './global-mouse-hook'

/**
 * Global click-to-screenshot trigger: while enabled ('single' or 'double'),
 * quick left clicks anywhere fire the same flow as the screenshot shortcut.
 * Uses the global mouse hook singleton (uiohook-napi); macOS requires
 * Accessibility permission, which we prompt for on first enable.
 */

const DOUBLE_CLICK_WINDOW_MS = 400
const SINGLE_REARM_COOLDOWN_MS = 600 // debounce any burst of clicks
const DOUBLE_REARM_COOLDOWN_MS = 800 // avoid a busy triple-click firing twice

let hookRunning = false
let lastLeftDown = 0
let lastFiredAt = 0

// Registered by shortcuts.ts to avoid a circular import
let triggerCapture: (() => void) | null = null

export function registerDoubleClickTrigger(fn: () => void): void {
  triggerCapture = fn
}

function handleMouseDown(event: { button: unknown; clicks: number }): void {
  if (event.button !== 1) return // 1 = left button in libuiohook

  const now = Date.now()
  const prevDown = lastLeftDown
  lastLeftDown = now

  const cooldown =
    settings.clickCaptureMode === 'double' ? DOUBLE_REARM_COOLDOWN_MS : SINGLE_REARM_COOLDOWN_MS
  if (now - lastFiredAt < cooldown) return

  let triggered: boolean
  if (settings.clickCaptureMode === 'single') {
    // Any press fires, debounced by the cooldown above
    triggered = true
  } else if (settings.clickCaptureMode === 'double') {
    // Double mode: native click counter or two presses inside the window
    triggered = event.clicks === 2 || (prevDown > 0 && now - prevDown <= DOUBLE_CLICK_WINDOW_MS)
  } else {
    triggered = false
  }
  if (!triggered) return

  lastFiredAt = now
  try {
    triggerCapture?.()
  } catch (error) {
    console.error('Click capture failed:', error)
  }
}

function startHook(): void {
  if (hookRunning) return
  if (process.platform === 'darwin') {
    // The global mouse hook needs Accessibility permission; requesting pops
    // the system dialog pointing at System Settings on first enable
    try {
      if (!systemPreferences.isTrustedAccessibilityClient(false)) {
        systemPreferences.isTrustedAccessibilityClient(true)
        console.warn('Accessibility permission required for click capture')
      }
    } catch (error) {
      console.error('Failed to check accessibility permission:', error)
    }
  }
  try {
    uIOhook.on('mousedown', handleMouseDown)
    acquireGlobalMouse()
    hookRunning = true
  } catch (error) {
    console.error('Failed to start mouse hook:', error)
  }
}

function stopHook(): void {
  if (!hookRunning) return
  hookRunning = false
  lastLeftDown = 0
  try {
    uIOhook.removeAllListeners('mousedown')
    releaseGlobalMouse()
  } catch (error) {
    console.error('Failed to stop mouse hook:', error)
  }
}

/** Start/stop the mouse hook according to the configured capture mode. */
function syncHookState(): void {
  if (settings.clickCaptureMode !== 'off') {
    startHook()
  } else {
    stopHook()
  }
}

registerSettingsChangeHook((changed) => {
  if ('clickCaptureMode' in changed) {
    syncHookState()
  }
})

export type { ClickCaptureMode }
