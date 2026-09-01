import { useEffect, useRef, useState } from 'react'
import { Camera, Check, ImagePlus, KeyRound, Pencil, Save, UserRound, X } from 'lucide-react'
import { useAuth } from '../context/useAuth'
import { supabase } from '../lib/supabase'
import { writeAudit } from '../lib/audit'
import CropPhotoModal from '../components/CropPhotoModal'
import { Alert, Avatar, Button, LoadingState, Toast, useToast } from '../components/ui'

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
    <div className="profile-page space-y-4">
      <div>
        <p className="text-xs font-semibold tracking-[0.18em] text-teal-700 uppercase">Account</p>
        <h1 className="mt-0.5 text-2xl font-semibold tracking-tight text-slate-900">Profile</h1>
      </div>

      {error && <Alert tone="danger">{error}</Alert>}

      <div className="grid items-stretch gap-4 lg:grid-cols-[18.5rem_minmax(0,1fr)]">
        <section className="card flex h-full flex-col overflow-hidden">
          <div className="h-20 shrink-0 bg-gradient-to-br from-teal-800 via-teal-600 to-emerald-500" />
          <div className="flex flex-1 flex-col items-center px-4 pb-4">
            <div className="-mt-11 rounded-full bg-white p-1 shadow-md ring-4 ring-white">
              <Avatar name={profile?.full_name || ''} src={profile?.avatar_url || ''} size="lg" />
            </div>
            <p className="mt-2.5 text-center text-base font-bold tracking-tight text-slate-900">
              {displayName}
            </p>
            <p className="text-sm text-slate-500">{profile?.position || 'No position set'}</p>
            <p className="mt-2 rounded-full bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-800">
              {isAdmin ? 'Admin' : 'Staff'} · {profile?.office || 'E-Learning Ville'}
            </p>

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
            <div className="mt-auto w-full pt-6">
              <div className="grid w-full grid-cols-2 gap-2">
                <Button
                  variant="secondary"
                  className="w-full px-3"
                  disabled={uploading}
                  onClick={() => fileRef.current?.click()}
                >
                  <ImagePlus size={16} />
                  Upload
                </Button>
                <Button
                  className="w-full px-3"
                  disabled={uploading}
                  onClick={() => {
                    setError('')
                    clearToast()
                    setCameraOpen(true)
                  }}
                >
                  <Camera size={16} />
                  Camera
                </Button>
              </div>
              <p className="mt-2 text-center text-xs text-slate-500">
                Crop to a square after you pick a photo.
              </p>
            </div>
          </div>
        </section>

        <div className="space-y-4">
          <section className="card p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
                  <UserRound size={18} className="text-teal-700" />
                  Account details
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">Name and position shown on tally and OPCR.</p>
              </div>
              {!editingProfile ? (
                <Button variant="secondary" onClick={startEditProfile}>
                  <Pencil size={16} />
                  Edit
                </Button>
              ) : (
                <div className="flex gap-2">
                  <Button variant="ghost" disabled={savingProfile} onClick={cancelEditProfile}>
                    <X size={16} />
                    Cancel
                  </Button>
                  <Button disabled={savingProfile} onClick={saveProfile}>
                    <Save size={16} />
                    {savingProfile ? 'Saving…' : 'Save'}
                  </Button>
                </div>
              )}
            </div>

            {editingProfile ? (
              <form className="mt-4 grid grid-cols-3 gap-3" onSubmit={(event) => event.preventDefault()}>
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold tracking-wide text-slate-500 uppercase">
                    Full name
                  </span>
                  <input
                    className="field"
                    value={fullName}
                    onChange={(event) => setFullName(event.target.value)}
                    placeholder="Your full name"
                    autoComplete="name"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold tracking-wide text-slate-500 uppercase">
                    Short name
                  </span>
                  <input
                    className="field"
                    value={shortName}
                    onChange={(event) => setShortName(event.target.value)}
                    placeholder="Tally nickname"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold tracking-wide text-slate-500 uppercase">
                    Position
                  </span>
                  <input
                    className="field"
                    value={position}
                    onChange={(event) => setPosition(event.target.value)}
                    placeholder="Your title"
                  />
                </label>
              </form>
            ) : (
              <dl className="mt-4 grid grid-cols-3 gap-2.5">
                {[
                  ['Email', user?.email || '—'],
                  ['Role', isAdmin ? 'Admin / Head' : 'Staff'],
                  ['Office', profile?.office || 'E-Learning Ville'],
                  ['Full name', profile?.full_name || '—'],
                  ['Short name', profile?.short_name || '—'],
                  ['Position', profile?.position || '—'],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-xl bg-slate-50 px-3 py-2.5">
                    <dt className="text-[11px] font-semibold tracking-wide text-slate-500 uppercase">
                      {label}
                    </dt>
                    <dd className="mt-0.5 truncate text-sm font-medium text-slate-800" title={value}>
                      {value}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </section>

          <section className="card p-5">
            <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
              <KeyRound size={18} className="text-teal-700" />
              Change password
            </h2>
            <form className="mt-3 grid grid-cols-[1fr_1fr_auto] items-end gap-3" onSubmit={savePassword}>
              <label className="block min-w-0">
                <span className="mb-1 block text-xs font-semibold tracking-wide text-slate-500 uppercase">
                  New password
                </span>
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
              <label className="block min-w-0">
                <span className="mb-1 block text-xs font-semibold tracking-wide text-slate-500 uppercase">
                  Confirm password
                </span>
                <input
                  type="password"
                  className="field"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  placeholder="Re-enter password"
                  autoComplete="new-password"
                  minLength={8}
                />
              </label>
              <Button
                type="submit"
                className="h-10"
                disabled={savingPassword || !newPassword || !confirmPassword}
              >
                <Check size={16} />
                {savingPassword ? 'Updating…' : 'Update'}
              </Button>
            </form>
          </section>
        </div>
      </div>

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
                <X size={16} />
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
