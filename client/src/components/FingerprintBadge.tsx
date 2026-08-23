import { motion } from 'motion/react'
import { cn } from '../lib/cn'

export interface SealFingerprint {
  words: string
  color: string
}

/**
 * A human-verifiable seal: derive from the secret so the sender and
 * recipient can confirm out-of-band ("read me your 4 words") that the
 * paste received is the paste that was sent.
 */
export function FingerprintBadge({ fp, className }: { fp: SealFingerprint; className?: string }) {
  const words = fp.words.split(' ')
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <motion.span
        layout
        className="flex size-9 shrink-0 items-center justify-center rounded-full font-mono text-xs font-bold text-white shadow-inner"
        style={{ backgroundColor: fp.color }}
        aria-hidden
      >
        {words[0]?.charAt(0).toUpperCase()}
      </motion.span>
      <div>
        <p className="font-mono text-sm font-semibold tracking-wide">{fp.words}</p>
        <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
          Seal fingerprint — verify this phrase with your recipient over a separate channel
        </p>
      </div>
    </div>
  )
}