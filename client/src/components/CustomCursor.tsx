import { useEffect, useState } from 'react'
import { motion, useMotionValue, useReducedMotion } from 'motion/react'

type CursorMode = 'default' | 'action'

/**
 * A deliberately low-latency fine-pointer cursor. It follows the pointer
 * directly, gives compact feedback over actions, and yields completely to the
 * native cursor inside editors and form controls.
 */
export function CustomCursor() {
  const reduceMotion = useReducedMotion()
  const [enabled, setEnabled] = useState(false)
  const [visible, setVisible] = useState(false)
  const [pressed, setPressed] = useState(false)
  const [mode, setMode] = useState<CursorMode>('default')

  const pointerX = useMotionValue(-80)
  const pointerY = useMotionValue(-80)

  useEffect(() => {
    const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)')
    const updateEnabled = () => setEnabled(finePointer.matches)
    updateEnabled()
    finePointer.addEventListener('change', updateEnabled)
    return () => finePointer.removeEventListener('change', updateEnabled)
  }, [])

  useEffect(() => {
    if (!enabled || reduceMotion) return

    const root = document.documentElement
    root.classList.add('has-editorial-cursor')

    const onMove = (event: MouseEvent) => {
      pointerX.set(event.clientX)
      pointerY.set(event.clientY)

      const target = event.target as HTMLElement | null
      const isText = Boolean(target?.closest('input, textarea, .cm-editor, [contenteditable="true"]'))
      root.classList.toggle('editorial-native-text', isText)
      setVisible(!isText)

      const isAction = Boolean(target?.closest('button, a, [role="button"], [role="tab"], select'))
      const nextMode: CursorMode = isAction && !isText ? 'action' : 'default'
      setMode((current) => current === nextMode ? current : nextMode)
    }

    const hide = () => setVisible(false)
    const show = () => {
      if (!root.classList.contains('editorial-native-text')) setVisible(true)
    }
    const down = () => setPressed(true)
    const up = () => setPressed(false)

    window.addEventListener('mousemove', onMove, { passive: true })
    window.addEventListener('mousedown', down, { passive: true })
    window.addEventListener('mouseup', up, { passive: true })
    document.addEventListener('mouseleave', hide)
    document.addEventListener('mouseenter', show)
    window.addEventListener('blur', hide)

    return () => {
      root.classList.remove('has-editorial-cursor', 'editorial-native-text')
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mousedown', down)
      window.removeEventListener('mouseup', up)
      document.removeEventListener('mouseleave', hide)
      document.removeEventListener('mouseenter', show)
      window.removeEventListener('blur', hide)
    }
  }, [enabled, pointerX, pointerY, reduceMotion])

  if (!enabled || reduceMotion) return null

  return (
    <div className="editorial-cursor-layer" aria-hidden>
      <motion.div
        style={{ x: pointerX, y: pointerY, translateX: '-50%', translateY: '-50%' }}
        animate={{
          opacity: visible ? 1 : 0,
          scale: pressed ? 0.86 : mode === 'action' ? 1.08 : 1,
        }}
        transition={{ duration: 0.14, ease: 'easeOut' }}
        className={`editorial-cursor-halo editorial-cursor-${mode}`}
      />
      <motion.div
        style={{ x: pointerX, y: pointerY, translateX: '-50%', translateY: '-50%' }}
        animate={{ opacity: visible ? 1 : 0, scale: pressed ? 0.5 : mode === 'action' ? 0.72 : 1 }}
        transition={{ duration: 0.1, ease: 'easeOut' }}
        className="editorial-cursor-dot"
      />
      <motion.span
        style={{ x: pointerX, y: pointerY, translateX: '-50%', translateY: '-50%' }}
        initial={false}
        animate={{ opacity: pressed && visible ? [0, 0.55, 0] : 0, scale: pressed ? [0.6, 1.5] : 0.6 }}
        transition={{ duration: 0.26, ease: 'easeOut' }}
        className="editorial-cursor-press"
      />
    </div>
  )
}
