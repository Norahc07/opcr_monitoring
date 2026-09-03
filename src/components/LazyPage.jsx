import { Suspense } from 'react'
import { LoadingState } from './ui'

export default function LazyPage({ children, label = 'Loading…' }) {
  return <Suspense fallback={<LoadingState label={label} />}>{children}</Suspense>
}
