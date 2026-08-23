import { useEffect, useState } from 'react'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { CopyButton } from './CopyButton'
import { Badge } from './ui'
import { useAppStore } from '../lib/app-store'

const htmlCache = new Map<string, string>()

/** Markdown → sanitized HTML. The only path that produces HTML. */
export function renderMarkdown(md: string): string {
  const cached = htmlCache.get(md)
  if (cached) return cached
  const raw = marked.parse(md, { async: false }) as string
  const clean = DOMPurify.sanitize(raw, {
    ADD_ATTR: ['target'],
    FORBID_TAGS: ['style', 'iframe', 'script', 'form', 'object', 'embed'],
  })
  htmlCache.set(md, clean)
  if (htmlCache.size > 256) htmlCache.clear()
  return clean
}

const FALLBACK_LANG: Record<string, string> = {
  ts: 'typescript',
  tsx: 'typescript',
  jsx: 'javascript',
  js: 'javascript',
  py: 'python',
  sh: 'bash',
  shell: 'bash',
  md: 'markdown',
}

/** Only the grammars Locknote uses — loaded in one lazy chunk on first view. */
const LANG_IMPORTS: Record<string, () => Promise<{ default: unknown }>> = {
  javascript: () => import('shiki/langs/javascript.mjs'),
  typescript: () => import('shiki/langs/typescript.mjs'),
  tsx: () => import('shiki/langs/tsx.mjs'),
  jsx: () => import('shiki/langs/jsx.mjs'),
  python: () => import('shiki/langs/python.mjs'),
  json: () => import('shiki/langs/json.mjs'),
  html: () => import('shiki/langs/html.mjs'),
  css: () => import('shiki/langs/css.mjs'),
  sql: () => import('shiki/langs/sql.mjs'),
  yaml: () => import('shiki/langs/yaml.mjs'),
  cpp: () => import('shiki/langs/cpp.mjs'),
  markdown: () => import('shiki/langs/markdown.mjs'),
  bash: () => import('shiki/langs/bash.mjs'),
}

let highlighterPromise: Promise<{ codeToHtml: (code: string, opts: { lang: string; theme: string }) => string }> | null = null

async function getHighlighter(): Promise<{ codeToHtml: (code: string, opts: { lang: string; theme: string }) => string }> {
  if (!highlighterPromise) {
    highlighterPromise = (async () => {
      const [{ createHighlighterCore }, { createOnigurumaEngine }, dark, light, ...langs] = await Promise.all([
        import('shiki/core'),
        import('shiki/engine/oniguruma'),
        import('shiki/themes/vitesse-dark.mjs'),
        import('shiki/themes/vitesse-light.mjs'),
        ...Object.values(LANG_IMPORTS).map((f) => f()),
      ])
      return createHighlighterCore({
        themes: [dark.default, light.default],
        langs: langs.map((m) => (m as { default: unknown }).default) as never[],
        engine: createOnigurumaEngine(import('shiki/wasm')),
      })
    })()
  }
  return highlighterPromise as Promise<{ codeToHtml: (code: string, opts: { lang: string; theme: string }) => string }>
}

async function highlight(code: string, lang: string, theme: 'dark' | 'light'): Promise<string> {
  const hl = await getHighlighter()
  return hl.codeToHtml(code, {
    lang,
    theme: theme === 'dark' ? 'vitesse-dark' : 'vitesse-light',
  })
}

export function CodeBlock({ code, language, className }: { code: string; language: string; className?: string }) {
  void className
  const theme = useAppStore((s) => s.theme)
  const resolved: 'dark' | 'light' =
    theme === 'system'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
      : theme
  const [html, setHtml] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  const lang = FALLBACK_LANG[language] ?? language

  useEffect(() => {
    let cancelled = false
    setHtml(null)
    setFailed(false)
    highlight(code, lang, resolved)
      .then((h) => {
        if (!cancelled) setHtml(h)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, lang, resolved])

  return (
    <div className="group relative">
      <div className="absolute right-2 top-2 z-10 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        <CopyButton text={code} label="Copy code" compact className="inline-flex items-center gap-1.5 rounded-lg bg-black/60 px-2.5 py-1 text-[11px] font-medium text-zinc-200 backdrop-blur hover:bg-black/80 border border-white/10" />
      </div>
      {html && !failed ? (
        <div
          className="overflow-x-auto rounded-xl border border-void-line text-[13px] leading-relaxed"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : (
        <pre className="overflow-x-auto rounded-xl border border-void-line bg-void p-4 font-mono text-[13px] leading-relaxed">
          {code}
        </pre>
      )}
    </div>
  )
}

function CredentialsView({ content }: { content: string }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Badge tone="indigo">Credentials</Badge>
        <CopyButton text={content} label="Copy all" autoClearSeconds={60} compact />
      </div>
      <pre className="whitespace-pre-wrap rounded-xl border border-void-line bg-void p-4 font-mono text-[13px] leading-relaxed">
        {content}
      </pre>
    </div>
  )
}

export interface PasteRendererProps {
  format: 'text' | 'markdown' | 'code' | 'credentials' | 'file'
  content: string
  language?: string | null
}

export function PasteRenderer({ format, content, language }: PasteRendererProps) {
  switch (format) {
    case 'markdown':
      return <div className="prose-locknote" dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }} />
    case 'code':
      return <CodeBlock code={content} language={language ?? 'text'} />
    case 'credentials':
      return <CredentialsView content={content} />
    case 'file':
      return (
        <div className="flex items-center gap-3 rounded-xl border border-void-line bg-void p-4">
          <span aria-hidden className="text-2xl">📄</span>
          <div>
            <p className="text-sm font-medium">{language ?? 'Encrypted file'}</p>
            <p className="text-xs text-zinc-400">Content is sealed — decrypting…</p>
          </div>
        </div>
      )
    default:
      return <pre className="whitespace-pre-wrap font-mono text-sm leading-relaxed">{content}</pre>
  }
}