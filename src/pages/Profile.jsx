import { useEffect, useRef, useState } from 'react'
import { Camera, ImagePlus, X } from 'lucide-react'
import { useAuth } from '../context/useAuth'
import { supabase } from '../lib/supabase'
import CropPhotoModal from '../components/CropPhotoModal'
import { Alert, Avatar, Button, LoadingState, PageHeader, Toast, useToast } from '../components/ui'

export default function Profile() {
  const { user, profile, isAdmin, refreshProfile, loading: authLoading } = useAuth()
  const { toast, toastPhase, showToast, clearToast } = useToast()
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [cameraOpen, setCameraOpen] = useState(false)
  const [cameraReady, setCameraReady] = useState(false)
  const [cropSrc, setCropSrc] = useState('')
  const fileRef = useRef(null)
  const videoRef = useRef(null)
  const streamRef = useRef(null)

  const displayName = profile?.full_name || user?.email || 'OPCR user'

  function stopCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    setCameraReady(false)
    setCameraOpen(false)
  }

  function closeCrop() {
    if (cropSrc.startsWith('blob:')) URL.revokeObjectURL(cropSrc)
    setCropSrc('')
  }

  function openCrop(file) {
    if (!file) return
    setError('')
    clearToast()
    if (cropSrc.startsWith('blob:')) URL.revokeObjectURL(cropSrc)
    setCropSrc(URL.createObjectURL(file))
  }

  useEffect(() => {
    return () => {
      if (cropSrc.startsWith('blob:')) URL.revokeObjectURL(cropSrc)
    }
  }, [cropSrc])

  useEffect(() => {
    if (!cameraOpen) return undefined

    let cancelled = false

    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        })
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play()
          if (!cancelled) setCameraReady(true)
        }
      } catch (err) {
        if (cancelled) return
        setCameraOpen(false)
        setError(
          err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError'
            ? 'Camera permission was blocked. Allow camera access in the browser, or use Upload photo instead.'
            : 'No camera was found. Use Upload photo to choose a picture from your files.',
        )
      }
    }

    startCamera()
    return () => {
      cancelled = true
      streamRef.current?.getTracks().forEach((track) => track.stop())
      streamRef.current = null
      setCameraReady(false)
    }
  }, [cameraOpen])

  async function savePhoto(file) {
    if (!file || !user?.id || !supabase) return
    setUploading(true)
    setError('')
    clearToast()
    try {
      const path = `${user.id}/avatar.jpg`
      const { error: uploadError } = await supabase.storage.from('avatars').upload(path, file, {
        upsert: true,
        contentType: 'image/jpeg',
      })
      if (uploadError) throw uploadError

      const { data } = supabase.storage.from('avatars').getPublicUrl(path)
      const avatarUrl = `${data.publicUrl}?t=${Date.now()}`
      const { error: saveError } = await supabase
        .from('profiles')
        .update({ avatar_url: avatarUrl })
        .eq('id', user.id)
      if (saveError) throw saveError
      await refreshProfile?.()
      closeCrop()
      showToast('Profile photo updated.')
    } catch (err) {
      setError(
        err.message?.includes('Bucket not found') || err.message?.includes('avatar_url')
          ? 'Photo storage is not set up yet. Open Supabase → SQL Editor → run supabase/profile.sql, then try again.'
          : err.message,
      )
    } finally {
      setUploading(false)
    }
  }

  function capturePhoto() {
    const video = videoRef.current
    if (!video || !video.videoWidth) return

    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    ctx.translate(canvas.width, 0)
    ctx.scale(-1, 1)
    ctx.drawImage(video, 0, 0)

    canvas.toBlob(
      (blob) => {
        if (!blob) return
        stopCamera()
        openCrop(new File([blob], 'camera.jpg', { type: 'image/jpeg' }))
      },
      'image/jpeg',
      0.92,
    )
  }

  if (authLoading) return <LoadingState label="Loading profile…" />

  return (
    <div className="mx-auto w-full max-w-2xl space-y-5">
      <PageHeader
        kicker="Account"
        title="Profile"
        description="Your account name stays locked in the header. Update your photo here."
      />

      {error && <Alert tone="danger">{error}</Alert>}

      <section className="card p-6 sm:p-8">
        <div className="flex flex-col items-center gap-4 text-center">
          <Avatar name={profile?.full_name || ''} src={profile?.avatar_url || ''} size="lg" />
          <div>
            <p className="text-lg font-bold text-slate-900">{displayName}</p>
            <p className="text-sm text-slate-500 italic">{profile?.position || 'No position set'}</p>
          </div>
        </div>

        <dl className="mt-6 grid gap-3 rounded-2xl bg-slate-50 p-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Email</dt>
            <dd className="mt-1 text-slate-800">{user?.email || '—'}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Role</dt>
            <dd className="mt-1 text-slate-800">{isAdmin ? 'Admin / Head' : 'Staff'}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Office</dt>
            <dd className="mt-1 text-slate-800">{profile?.office || 'E-Learning Ville'}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Short name</dt>
            <dd className="mt-1 text-slate-800">{profile?.short_name || '—'}</dd>
          </div>
        </dl>

        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => {
              openCrop(event.target.files?.[0])
              event.target.value = ''
            }}
          />
          <Button variant="secondary" disabled={uploading} onClick={() => fileRef.current?.click()}>
            <ImagePlus size={16} />
            Upload photo
          </Button>
          <Button
            disabled={uploading}
            onClick={() => {
              setError('')
              clearToast()
              setCameraOpen(true)
            }}
          >
            <Camera size={16} />
            Take picture
          </Button>
        </div>
        <p className="mt-3 text-center text-xs text-slate-500">
          After you upload or capture, align your face in the 2×2 square before saving.
        </p>
      </section>

      {cameraOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/50"
            aria-label="Close camera"
            onClick={stopCamera}
          />
          <div className="card relative z-10 w-full max-w-md p-5 shadow-2xl">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h3 className="text-lg font-semibold text-slate-900">Take picture</h3>
              <button
                type="button"
                onClick={stopCamera}
                className="rounded-xl p-1.5 text-slate-500 hover:bg-slate-100"
              >
                <X size={18} />
              </button>
            </div>
            <div className="overflow-hidden rounded-2xl bg-slate-900">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="aspect-square w-full object-cover [transform:scaleX(-1)]"
              />
            </div>
            <p className="mt-3 text-center text-xs text-slate-500">
              {cameraReady ? 'Capture first. You can crop and align next.' : 'Starting camera…'}
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="secondary" onClick={stopCamera}>
                Cancel
              </Button>
              <Button disabled={!cameraReady} onClick={capturePhoto}>
                <Camera size={16} />
                Capture
              </Button>
            </div>
          </div>
        </div>
      )}

      {cropSrc && (
        <CropPhotoModal
          src={cropSrc}
          confirming={uploading}
          onCancel={closeCrop}
          onConfirm={savePhoto}
        />
      )}
      <Toast message={toast} phase={toastPhase} />
    </div>
  )
}
