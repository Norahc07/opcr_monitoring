import { useEffect, useState } from 'react'
import { Download } from 'lucide-react'
import { Button } from './ui'

function isStandalone() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true
  )
}

function isIos() {
  const ua = window.navigator.userAgent || ''
  const iPad = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1
  return /iPhone|iPad|iPod/i.test(ua) || iPad
}

export default function InstallAppButton() {
  const [deferred, setDeferred] = useState(null)
  const [installed, setInstalled] = useState(() =>
    typeof window === 'undefined' ? false : isStandalone(),
  )
  const [help, setHelp] = useState('')

  useEffect(() => {
    if (isStandalone()) {
      setInstalled(true)
      return undefined
    }

    function onPrompt(event) {
      event.preventDefault()
      setDeferred(event)
      setHelp('')
    }

    function onInstalled() {
      setDeferred(null)
      setInstalled(true)
      setHelp('')
    }

    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  async function install() {
    if (deferred) {
      deferred.prompt()
      const choice = await deferred.userChoice
      setDeferred(null)
      if (choice.outcome === 'accepted') setInstalled(true)
      return
    }

    setHelp(
      isIos()
        ? 'On iPhone or iPad, tap Share, then Add to Home Screen.'
        : 'In Chrome or Edge, open the browser menu and choose Install app.',
    )
  }

  if (installed) {
    return (
      <p className="mt-4 text-center text-xs font-medium text-teal-700">Installed on this device.</p>
    )
  }

  return (
    <div className="mt-4">
      <Button variant="secondary" className="w-full" onClick={install}>
        <Download size={16} />
        Install app
      </Button>
      {help && <p className="mt-2 text-center text-xs leading-5 text-slate-500">{help}</p>}
    </div>
  )
}
