import { useEffect, useRef } from 'react'
import { EditorView, basicSetup } from 'codemirror'
import { Compartment, EditorState } from '@codemirror/state'
import { placeholder } from '@codemirror/view'
import { javascript } from '@codemirror/lang-javascript'
import { markdown } from '@codemirror/lang-markdown'
import { json } from '@codemirror/lang-json'
import { python } from '@codemirror/lang-python'
import { html } from '@codemirror/lang-html'
import { css } from '@codemirror/lang-css'
import { sql } from '@codemirror/lang-sql'
import { yaml } from '@codemirror/lang-yaml'
import { cpp } from '@codemirror/lang-cpp'
import type { Extension } from '@codemirror/state'
import { remoteCursorsExtension, setRemoteCursors, type RemoteCursor } from '../lib/remote-cursors'
import { cn } from '../lib/cn'

const LANG_EXTS: Record<string, Extension> = {
  javascript: javascript(),
  typescript: javascript({ typescript: true }),
  jsx: javascript({ jsx: true }),
  python: python(),
  json: json(),
  html: html(),
  css: css(),
  sql: sql(),
  yaml: yaml(),
  cpp: cpp(),
  markdown: markdown(),
}

export interface EditorProps {
  value: string
  onChange?: (value: string) => void
  /** Syntax language key; plain text when null/undefined. */
  language?: string | null
  readOnly?: boolean
  placeholder?: string
  remoteCursors?: RemoteCursor[]
  className?: string
  ariaLabel?: string
  onEditorReady?: (view: EditorView) => void
}

const editorTheme = EditorView.theme({
  '&': { backgroundColor: 'transparent', color: 'inherit', height: '100%' },
  '&.cm-focused': { outline: 'none' },
  '.cm-content': { fontFamily: 'var(--font-mono)', fontSize: '13px' },
  '.cm-cursor, .cm-dropCursor': {
    borderLeftColor: '#9b72cf !important',
    borderLeftWidth: '2.5px !important',
    boxShadow: '0 0 8px #9b72cf, 0 0 16px rgba(155, 114, 207, 0.7)',
    animation: 'cm-caret-blink 1.1s step-start infinite',
  },
  '.cm-gutters': { backgroundColor: 'transparent', borderRight: '1px solid rgba(196, 157, 232, 0.2)', color: '#a1a1aa' },
  '.cm-activeLine': { backgroundColor: 'rgba(155, 114, 207, 0.08)' },
  '.cm-activeLineGutter': { backgroundColor: 'transparent', color: '#c49de8', fontWeight: 'bold' },
  '.cm-selectionBackground': { backgroundColor: 'rgba(155, 114, 207, 0.3) !important' },
})

export function Editor({
  value,
  onChange,
  language,
  readOnly,
  placeholder: placeholderText,
  remoteCursors,
  className,
  ariaLabel,
  onEditorReady,
}: EditorProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const langCompartmentRef = useRef(new Compartment())
  const changeCbRef = useRef(onChange)
  const valueRef = useRef(value)
  const debounceRef = useRef<number>(0)

  changeCbRef.current = onChange
  valueRef.current = value

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const state = EditorState.create({
      doc: valueRef.current,
      extensions: [
        basicSetup,
        placeholder(placeholderText ?? ''),
        EditorView.lineWrapping,
        editorTheme,
        langCompartmentRef.current.of(LANG_EXTS[language ?? ''] ?? []),
        remoteCursorsExtension(),
        readOnly ? EditorState.readOnly.of(true) : [],
        EditorView.contentAttributes.of({ 'aria-label': ariaLabel ?? 'Secret content', role: 'textbox' }),
        EditorView.updateListener.of((update) => {
          if (!update.docChanged) return
          valueRef.current = update.state.doc.toString()
          window.clearTimeout(debounceRef.current)
          debounceRef.current = window.setTimeout(() => changeCbRef.current?.(valueRef.current), 120)
        }),
      ],
    })

    const view = new EditorView({ state, parent: container })
    viewRef.current = view
    onEditorReady?.(view)
    return () => {
      window.clearTimeout(debounceRef.current)
      view.destroy()
      viewRef.current = null
    }
    // Mount once — later prop changes are handled by the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    view.dispatch({
      effects: langCompartmentRef.current.reconfigure(LANG_EXTS[language ?? ''] ?? []),
    })
  }, [language])

  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    view.dispatch({ effects: setRemoteCursors(remoteCursors ?? []) })
  }, [remoteCursors])

  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    if (value !== view.state.doc.toString()) {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } })
    }
  }, [value])

  return <div ref={containerRef} className={cn('h-full overflow-hidden', className)} />
}