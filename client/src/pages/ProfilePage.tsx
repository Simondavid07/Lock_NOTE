import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'motion/react'
import { toast } from 'sonner'
import { Badge, Button, Card, TextInput } from '../components/ui'
import { getTrackedPastes, type TrackedPaste } from '../lib/supabase'

interface AuthUser {
  username: string
  name: string
  avatarUrl: string
  email: string
  provider: string
  bio?: string
}

export function ProfilePage() {
  const navigate = useNavigate()
  const [user, setUser] = useState<AuthUser | null>(null)
  const [pastes, setPastes] = useState<TrackedPaste[]>([])
  const [bio, setBio] = useState('')
  const [friendUsername, setFriendUsername] = useState('')
  const [friends, setFriends] = useState<string[]>(['alex_crypto', 'sarah_dev', 'cyber_john'])

  useEffect(() => {
    const savedUser = localStorage.getItem('locknote:auth_user')
    if (savedUser) {
      try {
        const u = JSON.parse(savedUser)
        setUser(u)
        setBio(u.bio || 'Zero-Knowledge Security Researcher & Developer')
      } catch {}
    } else {
      // Default demo profile
      const demoUser = {
        username: 'Simondavid07',
        name: 'Simon David',
        avatarUrl: 'https://github.com/Simondavid07.png',
        email: 'simondavid@example.com',
        provider: 'github',
      }
      setUser(demoUser)
      setBio('Zero-Knowledge Security Researcher & Developer')
    }

    setPastes(getTrackedPastes())
  }, [])

  function handleSaveProfile() {
    if (!user) return
    const updated = { ...user, bio }
    setUser(updated)
    localStorage.setItem('locknote:auth_user', JSON.stringify(updated))
    toast.success('Profile bio updated!')
  }

  function handleAddFriend() {
    if (!friendUsername.trim()) return
    if (friends.includes(friendUsername.trim())) {
      toast.error('Friend already in your contact list')
      return
    }
    setFriends((prev) => [...prev, friendUsername.trim()])
    setFriendUsername('')
    toast.success(`Added @${friendUsername.trim()} to your vault network!`)
  }

  function handleSignOut() {
    localStorage.removeItem('locknote:auth_user')
    setUser(null)
    toast.success('Signed out of Locknote Vault')
    navigate('/')
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-md pt-20 text-center space-y-4">
        <Card className="p-8">
          <span className="text-4xl" aria-hidden>🔐</span>
          <h1 className="font-display text-xl font-bold">Please Sign In</h1>
          <p className="text-xs text-zinc-500">Sign in with GitHub to view your profile and managed secrets.</p>
          <Link to="/login">
            <Button className="mt-4">Sign In with GitHub</Button>
          </Link>
        </Card>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl pt-8 pb-20 space-y-8">
      
      {/* Profile Header Card */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <Card className="p-6 border-lilac-deep/30 shadow-xl space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-lilac-deep/20 dark:border-void-line">
            <div className="flex items-center gap-4">
              <img
                src={user.avatarUrl}
                alt={user.username}
                className="size-16 rounded-2xl border-2 border-lilac-deep/50 shadow-md object-cover"
              />
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h1 className="font-display text-2xl font-black text-zinc-900 dark:text-zinc-100">
                    {user.name}
                  </h1>
                  <Badge tone="emerald" className="text-[10px] uppercase font-bold">
                    {user.provider} Verified
                  </Badge>
                </div>
                <p className="text-xs font-mono font-bold text-lilac-dark dark:text-lilac-deep">
                  @{user.username} · <span className="font-sans font-normal text-zinc-500">{user.email}</span>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Link to="/dashboard">
                <Button variant="secondary" size="sm" className="font-bold">
                  📊 View Vault ({pastes.length})
                </Button>
              </Link>
              <Button variant="danger" size="sm" onClick={handleSignOut} className="font-bold">
                Sign Out
              </Button>
            </div>
          </div>

          {/* Bio & Profile Customization */}
          <div className="space-y-3">
            <label className="text-xs font-bold text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
              <span>✍️</span> Custom Profile Bio & Research Tag
            </label>
            <div className="flex gap-2">
              <TextInput
                value={bio}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setBio(e.target.value)}
                placeholder="Write a bio for your secret sharing profile..."
                className="flex-1 text-xs"
              />
              <Button size="sm" onClick={handleSaveProfile} className="shrink-0 font-bold">
                Save Bio
              </Button>
            </div>
          </div>

        </Card>
      </motion.div>

      {/* Friends & Vault Sharing Network */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* Friends List */}
        <Card className="p-5 space-y-4 border-lilac-deep/25">
          <div className="flex items-center justify-between pb-3 border-b border-lilac-deep/20 dark:border-void-line">
            <h2 className="font-display text-base font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
              <span>👥</span> Vault Contacts & Team
            </h2>
            <Badge tone="lilac" className="text-[10px]">{friends.length} Members</Badge>
          </div>

          <div className="flex gap-2">
            <TextInput
              value={friendUsername}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFriendUsername(e.target.value)}
              placeholder="github_username"
              className="flex-1 text-xs"
            />
            <Button size="sm" onClick={handleAddFriend} className="shrink-0">
              + Add
            </Button>
          </div>

          <div className="space-y-2 pt-1">
            {friends.map((f) => (
              <div key={f} className="flex items-center justify-between p-2.5 rounded-xl bg-white/40 dark:bg-void-soft/40 border border-lilac-deep/20 text-xs">
                <span className="font-mono font-bold text-zinc-800 dark:text-zinc-200">@{f}</span>
                <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold">Connected</span>
              </div>
            ))}
          </div>
        </Card>

        {/* Quick Vault Summary */}
        <Card className="p-5 space-y-4 border-lilac-deep/25">
          <div className="flex items-center justify-between pb-3 border-b border-lilac-deep/20 dark:border-void-line">
            <h2 className="font-display text-base font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
              <span>🛡️</span> Security Statistics
            </h2>
            <Badge tone="mint" className="text-[10px]">Zero-Knowledge</Badge>
          </div>

          <div className="space-y-2.5 text-xs font-mono">
            <div className="flex justify-between p-2 rounded-lg bg-white/40 dark:bg-void-soft/40 border border-lilac-deep/20">
              <span className="text-zinc-500">Sealed Pastes:</span>
              <strong className="text-lilac-dark dark:text-lilac-deep">{pastes.length}</strong>
            </div>
            <div className="flex justify-between p-2 rounded-lg bg-white/40 dark:bg-void-soft/40 border border-lilac-deep/20">
              <span className="text-zinc-500">Active Share Links:</span>
              <strong className="text-emerald-600 dark:text-emerald-400">{pastes.filter((p: TrackedPaste) => !p.isBurned).length}</strong>
            </div>
            <div className="flex justify-between p-2 rounded-lg bg-white/40 dark:bg-void-soft/40 border border-lilac-deep/20">
              <span className="text-zinc-500">Default Cipher:</span>
              <strong className="text-zinc-800 dark:text-zinc-200">AES-256-GCM</strong>
            </div>
          </div>
        </Card>

      </div>

    </div>
  )
}
