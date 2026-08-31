import { useEffect, useState } from 'react'
import { HashRouter, Routes, Route } from 'react-router'
import { toast } from 'sonner'
import { Toaster } from 'sonner'
import CoderPage from '@/coder'
import SettingsPage from '@/settings'
import HelpPage from '@/help'
import { useSettingsStore } from '@/lib/store/settings'
import { useShortcutsStore } from '@/lib/store/shortcuts'
import { getCloneableFields } from '@/lib/utils'

export default function App() {
  const [initialized, setInitialized] = useState(false)
  const settingsStore = useSettingsStore()
  const { shortcuts } = useShortcutsStore()

  useEffect(() => {
    window.api.getAppSettings().then((settings) => {
      const blankFields = Object.keys(settings).filter(
        (key) => settings[key] && !settingsStore[key]
      )
      settingsStore.syncSettings(
        blankFields.reduce(
          (acc, key) => {
            acc[key] = settings[key]
            return acc
          },
          {} as Partial<typeof settingsStore>
        )
      )
      setInitialized(true)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (initialized) {
      window.api.updateAppSettings(getCloneableFields(settingsStore))
    }
  }, [initialized, settingsStore])

  useEffect(() => {
    console.log('App initShortcuts:', shortcuts) // DEBUG: 检查新键
    window.api.initShortcuts(shortcuts)
    window.api.getShortcuts().then((shortcutsStatus) => {
      console.log('Shortcuts registered:', shortcutsStatus) // DEBUG: 主进程状态
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Cycle to the next prompt scene when the global shortcut is pressed
  useEffect(() => {
    const handleSwitch = () => {
      useSettingsStore.getState().cycleActiveScene()
      const { scenes, activeSceneId } = useSettingsStore.getState()
      const scene = scenes.find((s) => s.id === activeSceneId)
      if (scene) {
        toast.info(`已切换到提示词场景：${scene.name}`)
      }
    }
    window.api.onSwitchPromptScene(handleSwitch)
    return () => window.api.removeSwitchPromptSceneListener()
  }, [])

  // Cycle saved provider profiles (URL/Key/model/thinking per provider)
  useEffect(() => {
    const handleSwitch = () => {
      const profile = useSettingsStore.getState().cycleProviderProfile()
      if (profile) {
        toast.info(`已切换供应商：${profile.name}（${profile.model}）`)
      } else {
        toast.info('尚未保存供应商配置，可在「设置 → AI 设置」保存当前配置为方案')
      }
    }
    window.api.onSwitchProviderProfile(handleSwitch)
    return () => window.api.removeSwitchProviderProfileListener()
  }, [])

  // Mirror helper toggles that may be changed from the phone; skip redundant
  // sets to avoid a settings-push feedback loop
  useEffect(() => {
    window.api.onThinkingState(({ enabled }) => {
      if (useSettingsStore.getState().enableThinking !== enabled) {
        useSettingsStore.getState().updateSetting('enableThinking', enabled)
      }
    })
    window.api.onClickCaptureState(({ mode }) => {
      if (useSettingsStore.getState().clickCaptureMode !== mode) {
        useSettingsStore.getState().updateSetting('clickCaptureMode', mode)
      }
    })
    return () => {
      window.api.removeThinkingStateListener()
      window.api.removeClickCaptureStateListener()
    }
  }, [])

  // Mirror the interview assistant state (may be toggled from the phone);
  // skip redundant sets to avoid a settings-push feedback loop
  useEffect(() => {
    const handleState = ({ enabled }: { enabled: boolean }) => {
      if (useSettingsStore.getState().interviewAssistantEnabled !== enabled) {
        useSettingsStore.getState().updateSetting('interviewAssistantEnabled', enabled)
      }
    }
    window.api.onAssistantState(handleState)
    return () => window.api.removeAssistantStateListener()
  }, [])

  // Auto-update notifications (quiet toasts instead of blocking dialogs)
  useEffect(() => {
    window.api.onUpdateStatus((info) => {
      if (info.status === 'downloaded') {
        toast.success(`新版本 v${info.version ?? ''} 已就绪，退出应用时自动安装`, {
          description: '可到「设置 → 版本与更新」立即重启更新'
        })
      } else if (info.status === 'downloading' && (info.progress ?? 0) === 0) {
        toast.info(`发现新版本 v${info.version ?? ''}，正在后台下载…`)
      }
    })
    return () => {
      window.api.removeUpdateStatusListener()
    }
  }, [])

  return (
    <>
      <HashRouter>
        <Routes>
          <Route index element={<CoderPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="help" element={<HelpPage />} />
        </Routes>
      </HashRouter>

      <Toaster />
    </>
  )
}
