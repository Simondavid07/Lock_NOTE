import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

interface CopyButtonProps {
  text: string
  label?: string
  /** Security: automatically clear the clipboard after this many seconds. */
  autoClearSeconds?: number
  className?: string
  compact?: boolean
}

export function CopyButton({ text, label = 'Copy', autoClearSeconds, className, compact }: CopyButtonProps) {
  const [copied, setCopied] = useState(false)
  const timerRef = useRef<number>(0)

  useEffect(() => () => window.clearTimeout(timerRef.current), [])

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      toast.success(autoClearSeconds ? `Copied — clipboard clears in ${autoClearSeconds}s` : 'Copied to clipboard')
      if (autoClearSeconds) {
        window.clearTimeout(timerRef.current)
        timerRef.current = window.setTimeout(async () => {
          const current = await navigator.clipboard.readText().catch(() => '')
          if (current === text) {
            await navigator.clipboard.writeText('').catch(() => undefined)
          }
        }, autoClearSeconds * 1000)
      }
    } catch {
      toast.error('Clipboard unavailable — copy manually')
    }
  }

  return (
    <button
      onClick={() => void copy()}
      className={
        className ??
        `inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors border
         ${copied ? 'border-emerald-500/40 text-emerald-600 dark:text-emerald-400' : 'border-zinc-300 dark:border-void-line text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/5'}`
      }
      aria-live="polite"
    >
      <span aria-hidden>{copied ? '✓' : compact ? '⧉' : '📋'}</span>
      {copied ? 'Copied' : label}
    </button>
  )
}