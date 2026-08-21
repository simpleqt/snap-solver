/**
 * Shared types for the LAN mobile display feature. This module must stay
 * import-free: it is pulled into both the node (main/preload) and web
 * (renderer via preload/index.d.ts) TypeScript programs.
 */

/** Solution lifecycle events mirrored from the desktop IPC stream. */
export type MobileSolutionEvent =
  | 'solution-clear'
  | 'screenshots-updated'
  | 'screenshot-taken'
  | 'ai-loading-start'
  | 'ai-loading-end'
  | 'solution-chunk'
  | 'solution-error'
  | 'solution-complete'
  | 'solution-stopped'

export interface MobileServerInfo {
  running: boolean
  port: number
  token: string
  urls: string[]
  clientCount: number
  error: string | null
}

/**
 * Hooks into desktop-side logic (window control, stream control, screenshot
 * capture), registered by shortcuts.ts to keep the import graph acyclic.
 */
export interface MobileController {
  hideMainWindow: () => void
  showMainWindow: () => void
  /** Show the desktop window when hidden, hide it when visible */
  toggleMainWindow: () => void
  stopStream: () => void
  sendFollowUp: (question: string) => Promise<{ success: boolean; error?: string }>
  /** Phone-initiated capture: takes a screenshot without any desktop input */
  takeScreenshot: () => void | Promise<void>
  appendScreenshot: () => void | Promise<void>
}
