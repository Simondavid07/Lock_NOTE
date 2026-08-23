import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type Theme = 'light' | 'dark' | 'system'

interface AppState {
  theme: Theme
  setTheme: (t: Theme) => void
  accent: string
  setAccent: (a: string) => void
}

function applyTheme(theme: Theme): void {
  const root = document.documentElement
  const resolved = theme === 'system' ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : theme
  root.classList.toggle('dark', resolved === 'dark')
  root.style.colorScheme = resolved
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      theme: 'light',
      setTheme: (theme) => {
        applyTheme(theme)
        set({ theme })
      },
      accent: '#6366f1',
      setAccent: (accent) => set({ accent }),
    }),
    { name: 'locknote:app:v2' },
  ),
)

applyTheme(useAppStore.getState().theme)

if (typeof window !== 'undefined' && 'matchMedia' in window) {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    const { theme } = useAppStore.getState()
    if (theme === 'system') applyTheme('system')
  })
}