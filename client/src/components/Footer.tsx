import { Link } from 'react-router-dom'

export function Footer() {
  return (
    <footer className="mt-auto border-t border-white/55 bg-white/34 backdrop-blur-xl dark:border-void-line dark:bg-void/36">
      <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-3 px-4 py-6 text-xs text-zinc-500 dark:text-zinc-400 sm:flex-row sm:px-6">
        <p className="flex items-center gap-2 font-medium">
          <span className="signal-pulse size-1.5" aria-hidden />
          <span><strong className="font-display text-zinc-700 dark:text-zinc-200">Locknote</strong> — seal once, trust zero.</span>
        </p>
        <nav className="flex flex-wrap items-center justify-center gap-4" aria-label="Footer">
          <Link to="/how-it-works" className="hover:text-lilac-dark dark:hover:text-lilac-deep transition-colors">
            How it works
          </Link>
          <a
            href="https://github.com/PrivateBin/PrivateBin"
            target="_blank"
            rel="noreferrer"
            className="hover:text-lilac-dark dark:hover:text-lilac-deep transition-colors"
          >
            Reference: PrivateBin
          </a>
          <span aria-hidden className="text-zinc-300 dark:text-zinc-700">·</span>
          <span className="rounded-full border border-lilac-deep/15 bg-white/35 px-2 py-0.5 font-mono text-[10px] font-semibold opacity-85 dark:bg-white/5">AES-256-GCM · PBKDF2 600k</span>
        </nav>
      </div>
    </footer>
  )
}