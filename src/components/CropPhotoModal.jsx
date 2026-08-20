import { useEffect, useRef, useState } from 'react'
import { Check, X } from 'lucide-react'
import { Button } from './ui'

const OUTPUT_SIZE = 600

function coverScale(frameSize, width, height) {
  if (!width || !height || !frameSize) return 1
  return Math.max(frameSize / width, frameSize / height)
}

function clampOffset(x, y, zoom, frameSize, width, height) {
  const scale = coverScale(frameSize, width, height) * zoom
  const displayW = width * scale
  const displayH = height * scale
  const maxX = Math.max(0, (displayW - frameSize) / 2)
  const maxY = Math.max(0, (displayH - frameSize) / 2)
  return {
    x: Math.min(maxX, Math.max(-maxX, x)),
    y: Math.min(maxY, Math.max(-maxY, y)),
  }
}

export default function CropPhotoModal({ src, onCancel, onConfirm, confirming = false }) {
  const frameRef = useRef(null)
  const imageRef = useRef(null)
  const dragRef = useRef(null)
  const [frameSize, setFrameSize] = useState(320)
  const [natural, setNatural] = useState({ w: 0, h: 0 })
  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const node = frameRef.current
    if (!node) return undefined
    const update = () => setFrameSize(node.getBoundingClientRect().width)
    update()
    const observer = new ResizeObserver(update)
    observer.observe(node)
    return () => observer.disconnect()
  }, [src])

  useEffect(() => {
    setZoom(1)
    setOffset({ x: 0, y: 0 })
    setReady(false)
    setNatural({ w: 0, h: 0 })
  }, [src])

  const scale = coverScale(frameSize, natural.w, natural.h) * zoom
  const displayW = natural.w * scale
  const displayH = natural.h * scale

  function moveTo(x, y, nextZoom = zoom) {
    setOffset(clampOffset(x, y, nextZoom, frameSize, natural.w, natural.h))
  }

  function changeZoom(nextZoom) {
    const value = Math.min(3, Math.max(1, nextZoom))
    setZoom(value)
    setOffset((current) => clampOffset(current.x, current.y, value, frameSize, natural.w, natural.h))
  }

  function onPointerDown(event) {
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = { x: event.clientX, y: event.clientY, ox: offset.x, oy: offset.y }
  }

  function onPointerMove(event) {
    if (!dragRef.current) return
    moveTo(
      dragRef.current.ox + (event.clientX - dragRef.current.x),
      dragRef.current.oy + (event.clientY - dragRef.current.y),
    )
  }

  function onPointerUp() {
    dragRef.current = null
  }

  async function confirmCrop() {
    const image = imageRef.current
    if (!image || !natural.w) return

    const imageLeft = (frameSize - displayW) / 2 + offset.x
    const imageTop = (frameSize - displayH) / 2 + offset.y
    const srcX = (-imageLeft / displayW) * natural.w
    const srcY = (-imageTop / displayH) * natural.h
    const srcSize = (frameSize / displayW) * natural.w

    const canvas = document.createElement('canvas')
    canvas.width = OUTPUT_SIZE
    canvas.height = OUTPUT_SIZE
    const ctx = canvas.getContext('2d')
    ctx.drawImage(image, srcX, srcY, srcSize, srcSize, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE)

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92))
    if (!blob) return
    onConfirm(new File([blob], 'profile-2x2.jpg', { type: 'image/jpeg' }))
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" className="absolute inset-0 bg-slate-900/50" aria-label="Close crop" onClick={onCancel} />
      <div className="card relative z-10 w-full max-w-md p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Align 2×2 photo</h3>
            <p className="text-xs text-slate-500">Drag to move. Use the slider to zoom.</p>
          </div>
          <button type="button" onClick={onCancel} className="rounded-xl p-1.5 text-slate-500 hover:bg-slate-100">
            <X size={18} />
          </button>
        </div>

        <div
          ref={frameRef}
          className="relative mx-auto aspect-square w-full max-w-[320px] cursor-grab touch-none overflow-hidden rounded-2xl bg-slate-900 select-none active:cursor-grabbing"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onWheel={(event) => {
            event.preventDefault()
            changeZoom(zoom + (event.deltaY < 0 ? 0.08 : -0.08))
          }}
        >
          {src && (
            <img
              ref={imageRef}
              src={src}
              alt="Photo to crop"
              draggable={false}
              onLoad={(event) => {
                setNatural({
                  w: event.currentTarget.naturalWidth,
                  h: event.currentTarget.naturalHeight,
                })
                setReady(true)
              }}
              className="absolute max-w-none"
              style={{
                left: '50%',
                top: '50%',
                width: displayW || 'auto',
                height: displayH || 'auto',
                transform: `translate(-50%, -50%) translate(${offset.x}px, ${offset.y}px)`,
              }}
            />
          )}
          <div className="pointer-events-none absolute inset-0 rounded-2xl ring-2 ring-white/80" />
          <div className="pointer-events-none absolute inset-[14%] rounded-full border border-white/70" />
          <div className="pointer-events-none absolute top-2 left-2 rounded-md bg-black/50 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-white uppercase">
            2×2
          </div>
        </div>

        <label className="mt-4 block">
          <span className="mb-1 flex items-center justify-between text-xs font-medium text-slate-500">
            Zoom
            <span>{zoom.toFixed(1)}×</span>
          </span>
          <input
            type="range"
            min="1"
            max="3"
            step="0.01"
            value={zoom}
            onChange={(event) => changeZoom(Number(event.target.value))}
            className="w-full accent-teal-700"
          />
        </label>

        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button disabled={!ready || confirming} onClick={confirmCrop}>
            <Check size={16} />
            {confirming ? 'Saving…' : 'Save 2×2 photo'}
          </Button>
        </div>
      </div>
    </div>
  )
}
