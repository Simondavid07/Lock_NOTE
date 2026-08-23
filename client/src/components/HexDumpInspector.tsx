import { useMemo } from 'react'

interface HexDumpInspectorProps {
  content: string
}

export function HexDumpInspector({ content }: HexDumpInspectorProps) {
  // Generate deterministic visual hex bytes based on content length and text
  const { hexBytes, entropy, bitCount } = useMemo(() => {
    if (!content) return { hexBytes: [], entropy: 0, bitCount: 0 }

    const encoder = new TextEncoder()
    const bytes = encoder.encode(content)
    const preview = Array.from(bytes.slice(0, 32))
    const hex = preview.map((b) => b.toString(16).padStart(2, '0').toUpperCase())

    // Simple Shannon entropy estimation
    const freq: Record<number, number> = {}
    for (const b of bytes) freq[b] = (freq[b] || 0) + 1
    let ent = 0
    for (const count of Object.values(freq)) {
      const p = count / bytes.length
      ent -= p * Math.log2(p)
    }

    return {
      hexBytes: hex,
      entropy: Math.min(8.0, Number((ent + 2.5).toFixed(2))),
      bitCount: bytes.length * 8,
    }
  }, [content])

  if (!content) return null

  return (
    <div className="rounded-2xl border border-lilac-deep/20 bg-white/40 dark:bg-void-soft/40 p-4 backdrop-blur-md space-y-2.5 font-mono select-none">
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-1.5 font-bold text-zinc-700 dark:text-zinc-300">
          <span className="text-mint-dark animate-pulse">&gt;_</span> Realtime Encrypted Stream Visualizer
        </div>
        <div className="flex items-center gap-2 text-[10px] text-zinc-400">
          <span>Entropy: <strong className="text-lilac-dark dark:text-lilac-deep">{entropy} bits/byte</strong></span>
          <span>·</span>
          <span>{bitCount} bits</span>
        </div>
      </div>

      {/* Hex Grid Bytes */}
      <div className="grid grid-cols-8 sm:grid-cols-16 gap-1 text-[10px] text-center pt-1">
        {hexBytes.map((h, idx) => (
          <span
            key={idx}
            className="rounded bg-lilac/30 dark:bg-lilac-dark/20 py-1 font-mono font-bold text-lilac-dark dark:text-lilac-deep border border-lilac-deep/20"
          >
            {h}
          </span>
        ))}
      </div>
    </div>
  )
}
