import { useEffect, useRef, useState } from 'react'
import { Camera, ImagePlus, Lock, Pencil, UserRound, X } from 'lucide-react'
import { useAuth } from '../context/useAuth'
import { supabase } from '../lib/supabase'
import { writeAudit } from '../lib/audit'
import CropPhotoModal from '../components/CropPhotoModal'
import { Alert, Avatar, Button, LoadingState, PageHeader, Toast, useToast } from '../components/ui'

export default function Profile() {
  const { user, profile, isAdmin, refreshProfile, updateProfile, updatePassword, loading: authLoading } =
    useAuth()
  const { toast, toastPhase, showToast, clearToast } = useToast()
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [cameraOpen, setCameraOpen] = useState(false)
  const [cameraReady, setCameraReady] = useState(false)
  const [cropSrc, setCropSrc] = useState('')
  const [editingProfile, setEditingProfile] = useState(false)
  const [savingProfile, setSavingProfile] = useState(false)
  const [fullName, setFullName] = useState('')
  const [shortName, setShortName] = useState('')
  const [position, setPosition] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [savingPassword, setSavingPassword] = useState(false)
  const fileRef = useRef(null)
  const videoRef = useRef(null)
  const streamRef = useRef(null)

  const displayName = profile?.full_name || user?.email || 'OPCR user'

  useEffect(() => {
    if (!profile) return
    setFullName(profile.full_name || '')
    setShortName(profile.short_name || '')
    setPosition(profile.position || '')
  }, [profile])

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

  function startEditProfile() {
    setFullName(profile?.full_name || '')
    setShortName(profile?.short_name || '')
    setPosition(profile?.position || '')
    setEditingProfile(true)
    setError('')
    clearToast()
  }

  function cancelEditProfile() {
    setFullName(profile?.full_name || '')
    setShortName(profile?.short_name || '')
    setPosition(profile?.position || '')
    setEditingProfile(false)
  }

  async function saveProfile() {
    setSavingProfile(true)
    setError('')
    clearToast()
    try {
      await updateProfile({
        fullName,
        shortName,
        position,
      })
      setEditingProfile(false)
      await writeAudit(supabase, 'Updated profile', 'Profile', fullName.trim())
      showToast('Profile updated.')
    } catch (err) {
      setError(err.message || 'Could not save profile.')
    } finally {
      setSavingProfile(false)
    }
  }

  async function savePassword(event) {
    event.preventDefault()
    setError('')
    clearToast()

    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters.')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('New passwords do not match.')
      return
    }

    setSavingPassword(true)
    try {
      await updatePassword(newPassword)
      setNewPassword('')
      setConfirmPassword('')
      await writeAudit(supabase, 'Changed password', 'Profile')
      showToast('Password updated.')
    } catch (err) {
      setError(err.message || 'Could not update password.')
    } finally {
      setSavingPassword(false)
    }
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
      await writeAudit(supabase, 'Updated profile photo', 'Profile')
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
        description="Update your photo, account details, and password."
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

      <section className="card p-6 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
              <UserRound size={18} />
              Edit profile
            </h2>
            <p className="mt-1 text-sm text-slate-500">Update your name and position shown in the app.</p>
          </div>
          {!editingProfile ? (
            <Button variant="secondary" onClick={startEditProfile}>
              <Pencil size={16} />
              Edit
            </Button>
          ) : (
            <div className="flex gap-2">
              <Button variant="ghost" disabled={savingProfile} onClick={cancelEditProfile}>
                Cancel
              </Button>
              <Button disabled={savingProfile} onClick={saveProfile}>
                {savingProfile ? 'Saving…' : 'Save'}
              </Button>
            </div>
          )}
        </div>

        {editingProfile ? (
          <form className="mt-5 space-y-4" onSubmit={(event) => event.preventDefault()}>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">Full name</span>
              <input
                className="field"
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                placeholder="Your full name"
                autoComplete="name"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">Short name</span>
              <input
                className="field"
                value={shortName}
                onChange={(event) => setShortName(event.target.value)}
                placeholder="Name shown on tally columns"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">Position</span>
              <input
                className="field"
                value={position}
                onChange={(event) => setPosition(event.target.value)}
                placeholder="Your position or title"
              />
            </label>
          </form>
        ) : (
          <dl className="mt-5 grid gap-3 rounded-2xl bg-slate-50 p-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Email</dt>
              <dd className="mt-1 text-slate-800">{user?.email || '—'}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Role</dt>
              <dd className="mt-1 text-slate-800">{isAdmin ? 'Admin / Head' : 'Staff'}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Full name</dt>
              <dd className="mt-1 text-slate-800">{profile?.full_name || '—'}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Short name</dt>
              <dd className="mt-1 text-slate-800">{profile?.short_name || '—'}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Position</dt>
              <dd className="mt-1 text-slate-800">{profile?.position || '—'}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Office</dt>
              <dd className="mt-1 text-slate-800">{profile?.office || 'E-Learning Ville'}</dd>
            </div>
          </dl>
        )}
      </section>

      <section className="card p-6 sm:p-8">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
          <Lock size={18} />
          Change password
        </h2>
        <p className="mt-1 text-sm text-slate-500">Use at least 8 characters for your new password.</p>

        <form className="mt-5 space-y-4" onSubmit={savePassword}>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">New password</span>
            <input
              type="password"
              className="field"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              placeholder="At least 8 characters"
              autoComplete="new-password"
              minLength={8}
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">Confirm new password</span>
            <input
              type="password"
              className="field"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="Re-enter your new password"
              autoComplete="new-password"
              minLength={8}
            />
          </label>
          <Button type="submit" disabled={savingPassword || !newPassword || !confirmPassword}>
            {savingPassword ? 'Updating…' : 'Update password'}
          </Button>
        </form>
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
