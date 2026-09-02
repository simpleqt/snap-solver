import { useSettingsStore } from '@/lib/store/settings'
import { X } from 'lucide-react'

/**
 * Floating mini bar for the fully-transparent answer mode: the way back to
 * the normal UI (settings etc.). Its padding acts as a drag region since the
 * title bar is hidden in this mode. Font colors are managed in settings.
 */
export function TransparentBar() {
  const updateSetting = useSettingsStore((s) => s.updateSetting)

  return (
    <div
      className="fixed top-1 right-2 z-50 flex items-center rounded-full bg-black/25 px-3 py-1.5 opacity-30 transition-opacity hover:opacity-100"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      <button
        className="flex items-center gap-0.5 text-[11px] leading-none text-white/80 hover:text-white cursor-pointer"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        onClick={() => updateSetting('transparentAnswerMode', false)}
      >
        <X className="h-3 w-3" />
        退出透明
      </button>
    </div>
  )
}
