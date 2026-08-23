import { useEffect, useRef } from 'react'
import { useReducedMotion } from 'motion/react'

interface Star {
  x: number
  y: number
  originX: number
  originY: number
  radius: number
  alpha: number
  vAlpha: number
  vx: number
  vy: number
  color: string
}

interface Stardust {
  x: number
  y: number
  vx: number
  vy: number
  radius: number
  alpha: number
  color: string
}

const PASTEL_COLORS = ['#EDE1F5', '#F8E1E7', '#DCEEF5', '#E1F5EA', '#c49de8', '#8ec8e4']

export function BackgroundParticles() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const reduceMotion = useReducedMotion()

  useEffect(() => {
    if (reduceMotion) return

    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let animId: number
    let width = (canvas.width = window.innerWidth)
    let height = (canvas.height = window.innerHeight)

    let mouseX = -1000
    let mouseY = -1000
    let lastStardustAt = 0

    const handleMouseMove = (e: MouseEvent) => {
      mouseX = e.clientX
      mouseY = e.clientY

      // Sample pointer motion so the trail remains intentional and lightweight.
      const now = performance.now()
      if (now - lastStardustAt > 52 && stardust.length < 34 && Math.random() < 0.6) {
        lastStardustAt = now
        stardust.push({
          x: e.clientX + (Math.random() - 0.5) * 10,
          y: e.clientY + (Math.random() - 0.5) * 10,
          vx: (Math.random() - 0.5) * 1.2,
          vy: (Math.random() - 0.5) * 1.2,
          radius: Math.random() * 2.5 + 1,
          alpha: 0.9,
          color: PASTEL_COLORS[Math.floor(Math.random() * PASTEL_COLORS.length)]!,
        })
      }
    }

    const handleResize = () => {
      if (!canvas) return
      width = canvas.width = window.innerWidth
      height = canvas.height = window.innerHeight
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('resize', handleResize)

    // Create 20 lightweight fireflies (optimized for zero GPU lag)
    const starCount = window.innerWidth < 768 ? 10 : 20
    const stars: Star[] = Array.from({ length: starCount }, () => {
      const x = Math.random() * width
      const y = Math.random() * height
      return {
        x,
        y,
        originX: x,
        originY: y,
        radius: Math.random() * 2 + 1,
        alpha: Math.random() * 0.6 + 0.2,
        vAlpha: (Math.random() - 0.5) * 0.01,
        vx: (Math.random() - 0.5) * 0.3,
        vy: -Math.random() * 0.3 - 0.1,
        color: PASTEL_COLORS[Math.floor(Math.random() * PASTEL_COLORS.length)]!,
      }
    })

    const stardust: Stardust[] = []

    const render = () => {
      if (document.hidden) {
        animId = requestAnimationFrame(render)
        return
      }

      ctx.clearRect(0, 0, width, height)

      // 1. Draw Stardust Trail Particles
      for (let i = stardust.length - 1; i >= 0; i--) {
        const p = stardust[i]!
        p.x += p.vx
        p.y += p.vy
        p.alpha -= 0.03

        if (p.alpha <= 0) {
          stardust.splice(i, 1)
          continue
        }

        ctx.beginPath()
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2)
        ctx.fillStyle = p.color
        ctx.globalAlpha = p.alpha
        ctx.fill()
      }

      // 2. Draw Fireflies & Interactive Proximity
      for (let i = 0; i < stars.length; i++) {
        const s = stars[i]!

        s.x += s.vx
        s.y += s.vy
        s.alpha += s.vAlpha

        if (s.alpha <= 0.15 || s.alpha >= 0.75) s.vAlpha = -s.vAlpha

        if (s.y < -10) s.y = height + 10
        if (s.x < -10) s.x = width + 10
        if (s.x > width + 10) s.x = -10

        const dx = mouseX - s.x
        const dy = mouseY - s.y
        const dist = Math.sqrt(dx * dx + dy * dy)
        const maxDist = 120

        if (dist > 0 && dist < maxDist) {
          const force = (maxDist - dist) / maxDist
          s.x -= (dx / dist) * force * 2.5
          s.y -= (dy / dist) * force * 2.5

          ctx.beginPath()
          ctx.moveTo(s.x, s.y)
          ctx.lineTo(mouseX, mouseY)
          ctx.strokeStyle = s.color
          ctx.globalAlpha = (1 - dist / maxDist) * 0.3
          ctx.lineWidth = 1
          ctx.stroke()
        }

        ctx.beginPath()
        ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2)
        ctx.fillStyle = s.color
        ctx.globalAlpha = Math.max(0.15, Math.min(0.75, s.alpha))
        ctx.fill()
      }

      animId = requestAnimationFrame(render)
    }

    render()

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('resize', handleResize)
      cancelAnimationFrame(animId)
    }
  }, [reduceMotion])

  if (reduceMotion) return null

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0 z-0 opacity-80"
    />
  )
}
