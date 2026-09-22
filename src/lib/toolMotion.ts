type Pose = { x: number; y: number; angle: number; scale: number }
type Flight = {
  element: HTMLElement
  body: HTMLElement
  slot: HTMLElement
  animations: Animation[]
  starts: string[]
  returning: boolean
}
const EASE_OUT = 'cubic-bezier(0.23, 1, 0.32, 1)'
const translation = (pose: Pose) => `translate3d(${pose.x}px, ${pose.y}px, 0)`
const rotation = (pose: Pose) => `rotate(${pose.angle}deg) scale(${pose.scale})`

// The translation/shadow wrapper stays in viewport coordinates. Only its child
// rotates, keeping the cast shadow aligned to the scene's upper-left light.
export function createToolMotion(board: HTMLElement) {
  const flights = new Map<string, Flight>()
  board.querySelectorAll<HTMLElement>('[data-tool-flight]').forEach((element) => {
    const id = element.dataset.toolFlight!
    const slot = board.querySelector<HTMLElement>(`[data-tool-slot="${id}"] > span`)!
    flights.set(id, { element, body: element.firstElementChild as HTMLElement, slot,
      animations: [], starts: [], returning: false })
  })

  const trayPose = (id: string, flight: Flight): Pose => {
    const rect = flight.slot.getBoundingClientRect()
    const scale = rect.width / (id === 'eraser' ? 94 : 142)
    return {
      x: rect.left + (id === 'eraser' ? 47 : -3) * scale,
      y: rect.top + (id === 'eraser' ? 25 : 12.5) * scale,
      angle: 0, scale,
    }
  }
  const cancel = (flight: Flight) => {
    const transforms = [flight.element, flight.body].map((element) => getComputedStyle(element).transform)
    flight.animations.forEach((animation) => { animation.onfinish = null; animation.cancel() })
    flight.animations = []
    return transforms
  }
  const place = (flight: Flight, pose: Pose) => {
    flight.element.style.transform = translation(pose)
    flight.body.style.transform = rotation(pose)
  }
  const animateTo = (flight: Flight, pose: Pose, done: () => void) => {
    flight.starts = cancel(flight)
    place(flight, pose)
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { done(); return }
    flight.animations = [flight.element, flight.body].map((element, i) =>
      element.animate([{ transform: flight.starts[i] }, { transform: element.style.transform }],
        { duration: 180, easing: EASE_OUT }))
    flight.animations[0].onfinish = () => {
      flight.animations.forEach((animation) => animation.cancel())
      flight.animations = []
      done()
    }
  }
  const dock = (id: string, animate = true) => {
    const flight = flights.get(id)!
    if (flight.element.style.opacity !== '1') return
    flight.returning = true
    flight.element.classList.remove('is-drawing')
    const finish = () => {
      flight.element.style.opacity = '0'
      flight.element.style.display = 'none'
      flight.slot.style.visibility = ''
      flight.returning = false
    }
    if (animate) animateTo(flight, trayPose(id, flight), finish)
    else { cancel(flight); finish() }
  }
  return {
    dock,
    dockAll(animate = true) { flights.forEach((_flight, id) => dock(id, animate)) },
    fitTray() {
      flights.forEach((flight, id) => {
        const width = flight.slot.parentElement!.getBoundingClientRect().width
        const scale = Math.min(id === 'eraser' ? .72 : .78, (width - 8) / (id === 'eraser' ? 94 : 145))
        flight.slot.style.setProperty('--slot-scale', String(scale))
      })
    },
    move(id: string, pose: Pose, drawing: boolean, animatePickup = true) {
      const flight = flights.get(id)!
      const hidden = flight.element.style.opacity !== '1'
      flight.element.classList.toggle('is-drawing', drawing)
      if (hidden || flight.returning) {
        flight.element.style.display = 'block'
        if (hidden) place(flight, trayPose(id, flight))
        flight.slot.style.visibility = 'hidden'
        flight.element.style.opacity = '1'
        flight.returning = false
        if (animatePickup && !drawing) { animateTo(flight, pose, () => {}); return }
      }
      if (drawing && flight.animations.length) cancel(flight)
      place(flight, pose)
      // Retarget an in-flight pickup without restarting its 180ms clock.
      flight.animations.forEach((animation, i) => {
        (animation.effect as KeyframeEffect).setKeyframes([
          { transform: flight.starts[i] },
          { transform: i === 0 ? translation(pose) : rotation(pose) },
        ])
      })
    },
    destroy() { flights.forEach((flight) => { cancel(flight); flight.slot.style.visibility = '' }) },
  }
}
