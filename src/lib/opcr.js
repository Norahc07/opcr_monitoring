export const FORM_STATUSES = ['draft', 'submitted', 'reviewed', 'finalized']

export const SEMESTERS = [
  { id: 'jan_june', label: 'January – June', shortLabel: 'Jan–June' },
  { id: 'july_dec', label: 'July – December', shortLabel: 'July–Dec' },
]

export function semesterLabel(id) {
  return SEMESTERS.find((semester) => semester.id === id)?.label || id
}

export function semesterPeriodLabel(id, year) {
  const label = semesterLabel(id)
  return year ? `${label} ${year}` : label
}

export function formatCount(value) {
  if (value == null || value === '') return '0'
  const number = Number(value)
  if (!Number.isFinite(number)) return '0'
  if (Number.isInteger(number)) return String(number)
  return number.toFixed(1)
}

export function toCount(value) {
  if (value === '' || value == null) return 0
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

export function tallyKey(userId, itemId, semester) {
  return `${userId}:${itemId}:${semester}`
}

export function personLabel(profile) {
  if (!profile) return 'Staff'
  return profile.short_name || profile.full_name || 'Staff'
}

export function personTableHeader(profile) {
  const short = profile?.short_name?.trim()
  const full = profile?.full_name?.trim()
  const position = profile?.position?.trim()
  const primary = short || full || 'Staff'
  const nameLine = full && short && short.toUpperCase() !== full.toUpperCase() ? full : ''
  const secondary = [nameLine, position].filter(Boolean).join(' · ')
  return { primary, secondary }
}

export async function getLinkedStaff(supabase, userId) {
  if (!userId) return null
  const { data, error } = await supabase
    .from('office_staff')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) {
    if (error.code === 'PGRST205') return null
    throw error
  }
  return data
}

export function suggestStaffLink(profile, roster) {
  if (!profile || !roster?.length) return null
  const linked = roster.find((row) => row.user_id === profile.id)
  if (linked) return linked

  const full = profile.full_name?.trim().toLowerCase()
  const short = profile.short_name?.trim().toLowerCase()
  const unlinked = roster.filter((row) => !row.user_id)

  const byFull = unlinked.find((row) => row.full_name?.trim().toLowerCase() === full)
  if (byFull) return byFull

  const byShort = unlinked.find((row) => row.short_name?.trim().toLowerCase() === short)
  if (byShort) return byShort

  if (profile.role === 'admin') {
    const adminRow = unlinked.find((row) => row.role === 'admin')
    if (adminRow) return adminRow
  }

  return null
}

export async function linkStaffLogin(supabase, staffId, userId) {
  const { data, error } = await supabase
    .from('office_staff')
    .update({ user_id: userId })
    .eq('id', staffId)
    .select()
    .single()
  if (error) throw error
  return data
}

export function progressPercent(accomplished, target) {
  const goal = Number(target)
  const done = Number(accomplished)
  if (!Number.isFinite(goal) || goal <= 0) return null
  if (!Number.isFinite(done)) return 0
  return Math.round((done / goal) * 100)
}

export function calcEntryAverage(ratingQ, ratingE, ratingT) {
  const values = [ratingQ, ratingE, ratingT]
    .map((value) => (value === '' || value == null ? null : Number(value)))
    .filter((value) => Number.isFinite(value))

  if (values.length !== 3) return null
  return Math.round(((values[0] + values[1] + values[2]) / 3) * 100) / 100
}

export function calcFinalAverage(entries) {
  const rated = (entries || [])
    .map((entry) => Number(entry.rating_a))
    .filter((value) => Number.isFinite(value))

  if (!rated.length) return null
  return Math.round((rated.reduce((sum, value) => sum + value, 0) / rated.length) * 100) / 100
}

export function formatAverage(value) {
  if (value == null || value === '') return '—'
  const number = Number(value)
  if (!Number.isFinite(number)) return '—'
  return number.toFixed(2)
}

export function statusLabel(status) {
  return {
    draft: 'Draft',
    submitted: 'Submitted',
    reviewed: 'Reviewed',
    finalized: 'Finalized',
  }[status] || status
}

export async function getActivePeriod(supabase) {
  const { data, error } = await supabase
    .from('opcr_periods')
    .select('*')
    .eq('status', 'active')
    .order('year', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw error
  return data
}

export async function ensureUserForm(supabase, userId, periodId) {
  const { data: existing, error: existingError } = await supabase
    .from('opcr_forms')
    .select('*')
    .eq('user_id', userId)
    .eq('period_id', periodId)
    .maybeSingle()

  if (existingError) throw existingError

  let form = existing
  if (!form) {
    const { data: created, error: createError } = await supabase
      .from('opcr_forms')
      .insert({ period_id: periodId, user_id: userId, status: 'draft' })
      .select()
      .single()

    if (createError) {
      const { data: retry, error: retryError } = await supabase
        .from('opcr_forms')
        .select('*')
        .eq('user_id', userId)
        .eq('period_id', periodId)
        .single()
      if (retryError) throw createError
      form = retry
    } else {
      form = created
    }
  }

  const { data: items, error: itemsError } = await supabase
    .from('opcr_items')
    .select('*')
    .eq('period_id', periodId)
    .order('sort_order', { ascending: true })

  if (itemsError) throw itemsError

  const { data: entries, error: entriesError } = await supabase
    .from('opcr_entries')
    .select('*')
    .eq('form_id', form.id)

  if (entriesError) throw entriesError

  const existingItemIds = new Set((entries || []).map((entry) => entry.item_id))
  const missing = (items || []).filter((item) => !existingItemIds.has(item.id))

  if (missing.length) {
    const { error: insertError } = await supabase.from('opcr_entries').insert(
      missing.map((item) => ({
        form_id: form.id,
        item_id: item.id,
        actual_accomplishment: '',
        remarks: '',
      })),
    )
    if (insertError) throw insertError
  }

  return loadFormBundle(supabase, form.id)
}

export async function loadFormBundle(supabase, formId) {
  const { data: form, error: formError } = await supabase
    .from('opcr_forms')
    .select('*, profiles(full_name, role, position, office), opcr_periods(year, title, office_name)')
    .eq('id', formId)
    .single()

  if (formError) throw formError

  const { data: entries, error: entriesError } = await supabase
    .from('opcr_entries')
    .select('*, opcr_items(*)')
    .eq('form_id', formId)

  if (entriesError) throw entriesError

  const sorted = (entries || []).sort(
    (a, b) => (a.opcr_items?.sort_order || 0) - (b.opcr_items?.sort_order || 0),
  )

  return { form, entries: sorted }
}

export function toDateValue(value) {
  if (!value) return ''
  const match = String(value).trim().match(/^(\d{4}-\d{2}-\d{2})/)
  return match ? match[1] : ''
}

export function formatDateDisplay(value) {
  const day = toDateValue(value)
  if (!day) return ''
  const [year, month, date] = day.split('-').map(Number)
  return new Date(year, month - 1, date).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

function approvedCacheKey(formId) {
  return `opcr-approved:${formId}`
}

export function readApprovedCache(formId) {
  if (!formId) return null
  try {
    return JSON.parse(sessionStorage.getItem(approvedCacheKey(formId)) || 'null')
  } catch {
    return null
  }
}

export function writeApprovedCache(formId, payload) {
  if (!formId) return
  sessionStorage.setItem(
    approvedCacheKey(formId),
    JSON.stringify({
      name: payload.name || '',
      position: payload.position || '',
      date: toDateValue(payload.date),
    }),
  )
}

function closingCacheKey(formId) {
  return `opcr-closing:${formId}`
}

export function readClosingCache(formId) {
  if (!formId) return null
  try {
    return JSON.parse(localStorage.getItem(closingCacheKey(formId)) || 'null')
  } catch {
    return null
  }
}

export function writeClosingCache(formId, payload) {
  if (!formId) return
  localStorage.setItem(
    closingCacheKey(formId),
    JSON.stringify({
      comments: payload.comments || '',
      assessedName: payload.assessedName || '',
      assessedPosition: payload.assessedPosition || '',
      discussedDate: toDateValue(payload.discussedDate),
      assessedDate: toDateValue(payload.assessedDate),
      finalRaterName: payload.finalRaterName || '',
      finalRatingDate: toDateValue(payload.finalRatingDate),
    }),
  )
}

export async function saveFormSigner(supabase, formId, payload) {
  const dateValue = toDateValue(payload.approvedDate) || null
  writeApprovedCache(formId, {
    name: payload.approvedName,
    position: payload.approvedPosition,
    date: dateValue,
  })

  const { error: signerError } = await supabase
    .from('opcr_forms')
    .update({
      signer_name: payload.name || '',
      signer_position: payload.position || '',
    })
    .eq('id', formId)

  if (signerError) {
    const message = signerError.message || ''
    if (message.includes('signer_name') || message.includes('signer_position')) {
      throw new Error(
        'OPCR form fields are not set up yet. Open Supabase → SQL Editor → run supabase/profile.sql, then save again.',
      )
    }
    throw signerError
  }

  const { error: approvedError } = await supabase
    .from('opcr_forms')
    .update({
      approved_name: payload.approvedName || '',
      approved_position: payload.approvedPosition || '',
      approved_date: dateValue,
    })
    .eq('id', formId)

  if (!approvedError) return dateValue

  await supabase
    .from('opcr_forms')
    .update({
      approved_name: payload.approvedName || '',
      approved_position: payload.approvedPosition || '',
    })
    .eq('id', formId)

  const { error: dateError } = await supabase
    .from('opcr_forms')
    .update({ approved_date: dateValue })
    .eq('id', formId)

  if (dateError && dateValue) {
    throw new Error(
      'The approval date could not be saved yet. Open Supabase → SQL Editor → run supabase/profile.sql, then save again.',
    )
  }

  const closingUpdate = {
    comments: payload.comments || '',
    assessed_name: payload.assessedName || '',
    assessed_position: payload.assessedPosition || '',
    discussed_date: toDateValue(payload.discussedDate) || null,
    assessed_date: toDateValue(payload.assessedDate) || null,
    final_rating_date: toDateValue(payload.finalRatingDate) || null,
    final_rater_name: payload.finalRaterName || '',
  }
  writeClosingCache(formId, payload)
  const { error: closingError } = await supabase
    .from('opcr_forms')
    .update(closingUpdate)
    .eq('id', formId)

  if (closingError) {
    await supabase
      .from('opcr_forms')
      .update({ comments: payload.comments || '' })
      .eq('id', formId)
    await supabase
      .from('opcr_forms')
      .update({
        assessed_name: payload.assessedName || '',
        assessed_position: payload.assessedPosition || '',
        final_rater_name: payload.finalRaterName || '',
      })
      .eq('id', formId)
    await supabase
      .from('opcr_forms')
      .update({ discussed_date: toDateValue(payload.discussedDate) || null })
      .eq('id', formId)
    await supabase
      .from('opcr_forms')
      .update({ assessed_date: toDateValue(payload.assessedDate) || null })
      .eq('id', formId)
    await supabase
      .from('opcr_forms')
      .update({ final_rating_date: toDateValue(payload.finalRatingDate) || null })
      .eq('id', formId)
  }

  return dateValue
}

export async function saveEntries(supabase, entries) {
  const updates = entries.map((entry) =>
    supabase
      .from('opcr_entries')
      .update({
        actual_accomplishment: entry.actual_accomplishment || '',
        remarks: entry.remarks || '',
      })
      .eq('id', entry.id),
  )

  const results = await Promise.all(updates)
  const failed = results.find((result) => result.error)
  if (failed?.error) throw failed.error
}

export async function saveRatings(supabase, entries) {
  const updates = entries.map((entry) =>
    supabase
      .from('opcr_entries')
      .update({
        remarks: entry.remarks || '',
        rating_q: toRating(entry.rating_q),
        rating_e: toRating(entry.rating_e),
        rating_t: toRating(entry.rating_t),
      })
      .eq('id', entry.id),
  )

  const results = await Promise.all(updates)
  const failed = results.find((result) => result.error)
  if (failed?.error) throw failed.error
}

function toRating(value) {
  if (value === '' || value == null) return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function rosterSetupError(error) {
  const message = error?.message || ''
  if (
    error?.code === 'PGRST205' ||
    message.includes('office_staff') ||
    message.includes('staff_id does not exist')
  ) {
    return new Error(
      'Staff accounts are not set up yet. Open Supabase → SQL Editor → run supabase/staffs.sql → then refresh this page.',
    )
  }
  return error
}

export async function loadTallyContext(supabase, options = {}) {
  const period = await getActivePeriod(supabase)
  if (!period) return { period: null, items: [], people: [], staff: null, tallies: [] }

  const itemsQuery = supabase
    .from('opcr_items')
    .select('*')
    .eq('period_id', period.id)
    .order('sort_order', { ascending: true })

  const peopleQuery = options.includePeople
    ? supabase
        .from('office_staff')
        .select('id, full_name, short_name, position, role, include_in_tally, user_id, sort_order')
        .not('user_id', 'is', null)
        .order('sort_order', { ascending: true })
    : Promise.resolve({ data: [], error: null })

  const linkedStaff = options.userId ? await getLinkedStaff(supabase, options.userId) : null

  let talliesQuery = supabase.from('opcr_tallies').select('*').eq('period_id', period.id)
  if (linkedStaff?.id) talliesQuery = talliesQuery.eq('staff_id', linkedStaff.id)
  else if (options.userId) talliesQuery = talliesQuery.eq('user_id', options.userId)

  const [{ data: items, error: itemsError }, { data: people, error: peopleError }, { data: tallies, error: talliesError }] =
    await Promise.all([itemsQuery, peopleQuery, talliesQuery])

  if (itemsError) throw itemsError
  if (peopleError) throw rosterSetupError(peopleError)
  if (talliesError) throw rosterSetupError(talliesError)

  return {
    period,
    items: items || [],
    people: people || [],
    staff: linkedStaff,
    tallies: tallies || [],
  }
}

export function indexTallies(tallies) {
  const map = {}
  for (const tally of tallies || []) {
    const personId = tally.staff_id || tally.user_id
    map[tallyKey(personId, tally.item_id, tally.semester)] = tally
  }
  return map
}

const BOARD_CACHE_KEY = 'opcr-tally-board'

export function buildBoardRows(people, items, tallies) {
  const indexed = indexTallies(tallies)
  const nextRows = {}
  for (const person of people || []) {
    for (const item of items || []) {
      for (const itemSemester of SEMESTERS) {
        const key = tallyKey(person.id, item.id, itemSemester.id)
        const existing = indexed[key]
        nextRows[key] = {
          staff_id: person.id,
          user_id: person.user_id || null,
          item_id: item.id,
          semester: itemSemester.id,
          target: existing ? String(toCount(existing.target)) : '',
          accomplished: existing ? String(toCount(existing.accomplished)) : '',
        }
      }
    }
  }
  return nextRows
}

export function readBoardCache() {
  try {
    const raw = sessionStorage.getItem(BOARD_CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed?.period || !Array.isArray(parsed.items) || !Array.isArray(parsed.people)) return null
    return parsed
  } catch {
    return null
  }
}

export function writeBoardCache(snapshot) {
  try {
    sessionStorage.setItem(BOARD_CACHE_KEY, JSON.stringify(snapshot))
  } catch {
    // Ignore quota / private-mode failures.
  }
}

export function patchBoardCacheRow(tally) {
  const cached = readBoardCache()
  if (!cached?.period || cached.period.id !== tally.period_id) return cached
  const personId = tally.staff_id || tally.user_id
  if (!personId) return cached
  const key = tallyKey(personId, tally.item_id, tally.semester)
  const existing = cached.rows?.[key] || {
    staff_id: personId,
    user_id: tally.user_id || null,
    item_id: tally.item_id,
    semester: tally.semester,
    target: '',
    accomplished: '',
  }
  cached.rows = {
    ...(cached.rows || {}),
    [key]: {
      ...existing,
      target: String(toCount(tally.target ?? existing.target)),
      accomplished: String(toCount(tally.accomplished ?? existing.accomplished)),
    },
  }
  writeBoardCache(cached)
  return cached
}

const MY_TALLY_CACHE_KEY = 'opcr-my-tally'

export function readMyTallyCache(userId) {
  try {
    const raw = sessionStorage.getItem(MY_TALLY_CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || parsed.userId !== userId) return null
    return parsed
  } catch {
    return null
  }
}

export function writeMyTallyCache(snapshot) {
  try {
    sessionStorage.setItem(MY_TALLY_CACHE_KEY, JSON.stringify(snapshot))
  } catch {
    // Ignore quota / private-mode failures.
  }
}

export async function saveStaffTallies(supabase, periodId, staffId, userId, rows) {
  const payload = rows.map((row) => ({
    period_id: periodId,
    staff_id: staffId,
    user_id: userId,
    item_id: row.item_id,
    semester: row.semester,
    accomplished: toCount(row.accomplished),
  }))

  const { error } = await supabase.from('opcr_tallies').upsert(payload, {
    onConflict: 'period_id,staff_id,item_id,semester',
  })
  if (error) throw error

  const cached = readBoardCache()
  if (cached?.period?.id === periodId) {
    for (const row of payload) {
      patchBoardCacheRow({ ...row, period_id: periodId })
    }
  }
}

export async function saveAdminTallies(supabase, periodId, rows) {
  const payload = rows.map((row) => ({
    period_id: periodId,
    staff_id: row.staff_id,
    user_id: row.user_id || null,
    item_id: row.item_id,
    semester: row.semester,
    target: toCount(row.target),
    accomplished: toCount(row.accomplished),
  }))

  const { error } = await supabase.from('opcr_tallies').upsert(payload, {
    onConflict: 'period_id,staff_id,item_id,semester',
  })
  if (error) throw error

  if (readBoardCache()?.period?.id === periodId) {
    for (const row of payload) {
      patchBoardCacheRow({ ...row, period_id: periodId })
    }
  }
}

