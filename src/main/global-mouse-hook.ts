import { uIOhook } from 'uiohook-napi'

/**
 * Reference-counted wrapper around the global uIOhook singleton, shared by
 * consumers (double-click capture, wheel forwarding). The native thread only
 * runs while at least one consumer is active, so stopping one consumer never
 * kills another's events.
 */
let refCount = 0

export function acquireGlobalMouse(): void {
  if (refCount++ === 0) {
    uIOhook.start()
  }
}

export function releaseGlobalMouse(): void {
  if (refCount === 0) return
  if (--refCount === 0) {
    uIOhook.stop()
  }
}
