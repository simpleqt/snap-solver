import { useEffect, useRef } from 'react'
import { useSettingsStore } from '@/lib/store/settings'
import { useAppStore } from '@/lib/store/app'
import { useTranscriptionStore } from '@/lib/store/transcription'
import { useSolutionStore } from '@/lib/store/solution'
import { startAudioCapture, stopAudioCapture } from '@/lib/audio-capture'

import { AppHeader } from './AppHeader'
import { AppContent } from './AppContent'
import { AppStatusBar } from './AppStatusBar'
import { PrerequisitesChecker } from './PrerequisitesChecker'
import { TranscriptionBar } from './TranscriptionBar'
import { InterviewAssistantPanel } from './InterviewAssistantPanel'

export default function CoderPage() {
  const { opacity, dashscopeApiKey } = useSettingsStore()
  const { syncAppState } = useAppStore()
  const { isTranscribing, setIsTranscribing, setTranscriptionText, clearText } =
    useTranscriptionStore()
  const { setErrorMessage } = useSolutionStore()

  useEffect(() => {
    document.body.style.opacity = opacity.toString()
    return () => {
      document.body.style.opacity = ''
    }
  }, [opacity])

  useEffect(() => {
    window.api.updateAppState({ inCoderPage: true })
    return () => {
      window.api.updateAppState({ inCoderPage: false })
    }
  }, [])

  useEffect(() => {
    window.api.onSyncAppState((state) => {
      syncAppState(state)
    })
    return () => {
      window.api.removeSyncAppStateListener()
    }
  }, [syncAppState])

  useEffect(() => {
    const handleToggle = async () => {
      if (isTranscribing) {
        stopAudioCapture()
        await window.api.stopTranscription()
        setIsTranscribing(false)
      } else {
        if (!dashscopeApiKey) {
          setErrorMessage('请先在设置中配置百炼平台 API Key')
          return
        }
        try {
          await startAudioCapture()
          await window.api.startTranscription(dashscopeApiKey)
          setIsTranscribing(true)
          setErrorMessage(null)
        } catch (err) {
          console.error('Failed to start transcription:', err)
          stopAudioCapture()
          setErrorMessage('启动语音转录失败，请检查系统音频权限')
        }
      }
    }

    window.api.onToggleTranscription(handleToggle)
    return () => {
      window.api.removeToggleTranscriptionListener()
    }
  }, [isTranscribing, dashscopeApiKey, setIsTranscribing, setErrorMessage])

  useEffect(() => {
    window.api.onTranscriptionText((data) => {
      setTranscriptionText(data.text)
    })
    window.api.onTranscriptionError((message) => {
      setErrorMessage(message)
      setIsTranscribing(false)
      stopAudioCapture()
    })
    window.api.onTranscriptionStopped(() => {
      setIsTranscribing(false)
    })
    window.api.onTranscriptionCleared(() => {
      clearText()
    })

    return () => {
      window.api.removeTranscriptionTextListener()
      window.api.removeTranscriptionErrorListener()
      window.api.removeTranscriptionStoppedListener()
      window.api.removeTranscriptionClearedListener()
    }
  }, [setTranscriptionText, setErrorMessage, setIsTranscribing, clearText])

  useEffect(() => {
    return () => {
      if (useTranscriptionStore.getState().isTranscribing) {
        stopAudioCapture()
        window.api.stopTranscription()
      }
    }
  }, [])

  // Interview assistant audio lifecycle: the main process tells us when the
  // assistant turns on/off; we own the actual getDisplayMedia capture
  const assistantStartedCapture = useRef(false)
  useEffect(() => {
    const handleAssistantAudio = async (active: boolean) => {
      const transcription = useTranscriptionStore.getState()
      if (active) {
        if (transcription.isTranscribing) return
        if (!dashscopeApiKey) {
          setErrorMessage('实时助手需要先在设置中配置百炼平台 API Key')
          return
        }
        try {
          await startAudioCapture()
          await window.api.startTranscription(dashscopeApiKey)
          transcription.setIsTranscribing(true)
          assistantStartedCapture.current = true
        } catch (err) {
          console.error('Failed to start interview assistant capture:', err)
          stopAudioCapture()
          setErrorMessage('启动实时助手失败，请检查系统音频权限')
        }
      } else if (assistantStartedCapture.current) {
        assistantStartedCapture.current = false
        stopAudioCapture()
        await window.api.stopTranscription()
        useTranscriptionStore.getState().setIsTranscribing(false)
      }
    }
    window.api.onInterviewAssistantAudio(handleAssistantAudio)
    return () => {
      window.api.removeInterviewAssistantAudioListener()
    }
  }, [dashscopeApiKey, setErrorMessage])

  return (
    <div className="relative h-screen">
      <AppHeader />
      <InterviewAssistantPanel />
      <AppContent />
      <TranscriptionBar />
      <AppStatusBar />
      <PrerequisitesChecker />
    </div>
  )
}
