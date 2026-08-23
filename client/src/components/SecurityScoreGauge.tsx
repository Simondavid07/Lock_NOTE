import { useMemo } from 'react'
import { motion } from 'motion/react'
import { Badge } from './ui'

interface SecurityScoreGaugeProps {
  burn: boolean
  deadSwitch: number
  hasPassphrase: boolean
  passphraseStrengthScore: number
  ttlSeconds: number
}

export function SecurityScoreGauge({
  burn,
  deadSwitch,
  hasPassphrase,
  passphraseStrengthScore,
  ttlSeconds,
}: SecurityScoreGaugeProps) {
  const { score, label, tone, factors } = useMemo(() => {
    let pts = 60 // Base Web Crypto AES-256-GCM score
    const details: string[] = ['AES-256-GCM (60%)']

    if (burn) {
      pts += 15
      details.push('Burn-on-Read (+15%)')
    }
    if (deadSwitch > 0) {
      pts += 10
      details.push('Dead Switch (+10%)')
    }
    if (hasPassphrase) {
      const passPts = 5 + passphraseStrengthScore * 2.5
      pts += passPts
      details.push(`Passphrase Gate (+${Math.round(passPts)}%)`)
    }
    if (ttlSeconds > 0 && ttlSeconds <= 86400) {
      pts += 5
      details.push('Short TTL (+5%)')
    }

    const finalScore = Math.min(100, Math.round(pts))
    const scoreLabel =
      finalScore >= 95 ? 'Maximum Vault' : finalScore >= 80 ? 'High Security' : 'Standard Vault'
    const scoreTone =
      finalScore >= 95 ? 'emerald' : finalScore >= 80 ? 'lilac' : 'powder'

    return { score: finalScore, label: scoreLabel, tone: scoreTone, factors: details }
  }, [burn, deadSwitch, hasPassphrase, passphraseStrengthScore, ttlSeconds])

  return (
    <div className="rounded-2xl border border-lilac-deep/20 bg-white/40 dark:bg-void-soft/40 p-3.5 backdrop-blur-md space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 font-mono text-[11px] font-bold text-zinc-700 dark:text-zinc-300">
          <span>🛡️</span> Security Rating
        </div>
        <Badge tone={tone as any} className="text-[10px] font-bold">{label}</Badge>
      </div>

      {/* Progress Arc Bar */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs font-mono font-extrabold">
          <span className="text-zinc-500 dark:text-zinc-400">Vault Score</span>
          <span className="text-lilac-dark dark:text-lilac-deep">{score}%</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-200/80 dark:bg-void-muted/80">
          <motion.div
            className="h-full rounded-full bg-gradient-to-r from-lilac-dark via-blush-dark to-mint-dark"
            initial={{ width: 0 }}
            animate={{ width: `${score}%` }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
          />
        </div>
      </div>

      <p className="text-[10px] text-zinc-400 font-mono leading-tight">
        {factors.join(' · ')}
      </p>
    </div>
  )
}
