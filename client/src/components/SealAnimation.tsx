import { motion, useReducedMotion } from 'motion/react'
import { cn } from '../lib/cn'

export type SealPhase = 'idle' | 'encrypting' | 'uploading' | 'done'

const PHASE_LABEL: Record<SealPhase, string> = {
  idle: '',
  encrypting: 'Encrypting in your browser with AES-256-GCM…',
  uploading: 'Uploading sealed ciphertext payload…',
  done: 'Secret successfully sealed!',
}

export function SealAnimation({ phase }: { phase: SealPhase }) {
  const reduceMotion = useReducedMotion()
  const active = phase !== 'idle'

  return (
    <div className="relative flex flex-col items-center justify-center gap-4 py-10" role="status" aria-live="polite">
      <div className="relative size-32" aria-hidden>
        {active && (
          <motion.span
            className="absolute inset-0 rounded-full border-2 border-lilac-deep/40"
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: [0.8, 1.25, 0.95], opacity: [0, 0.6, 0] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: 'easeOut' }}
          />
        )}
        <svg viewBox="0 0 112 112" className="size-full">
          <defs>
            <linearGradient id="seal-ring" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#9b72cf" />
              <stop offset="50%" stopColor="#d4799a" />
              <stop offset="100%" stopColor="#8ec8e4" />
            </linearGradient>
            <linearGradient id="done-ring" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#7ed3a0" />
              <stop offset="100%" stopColor="#1e6b47" />
            </linearGradient>
          </defs>
          <circle cx="56" cy="56" r="50" fill="none" stroke="currentColor" strokeOpacity="0.1" strokeWidth="6" className="text-lilac-dark" />
          {active && phase !== 'done' && (
            <motion.circle
              cx="56"
              cy="56"
              r="50"
              fill="none"
              stroke="url(#seal-ring)"
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray="314"
              initial={{ strokeDashoffset: 314 }}
              animate={{ strokeDashoffset: phase === 'encrypting' ? 80 : 0, rotate: 360 }}
              transition={
                reduceMotion
                  ? { duration: 0.01 }
                  : { duration: 1.6, repeat: Infinity, ease: 'easeInOut' }
              }
              style={{ transformOrigin: 'center' }}
            />
          )}
          {phase === 'done' && (
            <motion.circle
              cx="56"
              cy="56"
              r="50"
              fill="none"
              stroke="url(#done-ring)"
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray="314"
              initial={{ strokeDashoffset: 314 }}
              animate={{ strokeDashoffset: 0 }}
              transition={reduceMotion ? { duration: 0.01 } : { duration: 0.5, ease: 'easeOut' }}
            />
          )}
        </svg>
        <motion.div
          className="absolute inset-0 flex items-center justify-center text-5xl drop-shadow-md"
          animate={phase === 'done' ? { scale: [1, 1.2, 1] } : { scale: [1, 1.06, 1] }}
          transition={{ duration: phase === 'done' ? 0.4 : 1.2, repeat: phase === 'done' ? 0 : Infinity, ease: 'easeOut' }}
        >
          <span aria-hidden>{phase === 'done' ? '🔓' : '🔒'}</span>
        </motion.div>
      </div>
      {active && (
        <motion.p
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className={cn(
            'text-sm font-semibold tracking-wide',
            phase === 'done' ? 'text-mint-dark dark:text-mint-deep' : 'gradient-text',
          )}
        >
          {PHASE_LABEL[phase]}
        </motion.p>
      )}
    </div>
  )
}