import { useReducedMotion } from 'motion/react'

/**
 * A restrained paper-and-ink atmosphere. It gives the product texture without
 * competing with the writing and sharing flow.
 */
export function VaultBackdrop() {
  const reduceMotion = useReducedMotion()

  return (
    <div className="vault-backdrop" aria-hidden>
      <div className="paper-grain" />
      <div className="paper-wash paper-wash-one" />
      <div className="paper-wash paper-wash-two" />
      {!reduceMotion && <div className="paper-thread" />}
    </div>
  )
}
