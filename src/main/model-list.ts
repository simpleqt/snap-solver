import { ipcMain } from 'electron'
import { settings } from './settings'

/**
 * Fetch the model list from an OpenAI-compatible provider (GET /models).
 * Runs in the main process to avoid renderer CORS restrictions.
 */
ipcMain.handle(
  'list-models',
  async (_event, params: { baseURL?: string; apiKey?: string } | undefined) => {
    const baseURL = (params?.baseURL || settings.apiBaseURL || '').replace(/\/+$/, '')
    const apiKey = params?.apiKey || settings.apiKey
    if (!baseURL || !apiKey) {
      return { success: false as const, error: '请先填写 API Base URL 和 API Key' }
    }
    try {
      const res = await fetch(`${baseURL}/models`, {
        headers: { Authorization: `Bearer ${apiKey}` }
      })
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        return {
          success: false as const,
          error: `HTTP ${res.status}${text ? `：${text.slice(0, 200)}` : ''}`
        }
      }
      const json = (await res.json()) as { data?: { id?: string }[] }
      const models = (json.data ?? [])
        .map((m) => m.id)
        .filter((id): id is string => !!id)
        .sort()
      return { success: true as const, models }
    } catch (error) {
      return {
        success: false as const,
        error: error instanceof Error ? error.message : String(error)
      }
    }
  }
)
