import { useEffect, useRef } from 'react'

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  color: string
  size: number
  rotation: number
  vRot: number
  opacity: number
}

const PALETTE = ['#F8E1E7', '#DCEEF5', '#E1F5EA', '#FDF3DC', '#EDE1F5', '#9b72cf', '#d4799a']

export function Confetti({ active }: { active: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    if (!active) return

    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    canvas.width = window.innerWidth
    canvas.height = window.innerHeight

    const particles: Particle[] = Array.from({ length: 80 }, () => ({
      x: canvas.width / 2,
      y: canvas.height / 3,
      vx: (Math.random() - 0.5) * 14,
      vy: (Math.random() - 0.8) * 12,
      color: PALETTE[Math.floor(Math.random() * PALETTE.length)]!,
      size: Math.random() * 8 + 4,
      rotation: Math.random() * Math.PI * 2,
      vRot: (Math.random() - 0.5) * 0.2,
      opacity: 1,
    }))

    let animId: number

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      let alive = false

      for (const p of particles) {
        p.x += p.vx
        p.y += p.vy
        p.vy += 0.25 // gravity
        p.rotation += p.vRot
        p.opacity -= 0.012

        if (p.opacity > 0) {
          alive = true
          ctx.save()
          ctx.translate(p.x, p.y)
          ctx.rotate(p.rotation)
          ctx.globalAlpha = Math.max(0, p.opacity)
          ctx.fillStyle = p.color
          ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size)
          ctx.restore()
        }
      }

      if (alive) {
        animId = requestAnimationFrame(render)
      }
    }

    render()

    return () => {
      cancelAnimationFrame(animId)
    }
  }, [active])

  if (!active) return null

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0 z-50"
    />
  )
}
