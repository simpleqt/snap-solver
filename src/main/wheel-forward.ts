import { uIOhook } from 'uiohook-napi'
import { state, registerAppStateHook } from './state'
import { acquireGlobalMouse, releaseGlobalMouse } from './global-mouse-hook'

/**
 * Wheel forwarding for mouse-passthrough mode: with ignoreMouse enabled the
 * OS delivers nothing to the window, so we listen to the global wheel hook
 * and inject a synthetic mouseWheel event whenever the cursor is inside the
 * window bounds. Clicks and movement still pass through to apps underneath.
 */

let active = false

function toDelta(rotation: number): number {
  // Windows notches arrive as ±120, macOS as ±1 — normalize to ~40 px each
  const abs = Math.abs(rotation)
  const px = abs >= 100 ? abs / 3 : abs * 40
  return Math.sign(rotation) * Math.max(20, Math.min(200, px))
}

function handleWheel(event: { x: number; y: number; rotation: number; direction: number }): void {
  const win = global.mainWindow
  if (!win || win.isDestroyed() || !win.isVisible()) return

  const b = win.getBounds()
  if (event.x < b.x || event.x > b.x + b.width || event.y < b.y || event.y > b.y + b.height) {
    return
  }

  const horizontal = event.direction === 4 // WheelDirection.HORIZONTAL
  const delta = toDelta(event.rotation)
  win.webContents.sendInputEvent({
    type: 'mouseWheel',
    x: Math.round(event.x - b.x),
    y: Math.round(event.y - b.y),
    deltaX: horizontal ? delta : 0,
    deltaY: horizontal ? 0 : delta
  })
}

function setActive(on: boolean): void {
  if (on === active) return
  active = on
  console.log('[wheel-forward]', on ? 'activated' : 'deactivated')
  if (on) {
    uIOhook.on('wheel', handleWheel)
    acquireGlobalMouse()
  } else {
    uIOhook.removeAllListeners('wheel')
    releaseGlobalMouse()
  }
}

registerAppStateHook((changed) => {
  if ('ignoreMouse' in changed) {
    setActive(state.ignoreMouse)
  }
})
