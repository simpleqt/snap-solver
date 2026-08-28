import { ipcMain } from 'electron'

// NOTE: this module is pulled into the web (renderer) TypeScript program via
// preload/index.ts, so it must not import node-only modules. Features that
// react to app state changes register a hook instead.
type AppStateChangeHook = (changed: Record<string, unknown>) => void
const appStateChangeHooks: AppStateChangeHook[] = []

/** Register a hook fired after app state is updated via the updateAppState IPC. */
export function registerAppStateHook(hook: AppStateChangeHook): void {
  appStateChangeHooks.push(hook)
}

/** Fire registered hooks; also used by in-process mutations (shortcut callbacks). */
export function notifyAppStateChange(changed: Record<string, unknown>): void {
  appStateChangeHooks.forEach((hook) => hook(changed))
}

ipcMain.handle('updateAppState', (_event, _state) => {
  Object.assign(state, _state)
  appStateChangeHooks.forEach((hook) => hook(_state))
})

export const state = {
  inCoderPage: false,
  ignoreMouse: false
}

export type AppState = typeof state
