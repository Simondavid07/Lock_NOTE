import { motion, useReducedMotion } from 'motion/react'
import { Card } from '../components/ui'

const PRINCIPLES = [
  {
    number: '01',
    title: 'The server never sees your key',
    body: 'Encryption happens in your browser before any bytes leave the device. The server stores only ciphertext, salt, and IV—never a usable key.',
  },
  {
    number: '02',
    title: 'The private half stays in the fragment',
    body: 'The decryption key follows the # in the URL. Browsers do not send that fragment to servers, so the recipient holds the important half of the link.',
  },
  {
    number: '03',
    title: 'Burn after reading means exactly once',
    body: 'A burn-on-read note is destroyed only after successful decryption. Wrong passphrases and tampered payloads can never cause accidental deletion.',
  },
  {
    number: '04',
    title: 'Each seal is tied to its own note',
    body: 'Every payload uses AES-256-GCM with the note id bound as authenticated data. Ciphertext from one note cannot be passed off as another.',
  },
  {
    number: '05',
    title: 'Silence can be an ending too',
    body: 'A dead switch removes a note after its silence window has elapsed. Notes that are never opened do not have to wait forever.',
  },
  {
    number: '06',
    title: 'A fingerprint gives you a human check',
    body: 'Each sealed note derives a readable fingerprint from its key. Sender and recipient can compare it out of band to confirm they have the same note.',
  },
]

export function AboutPage() {
  const reduceMotion = useReducedMotion()

  return (
    <div className="notes-page mx-auto max-w-5xl pb-20 pt-10 sm:pt-14">
      <motion.header
        initial={{ opacity: 0, y: reduceMotion ? 0 : 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: reduceMotion ? 0.01 : 0.7, ease: [0.22, 1, 0.36, 1] }}
        className="notes-hero"
      >
        <div className="max-w-2xl">
          <p className="hero-overline">Notes on private delivery</p>
          <h1 className="mt-5 font-display text-5xl font-semibold leading-[0.88] tracking-[-0.08em] text-zinc-900 dark:text-zinc-100 sm:text-7xl">What stays yours, stays yours.</h1>
        </div>
        <p className="max-w-md text-sm leading-7 text-zinc-600 dark:text-zinc-300">Most secure-sharing tools take custody of the key they promise to protect. Locknote is designed so that part never arrives here.</p>
      </motion.header>

      <motion.section
        initial={{ opacity: 0, y: reduceMotion ? 0 : 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: reduceMotion ? 0.01 : 0.65, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
        className="notes-introduction"
      >
        <span className="notes-introduction-mark">#</span>
        <p>The key is part of the address, not part of the delivery. That one distinction gives the sender and recipient a boundary the server cannot cross.</p>
      </motion.section>

      <section className="notes-principles">
        {PRINCIPLES.map((principle, index) => (
          <motion.article
            key={principle.number}
            initial={{ opacity: 0, y: reduceMotion ? 0 : 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.25 }}
            transition={{ duration: reduceMotion ? 0.01 : 0.55, delay: index * 0.045, ease: [0.22, 1, 0.36, 1] }}
          >
            <Card className="notes-principle h-full p-6">
              <span className="notes-principle-number">{principle.number}</span>
              <h2 className="mt-10 font-display text-2xl font-semibold leading-[0.96] tracking-[-0.055em] text-zinc-900 dark:text-zinc-100">{principle.title}</h2>
              <p className="mt-4 text-sm leading-6 text-zinc-600 dark:text-zinc-300">{principle.body}</p>
              <div className="mt-7 h-px w-11 bg-[#a54c3c]/45" />
            </Card>
          </motion.article>
        ))}
      </section>

      <motion.section
        initial={{ opacity: 0, y: reduceMotion ? 0 : 18 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.3 }}
        transition={{ duration: reduceMotion ? 0.01 : 0.65, ease: [0.22, 1, 0.36, 1] }}
        className="notes-boundary"
      >
        <p className="hero-overline">A useful boundary</p>
        <h2 className="mt-4 max-w-xl font-display text-4xl font-semibold leading-[0.92] tracking-[-0.07em] text-zinc-900 dark:text-zinc-100 sm:text-5xl">Private does not mean invulnerable.</h2>
        <div className="mt-8 grid gap-x-10 gap-y-4 border-t border-zinc-900/12 pt-7 text-sm leading-6 text-zinc-600 dark:border-white/12 dark:text-zinc-300 sm:grid-cols-2">
          <p><b>Devices still matter.</b> Encryption happens on the device reading the note, so a compromised device remains a compromised device.</p>
          <p><b>Links still deserve care.</b> Anyone who receives a share link can attempt to open it. Deliver it over a channel you trust.</p>
          <p><b>Servers can still be unavailable.</b> A note is only as durable as the place that stores its ciphertext.</p>
          <p><b>Fingerprints provide an extra check.</b> Compare them outside Locknote when you need to verify the note you received is the note that was sent.</p>
        </div>
      </motion.section>

      <p className="notes-footer">AES-256-GCM · HKDF-SHA256 / PBKDF2-SHA256 (600k) · FNV-1a fingerprints · auditable zero-knowledge architecture</p>
    </div>
  )
}
