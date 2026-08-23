import {
  StateEffect,
  StateField,
  type Extension,
  type Range,
} from '@codemirror/state'
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  WidgetType,
} from '@codemirror/view'

export interface RemoteCursor {
  clientId: string
  name: string
  color: string
  pos: number
}

const setCursors = StateEffect.define<RemoteCursor[]>()
const cursorField = StateField.define<Map<string, RemoteCursor>>({
  create: () => new Map(),
  update(cursors, tr) {
    for (const e of tr.effects) {
      if (e.is(setCursors)) return new Map(e.value.map((c) => [c.clientId, c] as const))
    }
    return cursors
  },
})

class CursorWidget extends WidgetType {
  constructor(private readonly c: RemoteCursor) {
    super()
  }
  override toDOM(): HTMLElement {
    const el = document.createElement('span')
    el.className = 'cm-remote-cursor'
    el.style.color = this.c.color
    const label = document.createElement('span')
    label.className = 'cm-remote-cursor-label'
    label.style.background = this.c.color
    label.textContent = this.c.name
    label.setAttribute('aria-hidden', 'true')
    el.appendChild(label)
    return el
  }
  override ignoreEvent(): boolean {
    return true
  }
}

function buildDecorations(cursors: Map<string, RemoteCursor>, docLength: number): DecorationSet {
  const decos: Array<Range<Decoration>> = []
  for (const c of cursors.values()) {
    const pos = Math.min(Math.max(0, c.pos), docLength)
    decos.push(Decoration.widget({ widget: new CursorWidget(c), side: 1 }).range(pos))
  }
  return Decoration.set(decos)
}

const cursorPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    constructor(view: EditorView) {
      this.decorations = buildDecorations(view.state.field(cursorField), view.state.doc.length)
    }
    update(update: import('@codemirror/view').ViewUpdate) {
      const cursorsChanged = update.startState.field(cursorField) !== update.state.field(cursorField)
      if (update.docChanged || cursorsChanged) {
        this.decorations = buildDecorations(update.state.field(cursorField), update.state.doc.length)
      }
    }
  },
  { decorations: (v) => v.decorations },
)

/** Mount this once in the editor; then dispatch `setRemoteCursors()`. */
export function remoteCursorsExtension(): Extension {
  return [cursorField, cursorPlugin]
}

export function setRemoteCursors(cursors: RemoteCursor[]): StateEffect<RemoteCursor[]> {
  return setCursors.of(cursors)
}

/** Palette assigned to collab participants. */
export const participantColors = ['#f43f5e', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316']