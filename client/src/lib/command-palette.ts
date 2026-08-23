import { create } from 'zustand'

interface CommandPaletteState {
  open: boolean
  setOpen: (open: boolean) => void
}

export const useCommandPalette = create<CommandPaletteState>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}))

let bound = false

/** Global Ctrl/Cmd+K binding. */
export function bindCommandPaletteHotkey(): void {
  if (bound) return
  bound = true
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault()
      useCommandPalette.getState().setOpen(!useCommandPalette.getState().open)
    }
    if (e.key === 'Escape') useCommandPalette.getState().setOpen(false)
  })
}