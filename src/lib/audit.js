export async function writeAudit(supabase, action, page, details = '') {
  if (!supabase || !action) return
  try {
    await supabase.rpc('record_audit', {
      p_action: action,
      p_page: page || '',
      p_details: details || '',
    })
  } catch {
    // Audit must never block the user's work.
  }
}

export function formatAuditTime(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('en-PH', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}
