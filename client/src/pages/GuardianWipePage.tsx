import { useState } from 'react'
import { toast } from 'sonner'
import { api } from '../lib/api'
import { combineGuardianShares } from '../lib/guardian-wipe'
import { Button, Card } from '../components/ui'

function extractShares(value: string): string[] {
  const matched = value.match(/LNGW1\.[A-Za-z0-9_.-]+/g)
  if (matched?.length) return matched
  return value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
}

export function GuardianWipePage() {
  const [cards, setCards] = useState('')
  const [busy, setBusy] = useState(false)
  const [success, setSuccess] = useState<{ pasteId: string; threshold: number; total: number } | null>(null)

  async function withdraw(): Promise<void> {
    setBusy(true)
    try {
      const assembled = await combineGuardianShares(extractShares(cards))
      await api.guardianWipe(assembled.pasteId, assembled.capability)
      setSuccess({ pasteId: assembled.pasteId, threshold: assembled.threshold, total: assembled.total })
      toast.success('Guardian quorum withdrew the note')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Guardian Wipe could not be completed.')
    } finally {
      setBusy(false)
    }
  }

  if (success) {
    return (
      <div className="mx-auto max-w-2xl pt-16">
        <Card className="border-rose-500/30 p-8 text-center">
          <span aria-hidden className="text-4xl">🛡️</span>
          <h1 className="mt-4 font-display text-2xl font-bold">Guardian Wipe completed</h1>
          <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-zinc-600 dark:text-zinc-300">
            A {success.threshold}-of-{success.total} guardian quorum withdrew the server copy for this note. Guardian cards could not decrypt the note and did not reveal a delivery key.
          </p>
          <p className="mt-4 font-mono text-xs text-zinc-400">Note reference: {success.pasteId}</p>
          <Button className="mt-6" onClick={() => { setCards(''); setSuccess(null) }}>Withdraw another note</Button>
        </Card>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl pt-12 pb-20">
      <Card className="overflow-hidden border-amber-500/30">
        <div className="border-b border-amber-600/20 bg-amber-50/70 p-6 dark:bg-amber-500/5 dark:border-amber-400/20">
          <p className="vault-kicker text-amber-700 dark:text-amber-300">Emergency recovery console</p>
          <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">Guardian Wipe</h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-zinc-600 dark:text-zinc-300">
            Paste the required number of Guardian Wipe cards. They are validated and combined in this browser to reconstruct a revocation capability only. Do not paste a delivery link, decryption key, or passphrase here.
          </p>
        </div>
        <div className="p-6">
          <label htmlFor="guardian-cards" className="block text-sm font-semibold">Guardian recovery cards</label>
          <textarea
            id="guardian-cards"
            value={cards}
            onChange={(event) => setCards(event.target.value)}
            placeholder={'Paste each full Guardian Wipe card here, separated by a blank line.\n\nThe console will detect the encoded shares and reject mismatched or duplicate cards.'}
            className="mt-2 min-h-64 w-full rounded-xl border border-amber-700/25 bg-white p-4 font-mono text-xs leading-5 text-zinc-800 shadow-inner focus:border-amber-600 focus:outline-none dark:border-void-line dark:bg-void dark:text-zinc-200"
            autoComplete="off"
            spellCheck={false}
          />
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="max-w-md text-[11px] leading-5 text-zinc-500 dark:text-zinc-400">A successful wipe prevents future server delivery. It cannot erase a copy a recipient already decrypted, downloaded, or captured.</p>
            <Button variant="danger" loading={busy} onClick={() => void withdraw()}>Withdraw with guardian quorum</Button>
          </div>
        </div>
      </Card>
    </div>
  )
}
