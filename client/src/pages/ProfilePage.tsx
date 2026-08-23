import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'motion/react'
import { toast } from 'sonner'
import { Badge, Button, Card, TextInput } from '../components/ui'
import {
  addVaultContact,
  getTrackedPastes,
  listVaultContacts,
  loadAccountProfile,
  removeVaultContact,
  saveAccountBio,
  signOut,
  type AccountProfile,
  type TrackedPaste,
  type VaultContact,
} from '../lib/supabase'
import { useAuth } from '../lib/auth'

export function ProfilePage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [profile, setProfile] = useState<AccountProfile | null>(null)
  const [pastes, setPastes] = useState<TrackedPaste[]>([])
  const [bio, setBio] = useState('')
  const [contactUsername, setContactUsername] = useState('')
  const [contacts, setContacts] = useState<VaultContact[]>([])
  const [loading, setLoading] = useState(true)
  const [profileError, setProfileError] = useState<string | null>(null)
  const [savingBio, setSavingBio] = useState(false)
  const [addingContact, setAddingContact] = useState(false)
  const [removingContactId, setRemovingContactId] = useState<string | null>(null)
  const [signingOut, setSigningOut] = useState(false)

  useEffect(() => {
    if (!user) return

    let active = true
    setLoading(true)
    setProfileError(null)
    setPastes(getTrackedPastes())

    void Promise.all([loadAccountProfile(user), listVaultContacts()])
      .then(([nextProfile, nextContacts]) => {
        if (!active) return
        setProfile(nextProfile)
        setBio(nextProfile.bio)
        setContacts(nextContacts)
      })
      .catch((error: unknown) => {
        if (!active) return
        setProfileError(error instanceof Error ? error.message : 'Your profile could not be loaded.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [user])

  async function handleSaveProfile() {
    if (!user || !profile) return
    try {
      setSavingBio(true)
      await saveAccountBio(user.id, bio)
      const savedBio = bio.trim()
      setBio(savedBio)
      setProfile((current) => current ? { ...current, bio: savedBio } : current)
      toast.success('Profile bio saved privately to your account.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Profile bio could not be saved.')
    } finally {
      setSavingBio(false)
    }
  }

  async function handleAddContact() {
    try {
      setAddingContact(true)
      const contact = await addVaultContact(contactUsername)
      setContacts((current) => [...current, contact])
      setContactUsername('')
      toast.success(`Saved @${contact.username} to your private contact list.`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Contact could not be saved.')
    } finally {
      setAddingContact(false)
    }
  }

  async function handleRemoveContact(contact: VaultContact) {
    try {
      setRemovingContactId(contact.id)
      await removeVaultContact(contact.id)
      setContacts((current) => current.filter((item) => item.id !== contact.id))
      toast.success(`Removed @${contact.username} from your contact list.`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Contact could not be removed.')
    } finally {
      setRemovingContactId(null)
    }
  }

  async function handleSignOut() {
    try {
      setSigningOut(true)
      await signOut()
      toast.success('Signed out of Lock Note.')
      navigate('/', { replace: true })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Sign-out could not be completed.')
    } finally {
      setSigningOut(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center gap-3" role="status" aria-live="polite">
        <span className="size-5 rounded-full border-2 border-lilac-deep border-t-lilac-dark animate-spin" aria-hidden />
        <span className="text-sm text-zinc-500">Loading your private account settings…</span>
      </div>
    )
  }

  if (!profile || profileError) {
    return (
      <div className="mx-auto max-w-lg pt-20 text-center">
        <Card className="space-y-4 p-8">
          <h1 className="font-display text-xl font-bold">Your account settings are unavailable</h1>
          <p className="text-sm text-zinc-500">
            {profileError ?? 'Refresh this page after your secure session is restored.'}
          </p>
          <div className="flex justify-center gap-2">
            <Button variant="secondary" onClick={() => window.location.reload()}>Try again</Button>
            <Link to="/dashboard"><Button>Return to library</Button></Link>
          </div>
        </Card>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8 pb-20 pt-8">
      <p className="sr-only" aria-live="polite">{contacts.length} saved vault contacts.</p>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <Card className="space-y-6 border-lilac-deep/30 p-6 shadow-xl">
          <div className="flex flex-col justify-between gap-4 border-b border-lilac-deep/20 pb-6 sm:flex-row sm:items-center dark:border-void-line">
            <div className="flex items-center gap-4">
              <img
                src={profile.avatarUrl}
                alt={`${profile.username}'s profile avatar`}
                className="size-16 rounded-2xl border-2 border-lilac-deep/50 object-cover shadow-md"
              />
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h1 className="font-display text-2xl font-black text-zinc-900 dark:text-zinc-100">{profile.name}</h1>
                  <Badge tone="emerald" className="text-[10px] font-bold uppercase">{profile.provider} verified</Badge>
                </div>
                <p className="text-xs font-mono font-bold text-lilac-dark dark:text-lilac-deep">
                  @{profile.username} <span className="font-sans font-normal text-zinc-500">· {profile.email}</span>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Link to="/dashboard"><Button variant="secondary" size="sm" className="font-bold">View library ({pastes.length})</Button></Link>
              <Button variant="danger" size="sm" loading={signingOut} onClick={() => void handleSignOut()} className="font-bold">Sign out</Button>
            </div>
          </div>

          <div className="space-y-2">
            <label htmlFor="account-bio" className="flex items-center gap-1.5 text-xs font-bold text-zinc-700 dark:text-zinc-300">
              <span aria-hidden>✍️</span> Account bio
            </label>
            <p id="account-bio-hint" className="text-xs text-zinc-500">Optional account metadata. Do not place secret text, share links, passphrases, or keys here.</p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <TextInput
                id="account-bio"
                value={bio}
                maxLength={160}
                aria-describedby="account-bio-hint"
                onChange={(e) => setBio(e.target.value)}
                placeholder="Write a short public-facing account bio..."
                className="flex-1 text-xs"
              />
              <Button size="sm" loading={savingBio} onClick={() => void handleSaveProfile()} className="shrink-0 font-bold">Save bio</Button>
            </div>
          </div>
        </Card>
      </motion.div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <Card className="space-y-4 border-lilac-deep/25 p-5">
          <div className="flex items-center justify-between border-b border-lilac-deep/20 pb-3 dark:border-void-line">
            <div>
              <h2 className="flex items-center gap-2 font-display text-base font-bold text-zinc-900 dark:text-zinc-100"><span aria-hidden>👥</span> Vault contacts</h2>
              <p className="mt-1 text-[11px] text-zinc-500">Private, account-scoped GitHub usernames. These are not collaboration permissions.</p>
            </div>
            <Badge tone="lilac" className="text-[10px]">{contacts.length} saved</Badge>
          </div>

          <div className="flex gap-2">
            <TextInput
              id="vault-contact"
              value={contactUsername}
              onChange={(e) => setContactUsername(e.target.value)}
              placeholder="github_username"
              aria-label="GitHub username to save as a vault contact"
              autoComplete="off"
              className="flex-1 text-xs"
            />
            <Button size="sm" loading={addingContact} onClick={() => void handleAddContact()} className="shrink-0">Add</Button>
          </div>

          <div className="space-y-2 pt-1">
            {contacts.length === 0 ? (
              <p className="rounded-xl border border-dashed border-lilac-deep/25 p-3 text-xs text-zinc-500">No contacts saved yet. Saving a username never shares secret content or grants access.</p>
            ) : contacts.map((contact) => (
              <div key={contact.id} className="flex items-center justify-between gap-3 rounded-xl border border-lilac-deep/20 bg-white/40 p-2.5 text-xs dark:bg-void-soft/40">
                <span className="min-w-0 truncate font-mono font-bold text-zinc-800 dark:text-zinc-200">@{contact.username}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  loading={removingContactId === contact.id}
                  onClick={() => void handleRemoveContact(contact)}
                  aria-label={`Remove ${contact.username} from vault contacts`}
                >
                  Remove
                </Button>
              </div>
            ))}
          </div>
        </Card>

        <Card className="space-y-4 border-lilac-deep/25 p-5">
          <div className="flex items-center justify-between border-b border-lilac-deep/20 pb-3 dark:border-void-line">
            <h2 className="flex items-center gap-2 font-display text-base font-bold text-zinc-900 dark:text-zinc-100"><span aria-hidden>🛡️</span> Security statistics</h2>
            <Badge tone="mint" className="text-[10px]">Zero-knowledge</Badge>
          </div>

          <div className="space-y-2.5 font-mono text-xs">
            <div className="flex justify-between rounded-lg border border-lilac-deep/20 bg-white/40 p-2 dark:bg-void-soft/40"><span className="text-zinc-500">Tracked pastes:</span><strong className="text-lilac-dark dark:text-lilac-deep">{pastes.length}</strong></div>
            <div className="flex justify-between rounded-lg border border-lilac-deep/20 bg-white/40 p-2 dark:bg-void-soft/40"><span className="text-zinc-500">Active share links:</span><strong className="text-emerald-600 dark:text-emerald-400">{pastes.filter((paste) => !paste.isBurned).length}</strong></div>
            <div className="flex justify-between rounded-lg border border-lilac-deep/20 bg-white/40 p-2 dark:bg-void-soft/40"><span className="text-zinc-500">Default cipher:</span><strong className="text-zinc-800 dark:text-zinc-200">AES-256-GCM</strong></div>
          </div>

          <p className="rounded-xl border border-amber-500/25 bg-amber-50/60 p-3 text-[11px] leading-5 text-amber-950 dark:bg-amber-400/5 dark:text-amber-100">
            Tracked paste links and owner capabilities stay only in this browser. Lock Note does not sync them to your profile because that would weaken the zero-knowledge sharing model.
          </p>
        </Card>
      </div>
    </div>
  )
}
