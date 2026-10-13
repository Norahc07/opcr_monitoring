export const ONLINE_WINDOW_MS = 2 * 60 * 1000
export const PRESENCE_PING_MS = 30 * 1000

export function isOnline(lastSeenAt, now = Date.now()) {
  if (!lastSeenAt) return false
  const at = new Date(lastSeenAt).getTime()
  if (!Number.isFinite(at)) return false
  return now - at <= ONLINE_WINDOW_MS
}

function plural(count, word) {
  return `${count} ${word}${count === 1 ? '' : 's'}`
}

export function formatOfflineDuration(lastSeenAt, now = Date.now()) {
  if (!lastSeenAt) return 'Never signed in'
  const at = new Date(lastSeenAt).getTime()
  if (!Number.isFinite(at)) return 'Never signed in'
  const ms = Math.max(0, now - at)
  if (ms <= ONLINE_WINDOW_MS) return 'Active now'

  const minutes = Math.max(1, Math.floor(ms / 60000))
  if (minutes < 60) return `${plural(minutes, 'min')} offline`

  const hours = Math.floor(minutes / 60)
  const remMin = minutes % 60
  if (hours < 24) {
    return remMin
      ? `${hours}h ${remMin}m offline`
      : `${plural(hours, 'hour')} offline`
  }

  const days = Math.floor(hours / 24)
  const remHours = hours % 24
  if (remHours) return `${days}d ${remHours}h offline`
  return `${plural(days, 'day')} offline`
}

export function presenceInfo(lastSeenAt, now = Date.now()) {
  const online = isOnline(lastSeenAt, now)
  return {
    online,
    label: online ? 'Online' : 'Offline',
    detail: formatOfflineDuration(lastSeenAt, now),
  }
}

function isMissingPresenceSetup(error) {
  const message = String(error?.message || error?.details || '')
  return (
    message.includes('last_seen_at') ||
    message.includes('touch_last_seen') ||
    error?.code === 'PGRST202' ||
    error?.code === '42703'
  )
}

export async function pingLastSeen(client, userId) {
  if (!client || !userId) return { ok: false, missingSetup: false }

  const { data, error } = await client.rpc('touch_last_seen')
  if (!error && data) return { ok: true, at: data, missingSetup: false }

  const seen = new Date().toISOString()
  const { data: row, error: updateError } = await client
    .from('profiles')
    .update({ last_seen_at: seen })
    .eq('id', userId)
    .select('last_seen_at')
    .maybeSingle()

  if (!updateError && row?.last_seen_at) {
    return { ok: true, at: row.last_seen_at, missingSetup: false }
  }

  const { data: created, error: insertError } = await client
    .from('profiles')
    .upsert({ id: userId, last_seen_at: seen }, { onConflict: 'id' })
    .select('last_seen_at')
    .maybeSingle()

  if (!insertError && created?.last_seen_at) {
    return { ok: true, at: created.last_seen_at, missingSetup: false }
  }

  const fail = error || updateError || insertError
  return {
    ok: false,
    missingSetup: isMissingPresenceSetup(fail),
    error: fail,
  }
}

export async function loadLastSeenMap(client) {
  const map = new Map()
  if (!client) return { map, missingSetup: false, error: null }

  const rpc = await client.rpc('list_last_seen')
  if (!rpc.error) {
    for (const row of rpc.data || []) {
      if (row?.id) map.set(row.id, row.last_seen_at || null)
    }
    return { map, missingSetup: false, error: null }
  }

  const query = await client.from('profiles').select('id, last_seen_at')
  if (!query.error) {
    for (const row of query.data || []) {
      if (row?.id) map.set(row.id, row.last_seen_at || null)
    }
    return { map, missingSetup: false, error: null }
  }

  return {
    map,
    missingSetup: isMissingPresenceSetup(rpc.error) || isMissingPresenceSetup(query.error),
    error: query.error || rpc.error,
  }
}
