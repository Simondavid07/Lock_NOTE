import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react'
import { motion } from 'motion/react'
import { cn } from '../lib/cn'

export function cnBase(...parts: Array<string | false | null | undefined>): string {
  return cn(...parts)
}

/* ── Button ── */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success'
type ButtonSize = 'sm' | 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'ink-button text-white disabled:opacity-60 disabled:cursor-not-allowed',
  secondary:
    'paper-button text-zinc-800 dark:text-zinc-100',
  ghost:
    'text-zinc-600 dark:text-zinc-300 hover:bg-zinc-900/[0.045] dark:hover:bg-white/[0.06] transition-colors',
  danger:
    'danger-button text-white disabled:opacity-60 disabled:cursor-not-allowed',
  success:
    'success-button text-white disabled:opacity-60 disabled:cursor-not-allowed',
}

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'h-8 px-3.5 text-xs gap-1.5 rounded-xl font-medium',
  md: 'h-10 px-5 text-sm gap-2 rounded-xl font-semibold',
  lg: 'h-12 px-7 text-base gap-2.5 rounded-2xl font-bold tracking-wide',
}

export function Button({ variant = 'primary', size = 'md', loading, className, children, disabled, onClick, type = 'button', ...rest }: ButtonProps) {
  return (
    <motion.button
      type={type}
      onClick={onClick}
      whileTap={{ scale: disabled || loading ? 1 : 0.96 }}
      whileHover={{ scale: disabled || loading ? 1 : 1.02, y: disabled || loading ? 0 : -1 }}
      transition={{ type: 'spring', stiffness: 450, damping: 25 }}
      className={cn(
        'relative inline-flex items-center justify-center overflow-hidden font-medium transition-all select-none cursor-pointer',
        'focus-visible:outline-2 focus-visible:outline-lilac-dark',
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      disabled={disabled || loading}
      aria-busy={loading}
      {...(rest as object)}
    >
      {loading && (
        <span aria-hidden className="size-4 rounded-full border-2 border-current border-t-transparent animate-spin" />
      )}
      {children}
    </motion.button>
  )
}

/* ── Card ── */

export function Card({ className, children, hoverGlow = false }: { className?: string; children: ReactNode; hoverGlow?: boolean }) {
  return (
    <motion.div
      whileHover={hoverGlow ? { y: -2, boxShadow: '0 12px 40px rgba(196, 157, 232, 0.18)' } : undefined}
      transition={{ type: 'spring', stiffness: 350, damping: 25 }}
      className={cn(
        'glass-card lift-card rounded-2xl transition-all duration-300',
        className,
      )}
    >
      {children}
    </motion.div>
  )
}

/* ── Switch ── */

interface SwitchProps {
  checked: boolean
  onCheckedChange: (v: boolean) => void
  label: string
  description?: string
  disabled?: boolean
  id?: string
}

export function Switch({ checked, onCheckedChange, label, description, disabled, id }: SwitchProps) {
  return (
    <label
      htmlFor={id}
      className={cn(
        'flex items-start gap-3 cursor-pointer rounded-xl p-2.5 transition-all select-none',
        'hover:bg-lilac/30 dark:hover:bg-white/5',
        disabled && 'opacity-50 cursor-not-allowed',
      )}
    >
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onCheckedChange(!checked)}
        className={cn(
          'relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-all focus-visible:outline-2 focus-visible:outline-lilac-dark',
          checked
            ? 'bg-[#a54c3c] shadow-md shadow-[#a54c3c]/25'
            : 'bg-zinc-200/90 shadow-inner dark:bg-void-muted',
        )}
      >
        <motion.span
          layout
          className="absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow-md"
          animate={{ x: checked ? 20 : 0 }}
          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
        />
      </button>
      <span className="min-w-0">
        <span className="block text-xs sm:text-sm font-semibold text-zinc-800 dark:text-zinc-100">{label}</span>
        {description && <span className="block text-[11px] text-zinc-400 dark:text-zinc-500 mt-0.5">{description}</span>}
      </span>
    </label>
  )
}

/* ── Badge ── */

export function Badge({
  children,
  tone = 'neutral',
  className,
}: {
  children: ReactNode
  tone?: 'neutral' | 'indigo' | 'lilac' | 'emerald' | 'rose' | 'amber' | 'powder' | 'mint'
  className?: string
}) {
  const tones = {
    neutral: 'border-zinc-900/10 bg-zinc-900/[0.035] text-zinc-600 dark:border-white/10 dark:bg-white/[0.06] dark:text-zinc-300',
    indigo:  'border-[#a54c3c]/20 bg-[#a54c3c]/8 text-[#8a4235] dark:border-[#e49380]/25 dark:bg-[#e49380]/12 dark:text-[#f0b0a1]',
    lilac:   'border-[#a54c3c]/20 bg-[#a54c3c]/8 text-[#8a4235] dark:border-[#e49380]/25 dark:bg-[#e49380]/12 dark:text-[#f0b0a1]',
    emerald: 'border-emerald-800/15 bg-emerald-800/7 text-emerald-800 dark:border-emerald-300/18 dark:bg-emerald-300/8 dark:text-emerald-200',
    rose:    'border-[#a54c3c]/20 bg-[#a54c3c]/8 text-[#8a4235] dark:border-[#e49380]/25 dark:bg-[#e49380]/12 dark:text-[#f0b0a1]',
    amber:   'border-amber-800/15 bg-amber-800/7 text-amber-800 dark:border-amber-200/18 dark:bg-amber-200/8 dark:text-amber-100',
    powder:  'border-sky-800/14 bg-sky-800/7 text-sky-800 dark:border-sky-200/16 dark:bg-sky-200/8 dark:text-sky-100',
    mint:    'border-emerald-800/15 bg-emerald-800/7 text-emerald-800 dark:border-emerald-300/18 dark:bg-emerald-300/8 dark:text-emerald-200',
  } as const
  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold backdrop-blur-md transition-all',
      tones[tone],
      className,
    )}>
      {children}
    </span>
  )
}

/* ── Inputs ── */

export function TextInput({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'h-11 w-full rounded-xl border bg-white/72 px-3.5 text-sm text-zinc-900 shadow-sm backdrop-blur-md dark:bg-void-soft/80 dark:text-zinc-100',
        'border-zinc-900/14 dark:border-white/12 shadow-xs',
        'placeholder:text-zinc-400 dark:placeholder:text-zinc-500 font-medium',
        'focus:border-lilac-dark focus:outline-none focus:ring-2 focus:ring-lilac-dark/20',
        'transition-all duration-200',
        className,
      )}
      {...rest}
    />
  )
}

export function TextArea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        'w-full rounded-xl border bg-white/72 px-3.5 py-2.5 text-sm text-zinc-900 shadow-sm backdrop-blur-md dark:bg-void-soft/80 dark:text-zinc-100',
        'border-zinc-900/14 dark:border-white/12 shadow-xs',
        'placeholder:text-zinc-400 dark:placeholder:text-zinc-500 font-medium',
        'focus:border-lilac-dark focus:outline-none focus:ring-2 focus:ring-lilac-dark/20',
        'transition-all duration-200',
        className,
      )}
      {...rest}
    />
  )
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">{label}</span>
        {hint && <span className="text-[11px] text-zinc-400 dark:text-zinc-500">{hint}</span>}
      </div>
      {children}
    </div>
  )
}

/* ── Kbd ── */

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded-lg border border-zinc-900/14 bg-white/70 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-zinc-600 shadow-xs backdrop-blur dark:border-white/12 dark:bg-void/70 dark:text-zinc-300">
      {children}
    </kbd>
  )
}