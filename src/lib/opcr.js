import {
  normalizeSection,
  outputKey,
  sectionForOutput,
  sectionFromItem,
  sectionLabel,
} from './coreFunctions'

export { outputKey } from './coreFunctions'

export const FORM_STATUSES = ['draft', 'submitted', 'reviewed', 'finalized']

export const TALLY_PERIOD_ID = 'jan_dec'
export const TALLY_CACHE_VERSION = 'opcr-src-v5'

export const SEMESTERS = [
  { id: TALLY_PERIOD_ID, label: 'January – December', shortLabel: 'Jan–Dec' },
]

export function semesterLabel(id) {
  return SEMESTERS.find((semester) => semester.id === id)?.label || 'January – December'
}

export function annualPeriodLabel(year) {
  return year ? `January – December ${year}` : 'January – December'
}

export function semesterPeriodLabel(_id, year) {
  return annualPeriodLabel(year)
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

function toTitleCaseName(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .split(/[\s._-]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

function friendlyShortName(shortRaw, fullName) {
  const short = String(shortRaw || '').trim()
  const full = String(fullName || '').trim()
  const firstName = full.split(/\s+/)[0] || ''

  if (short && !/[\s._-]/.test(short) && short.length > 10 && firstName) {
    return toTitleCaseName(firstName)
  }
  if (!short) return firstName ? toTitleCaseName(firstName) : full || 'Staff'
  if (short.length <= 3 && short === short.toUpperCase()) return short
  if (short === short.toUpperCase() && /[A-Z]/.test(short)) return toTitleCaseName(short)
  return short
}

export function personTableHeader(profile) {
  const short = profile?.short_name?.trim() || ''
  const full = profile?.full_name?.trim() || ''
  const position = profile?.position?.trim() || ''
  const primary = friendlyShortName(short, full)
  const secondary =
    full && full.toUpperCase() !== primary.toUpperCase() ? full : ''
  const title = [full || primary, position].filter(Boolean).join(' · ')
  return { primary, secondary, title }
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

export function isTempEntryId(id) {
  return !id || String(id).startsWith('tmp-')
}

export function isPrimaryOpcrEntry(entry) {
  return !entry?.parent_entry_id
}

export function combineSuccessIndicators(lines) {
  return [...(lines || [])]
    .sort((a, b) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0))
    .map((entry) => String(entry.success_indicator || '').trim())
    .filter(Boolean)
    .join('\n\n')
}

export function groupOpcrSectionEntries(entries, section) {
  const normalized = normalizeSection(section)
  const sorted = [...(entries || [])]
    .filter((entry) => normalizeSection(entry.section) === normalized)
    .sort(
      (a, b) =>
        (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0) ||
        String(a.output || '').localeCompare(String(b.output || '')),
    )
  const primaries = sorted.filter(isPrimaryOpcrEntry)
  return primaries.map((primary) => ({
    primary,
    lines: sorted.filter(
      (entry) => entry.id === primary.id || entry.parent_entry_id === primary.id,
    ),
  }))
}

function entryPayload(entry) {
  return {
    item_id: entry.item_id || null,
    output: entry.output || '',
    success_indicator: entry.success_indicator || '',
    section: normalizeSection(Number(entry.section) || 1),
    sort_order: Number(entry.sort_order) || 0,
    parent_entry_id: entry.parent_entry_id || null,
    accountable: entry.accountable || '',
    actual_accomplishment: entry.actual_accomplishment || '',
    remarks: entry.remarks || '',
  }
}

function expandRemovedEntryIds(entries, removedIds) {
  const expanded = new Set((removedIds || []).filter(Boolean))
  for (const id of [...expanded]) {
    for (const child of entries || []) {
      if (child.parent_entry_id === id && child.id && !isTempEntryId(child.id)) {
        expanded.add(child.id)
      }
    }
  }
  return [...expanded]
}

function resolveParentEntryId(parentEntryId, idMap) {
  if (!parentEntryId) return null
  if (isTempEntryId(parentEntryId)) return idMap[parentEntryId] || null
  return parentEntryId
}

export function hydrateOpcrEntry(entry) {
  const output = String(entry.output || '').trim() || entry.opcr_items?.output || ''
  const successIndicator =
    String(entry.success_indicator || '').trim() || entry.opcr_items?.success_indicator || ''
  const section = normalizeSection(
    Number(entry.section) > 0 ? Number(entry.section) : sectionForOutput(output),
  )
  return {
    ...entry,
    output,
    success_indicator: successIndicator,
    accountable: String(entry.accountable || '').trim(),
    section,
    parent_entry_id: entry.parent_entry_id || null,
    sort_order: entry.sort_order ?? entry.opcr_items?.sort_order ?? 0,
  }
}

function missingOpcrRowError(error) {
  const message = error?.message || ''
  if (
    message.includes('output') ||
    message.includes('success_indicator') ||
    message.includes('section') ||
    message.includes('sort_order') ||
    message.includes('parent_entry_id') ||
    message.includes('accountable')
  ) {
    return new Error(
      'OPCR row editing is not set up yet. Open Supabase → SQL Editor → run supabase/opcr_editable.sql, supabase/opcr_nested.sql, and supabase/opcr_accountable.sql, then save again.',
    )
  }
  return error
}

function missingTallySyncError(error) {
  const message = error?.message || ''
  if (
    error?.code === 'PGRST202' ||
    error?.code === 'PGRST204' ||
    error?.code === '42703' ||
    message.includes('origin') ||
    message.includes('delete_unused_opcr_item') ||
    message.includes('permission denied') ||
    message.includes('opcr_items')
  ) {
    return new Error(
      'Tally sync is not set up yet. Open Supabase → SQL Editor → run supabase/opcr_tally_sync.sql, then save again.',
    )
  }
  return error
}

function interpolateSort(prev, next) {
  if (prev != null && next != null && next > prev + 1) return Math.floor((prev + next) / 2)
  if (prev != null && next != null) return prev + 1
  if (prev != null) return prev + 10
  if (next != null) return Math.max(1, next - 1)
  return 10
}

function customSortOrders(entries, itemMeta) {
  const assigned = {}
  for (const section of [1, 2]) {
    const list = entries
      .filter((entry) => normalizeSection(entry.section) === section)
      .sort((a, b) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0))

    for (let index = 0; index < list.length; index += 1) {
      const entry = list[index]
      const meta = entry.item_id ? itemMeta[entry.item_id] : null
      const isCustom = !entry.item_id || meta?.origin === 'opcr'
      if (!isCustom) continue

      let prevSort = null
      for (let look = index - 1; look >= 0; look -= 1) {
        const sibling = list[look]
        if (assigned[sibling.id] != null) {
          prevSort = assigned[sibling.id]
          break
        }
        const siblingMeta = sibling.item_id ? itemMeta[sibling.item_id] : null
        if (siblingMeta && siblingMeta.origin !== 'opcr') {
          prevSort = Number(siblingMeta.sort_order) || 0
          break
        }
      }

      let nextSort = null
      for (let look = index + 1; look < list.length; look += 1) {
        const sibling = list[look]
        const siblingMeta = sibling.item_id ? itemMeta[sibling.item_id] : null
        if (siblingMeta && siblingMeta.origin !== 'opcr') {
          nextSort = Number(siblingMeta.sort_order) || 0
          break
        }
      }

      assigned[entry.id] = interpolateSort(prevSort, nextSort)
    }
  }
  return assigned
}

async function loadItemMeta(supabase, itemIds) {
  const ids = [...new Set((itemIds || []).filter(Boolean))]
  if (!ids.length) return {}
  const { data, error } = await supabase
    .from('opcr_items')
    .select('id, origin, category, sort_order')
    .in('id', ids)
  if (error) throw missingTallySyncError(error)
  return Object.fromEntries((data || []).map((row) => [row.id, row]))
}

async function syncOpcrItemsToTally(supabase, periodId, entries) {
  const primaries = (entries || []).filter(isPrimaryOpcrEntry)
  const itemMeta = await loadItemMeta(
    supabase,
    primaries.map((entry) => entry.item_id),
  )
  const sortByEntry = customSortOrders(primaries, itemMeta)

  const linked = []
  for (const entry of primaries) {
    const section = normalizeSection(Number(entry.section) || 1)
    const category = sectionLabel(section)
    const output = String(entry.output || '').trim() || 'New row'
    const children = (entries || []).filter((row) => row.parent_entry_id === entry.id)
    const success = combineSuccessIndicators([entry, ...children])
    const sortOrder = (sortByEntry[entry.id] ?? Number(entry.sort_order)) || 0

    if (!entry.item_id) {
      const { data, error } = await supabase
        .from('opcr_items')
        .insert({
          period_id: periodId,
          category,
          output,
          success_indicator: success,
          sort_order: sortOrder,
          origin: 'opcr',
        })
        .select('id, origin, category, sort_order')
        .single()
      if (error) throw missingTallySyncError(error)
      itemMeta[data.id] = data
      linked.push({ ...entry, item_id: data.id, section })
      continue
    }

    const { error } = await supabase
      .from('opcr_items')
      .update({
        output,
        success_indicator: success,
        sort_order: sortOrder,
        category,
      })
      .eq('id', entry.item_id)
    if (error) throw missingTallySyncError(error)
    linked.push({ ...entry, section })
  }
  return linked
}

async function cleanupRemovedOpcrItems(supabase, formId, itemIds) {
  const ids = [...new Set((itemIds || []).filter(Boolean))]
  if (!ids.length) return

  const { data: form, error: formError } = await supabase
    .from('opcr_forms')
    .select('user_id')
    .eq('id', formId)
    .single()
  if (formError) throw missingTallySyncError(formError)

  const staff = form?.user_id ? await getLinkedStaff(supabase, form.user_id) : null

  for (const itemId of ids) {
    if (staff?.id) {
      const { error: staffTallyError } = await supabase
        .from('opcr_tallies')
        .delete()
        .eq('staff_id', staff.id)
        .eq('item_id', itemId)
      if (staffTallyError) throw missingTallySyncError(staffTallyError)

      const { error: staffDailyError } = await supabase
        .from('opcr_daily_logs')
        .delete()
        .eq('staff_id', staff.id)
        .eq('item_id', itemId)
      if (staffDailyError && !String(staffDailyError.message || '').includes('opcr_daily_logs')) {
        throw missingTallySyncError(staffDailyError)
      }
    }

    const { count, error: countError } = await supabase
      .from('opcr_entries')
      .select('id', { count: 'exact', head: true })
      .eq('item_id', itemId)
    if (countError) throw missingTallySyncError(countError)

    if ((count || 0) > 0) continue

    const { error: tallyError } = await supabase.from('opcr_tallies').delete().eq('item_id', itemId)
    if (tallyError) throw missingTallySyncError(tallyError)

    const { error: dailyError } = await supabase.from('opcr_daily_logs').delete().eq('item_id', itemId)
    if (dailyError && !String(dailyError.message || '').includes('opcr_daily_logs')) {
      throw missingTallySyncError(dailyError)
    }

    const { data: item, error: itemError } = await supabase
      .from('opcr_items')
      .select('origin')
      .eq('id', itemId)
      .maybeSingle()
    if (itemError) throw missingTallySyncError(itemError)

    if (item?.origin === 'opcr') {
      const { error: deleteItemError } = await supabase.from('opcr_items').delete().eq('id', itemId)
      if (deleteItemError) throw missingTallySyncError(deleteItemError)
    }
  }
}

function filterTallyItems(items, activeOpcrItemIds) {
  const seen = new Set()
  return (items || []).filter((item) => {
    if (!item?.id) return false
    if (!activeOpcrItemIds.has(item.id)) return false
    if (seen.has(item.id)) return false
    seen.add(item.id)
    return true
  })
}

async function loadItemLayoutMap(supabase, periodId, options = {}) {
  let formsQuery = supabase.from('opcr_forms').select('id').eq('period_id', periodId)
  if (options.userId) {
    formsQuery = formsQuery.eq('user_id', options.userId)
  }

  const { data: forms, error: formsError } = await formsQuery
  if (formsError) throw formsError
  if (!forms?.length) return new Map()

  const { data: entries, error: entriesError } = await supabase
    .from('opcr_entries')
    .select('item_id, section, sort_order, parent_entry_id')
    .in(
      'form_id',
      forms.map((form) => form.id),
    )
    .not('item_id', 'is', null)
  if (entriesError) throw entriesError

  const map = new Map()
  for (const entry of entries || []) {
    if (!entry.item_id || !isPrimaryOpcrEntry(entry)) continue
    const section = normalizeSection(Number(entry.section) || 1)
    const sortOrder = Number(entry.sort_order) || 0
    const rank = section * 1_000_000 + sortOrder
    const existing = map.get(entry.item_id)
    if (!existing || rank < existing.rank) {
      map.set(entry.item_id, { section, sort_order: sortOrder, rank })
    }
  }
  return map
}

function applyItemLayout(items, layoutMap) {
  return (items || []).map((item) => {
    const layout = layoutMap.get(item.id)
    const section = normalizeSection(layout?.section ?? sectionFromItem(item))
    return {
      ...item,
      section,
      sort_order: layout?.sort_order ?? (Number(item.sort_order) || 0),
      category: sectionLabel(section),
    }
  })
}

export function itemsFromOpcrEntries(entries, periodId) {
  return (entries || [])
    .filter(isPrimaryOpcrEntry)
    .map((entry) => {
      const children = (entries || []).filter((row) => row.parent_entry_id === entry.id)
      const output = String(entry.output || '').trim() || 'New row'
      const section = normalizeSection(Number(entry.section) || 1)
      return {
        id: entry.item_id || null,
        entry_id: entry.id,
        period_id: periodId,
        category: sectionLabel(section),
        output,
        success_indicator: combineSuccessIndicators([entry, ...children]),
        sort_order: Number(entry.sort_order) || 0,
        section,
        origin: 'opcr',
        pending: !entry.item_id,
      }
    })
    .sort(
      (a, b) =>
        (Number(a.section) || 1) - (Number(b.section) || 1) ||
        (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0),
    )
}

function isMissingRpc(error) {
  const message = error?.message || ''
  const code = String(error?.code || '')
  const status = Number(error?.status || error?.statusCode || 0)
  return (
    code === 'PGRST202' ||
    code === 'PGRST204' ||
    status === 404 ||
    /could not find the function|does not exist|schema cache/i.test(message)
  )
}

export async function loadCanonicalOpcrEntries(supabase, periodId) {
  if (!periodId) return []

  const { data: rpcRows, error: rpcError } = await supabase.rpc('office_opcr_template', {
    p_period_id: periodId,
  })
  let templateRows = rpcRows
  if (typeof templateRows === 'string') {
    try {
      templateRows = JSON.parse(templateRows)
    } catch {
      templateRows = []
    }
  }
  if (!rpcError && Array.isArray(templateRows) && templateRows.length) {
    return templateRows
      .map(hydrateOpcrEntry)
      .sort(
        (a, b) =>
          (Number(a.section) || 1) - (Number(b.section) || 1) ||
          (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0) ||
          String(a.parent_entry_id || '').localeCompare(String(b.parent_entry_id || '')),
      )
  }

  const { data: forms, error: formsError } = await supabase
    .from('opcr_forms')
    .select('id, user_id, created_at')
    .eq('period_id', periodId)
  if (formsError) throw formsError
  if (!forms?.length) return []

  const userIds = [...new Set(forms.map((form) => form.user_id).filter(Boolean))]
  const { data: profiles, error: profileError } = userIds.length
    ? await supabase.from('profiles').select('id, role').in('id', userIds)
    : { data: [], error: null }
  if (profileError) throw profileError

  const adminIds = new Set(
    (profiles || []).filter((row) => row.role === 'admin').map((row) => row.id),
  )

  const { data: entries, error: entriesError } = await supabase
    .from('opcr_entries')
    .select('*')
    .in(
      'form_id',
      forms.map((form) => form.id),
    )
  if (entriesError) throw entriesError

  const hydrated = (entries || []).map(hydrateOpcrEntry)
  const scoreByForm = new Map()
  for (const entry of hydrated.filter(isPrimaryOpcrEntry)) {
    const current = scoreByForm.get(entry.form_id) || { count: 0, text: 0 }
    current.count += 1
    current.text += `${entry.output || ''}${entry.success_indicator || ''}`.length
    scoreByForm.set(entry.form_id, current)
  }

  const ranked = [...forms].sort((a, b) => {
    const aAdmin = adminIds.has(a.user_id) ? 1 : 0
    const bAdmin = adminIds.has(b.user_id) ? 1 : 0
    if (bAdmin !== aAdmin) return bAdmin - aAdmin
    const aScore = scoreByForm.get(a.id) || { count: 0, text: 0 }
    const bScore = scoreByForm.get(b.id) || { count: 0, text: 0 }
    if (bScore.count !== aScore.count) return bScore.count - aScore.count
    if (bScore.text !== aScore.text) return bScore.text - aScore.text
    return String(a.created_at || '').localeCompare(String(b.created_at || ''))
  })

  const chosen = ranked.find((form) => (scoreByForm.get(form.id)?.count || 0) > 0)
  if (!chosen) return []

  return hydrated
    .filter((entry) => entry.form_id === chosen.id)
    .sort(
      (a, b) =>
        (Number(a.section) || 1) - (Number(b.section) || 1) ||
        (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0),
    )
}

export async function applyOfficeTemplate(supabase, form, _periodId) {
  if (!form?.id) return false
  const { data, error } = await supabase.rpc('apply_office_opcr_template', {
    p_form_id: form.id,
  })
  if (error) {
    if (isMissingRpc(error) || /apply_office_opcr_template|permission denied|row-level security/i.test(error.message || '')) {
      return false
    }
    throw error
  }
  return Boolean(data)
}

async function syncOfficeTemplateToOtherForms(supabase, periodId, _sourceFormId) {
  if (!periodId) return
  const { error } = await supabase.rpc('sync_all_office_opcr_templates', {
    p_period_id: periodId,
  })
  if (error && !isMissingRpc(error) && !/sync_all_office_opcr_templates|permission denied|row-level security|Only admins/i.test(error.message || '')) {
    throw error
  }
}

async function loadOpcrItemLinks(supabase, periodId, people, options = {}) {
  let formsQuery = supabase.from('opcr_forms').select('id, user_id').eq('period_id', periodId)
  if (options.userId) {
    formsQuery = formsQuery.eq('user_id', options.userId)
  }

  const { data: forms, error: formsError } = await formsQuery
  if (formsError) throw formsError
  if (!forms?.length) {
    return { refCount: new Map(), personItemByOutput: {}, itemsByOutput: new Map() }
  }

  const { data: entries, error: entriesError } = await supabase
    .from('opcr_entries')
    .select('form_id, item_id, output, parent_entry_id')
    .in(
      'form_id',
      forms.map((form) => form.id),
    )
    .not('item_id', 'is', null)
  if (entriesError) throw entriesError

  const formUser = Object.fromEntries(forms.map((form) => [form.id, form.user_id]))
  const userToStaff = Object.fromEntries(
    (people || []).filter((person) => person.user_id).map((person) => [person.user_id, person.id]),
  )

  const refCount = new Map()
  const personItemByOutput = {}
  const itemsByOutput = new Map()

  for (const entry of entries || []) {
    if (!entry.item_id || !isPrimaryOpcrEntry(entry)) continue
    const key = outputKey(entry.output)
    refCount.set(entry.item_id, (refCount.get(entry.item_id) || 0) + 1)
    if (!itemsByOutput.has(key)) itemsByOutput.set(key, new Set())
    itemsByOutput.get(key).add(entry.item_id)

    const staffId = userToStaff[formUser[entry.form_id]]
    if (!staffId) continue
    if (!personItemByOutput[staffId]) personItemByOutput[staffId] = {}
    personItemByOutput[staffId][key] = entry.item_id
  }

  return { refCount, personItemByOutput, itemsByOutput }
}

function dedupeItemsByOutput(items, refCount) {
  const groups = new Map()
  for (const item of items || []) {
    const key = outputKey(item.output)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(item)
  }

  const canonical = []
  for (const group of groups.values()) {
    const sorted = [...group].sort((a, b) => {
      if (a.origin === 'opcr' && b.origin !== 'opcr') return -1
      if (b.origin === 'opcr' && a.origin !== 'opcr') return 1
      const aText = `${a.output || ''}${a.success_indicator || ''}`.length
      const bText = `${b.output || ''}${b.success_indicator || ''}`.length
      if (bText !== aText) return bText - aText
      const aRefs = refCount.get(a.id) || 0
      const bRefs = refCount.get(b.id) || 0
      if (bRefs !== aRefs) return bRefs - aRefs
      return (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0)
    })
    canonical.push(sorted[0])
  }

  return canonical
}

function finalizeVisibleItems(items, layoutMap, links) {
  const laidOut = applyItemLayout(filterTallyItems(items, links.activeIds), layoutMap)
  return dedupeItemsByOutput(laidOut, links.refCount).sort(
    (a, b) =>
      (Number(a.section) || 1) - (Number(b.section) || 1) ||
      (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0) ||
      outputKey(a.output).localeCompare(outputKey(b.output)),
  )
}

async function loadActiveOpcrItemIds(supabase, periodId, options = {}) {
  let formsQuery = supabase.from('opcr_forms').select('id').eq('period_id', periodId)
  if (options.userId) {
    formsQuery = formsQuery.eq('user_id', options.userId)
  }

  const { data: forms, error: formsError } = await formsQuery
  if (formsError) throw formsError
  if (!forms?.length) return new Set()

  const { data: entries, error: entriesError } = await supabase
    .from('opcr_entries')
    .select('item_id, parent_entry_id')
    .in(
      'form_id',
      forms.map((form) => form.id),
    )
    .not('item_id', 'is', null)
  if (entriesError) throw entriesError

  const ids = new Set()
  for (const entry of entries || []) {
    if (!entry.item_id || !isPrimaryOpcrEntry(entry)) continue
    ids.add(entry.item_id)
  }
  return ids
}

export async function loadOpcrSyncedItems(supabase, periodId, options = {}) {
  const activeOpcrItemIds = await loadActiveOpcrItemIds(supabase, periodId, options)
  if (!activeOpcrItemIds.size) return []

  const [{ data: items, error }, layoutMap, links] = await Promise.all([
    supabase
      .from('opcr_items')
      .select('*')
      .eq('period_id', periodId)
      .in('id', [...activeOpcrItemIds])
      .order('sort_order', { ascending: true }),
    loadItemLayoutMap(supabase, periodId, options),
    loadOpcrItemLinks(supabase, periodId, [], options),
  ])
  if (error) throw error

  return finalizeVisibleItems(items || [], layoutMap, {
    activeIds: activeOpcrItemIds,
    refCount: links.refCount,
  })
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
  const isNewForm = !existing
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

  let applied = false
  try {
    applied = await applyOfficeTemplate(supabase, form, periodId)
  } catch {
    applied = false
  }
  if (!applied && isNewForm && !(entries || []).length) {
    const seedItems = (items || []).filter((item) => item.origin !== 'opcr')
    if (seedItems.length) {
      const payload = seedItems.map((item) => ({
        form_id: form.id,
        item_id: item.id,
        output: item.output || '',
        success_indicator: item.success_indicator || '',
        section: sectionForOutput(item.output),
        sort_order: item.sort_order || 0,
        actual_accomplishment: '',
        remarks: '',
      }))
      const { error: insertError } = await supabase.from('opcr_entries').insert(payload)
      if (insertError) {
        const { error: fallbackError } = await supabase.from('opcr_entries').insert(
          seedItems.map((item) => ({
            form_id: form.id,
            item_id: item.id,
            actual_accomplishment: '',
            remarks: '',
          })),
        )
        if (fallbackError) throw missingOpcrRowError(insertError)
      }
    }
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

  const sorted = (entries || [])
    .map(hydrateOpcrEntry)
    .sort((a, b) => (a.section - b.section) || (a.sort_order || 0) - (b.sort_order || 0))

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

function headerCacheKey(formId) {
  return `opcr-header:${formId}`
}

export function readHeaderCache(formId) {
  if (!formId) return null
  try {
    return JSON.parse(localStorage.getItem(headerCacheKey(formId)) || 'null')
  } catch {
    return null
  }
}

export function writeHeaderCache(formId, payload) {
  if (!formId) return
  localStorage.setItem(
    headerCacheKey(formId),
    JSON.stringify({
      title: payload.headerTitle || '',
      introLine: payload.headerIntroLine || '',
    }),
  )
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

  writeHeaderCache(formId, payload)
  const { error: headerError } = await supabase
    .from('opcr_forms')
    .update({
      header_title: payload.headerTitle || '',
      header_office_line: payload.headerIntroLine || '',
      header_commitment_line: '',
    })
    .eq('id', formId)

  if (
    headerError &&
    (headerError.message || '').match(/header_title|header_office_line|header_commitment_line/)
  ) {
    throw new Error(
      'OPCR header fields are not set up yet. Open Supabase → SQL Editor → run supabase/opcr_header.sql, then save again.',
    )
  }
  if (headerError) throw headerError

  return dateValue
}

export async function saveOpcrRows(supabase, formId, entries, removedIds = []) {
  const { data: form, error: formError } = await supabase
    .from('opcr_forms')
    .select('id, period_id')
    .eq('id', formId)
    .single()
  if (formError) throw formError

  const expandedRemoved = expandRemovedEntryIds(entries, removedIds)
  const realRemoved = expandedRemoved.filter((id) => id && !isTempEntryId(id))
  let removedItemIds = []
  if (realRemoved.length) {
    const { data: removedRows, error: lookupError } = await supabase
      .from('opcr_entries')
      .select('id, item_id')
      .eq('form_id', formId)
      .in('id', realRemoved)
    if (lookupError) throw missingOpcrRowError(lookupError)
    removedItemIds = (removedRows || []).map((row) => row.item_id).filter(Boolean)

    const { error: deleteError } = await supabase
      .from('opcr_entries')
      .delete()
      .in('id', realRemoved)
      .eq('form_id', formId)
    if (deleteError) throw missingOpcrRowError(deleteError)
  }

  const synced = await syncOpcrItemsToTally(supabase, form.period_id, entries)
  const syncedById = Object.fromEntries(synced.map((entry) => [entry.id, entry]))
  const mergedEntries = entries.map((entry) => syncedById[entry.id] || entry)

  const existing = mergedEntries.filter((entry) => !isTempEntryId(entry.id))
  const createdPrimaries = mergedEntries.filter(
    (entry) => isTempEntryId(entry.id) && isPrimaryOpcrEntry(entry),
  )
  const createdChildren = mergedEntries.filter(
    (entry) => isTempEntryId(entry.id) && !isPrimaryOpcrEntry(entry),
  )

  if (existing.length) {
    const results = await Promise.all(
      existing.map((entry) =>
        supabase.from('opcr_entries').update(entryPayload(entry)).eq('id', entry.id),
      ),
    )
    const failed = results.find((result) => result.error)
    if (failed?.error) throw missingOpcrRowError(failed.error)
  }

  const idMap = {}
  if (createdPrimaries.length) {
    const { data, error: insertError } = await supabase
      .from('opcr_entries')
      .insert(
        createdPrimaries.map((entry) => ({
          form_id: formId,
          ...entryPayload(entry),
        })),
      )
      .select('id')
    if (insertError) throw missingOpcrRowError(insertError)
    createdPrimaries.forEach((entry, index) => {
      idMap[entry.id] = data[index]?.id
    })
  }

  if (createdChildren.length) {
    const { error: childInsertError } = await supabase.from('opcr_entries').insert(
      createdChildren.map((entry) => ({
        form_id: formId,
        ...entryPayload({
          ...entry,
          parent_entry_id: resolveParentEntryId(entry.parent_entry_id, idMap),
        }),
      })),
    )
    if (childInsertError) throw missingOpcrRowError(childInsertError)
  }

  for (const itemId of removedItemIds) {
    await cleanupRemovedOpcrItems(supabase, formId, [itemId])
  }

  clearBoardCache()

  await syncOfficeTemplateToOtherForms(supabase, form.period_id, formId)

  const bundle = await loadFormBundle(supabase, formId)
  return bundle.entries
}

export async function saveEntries(supabase, entries) {
  return saveOpcrRows(supabase, entries[0]?.form_id, entries, [])
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
  return missingSemesterError(error)
}

export function missingSemesterError(error) {
  const message = error?.message || ''
  if (message.includes('opcr_tallies_semester_check') || message.includes('semester_check')) {
    return new Error(
      'Tally semester is out of date. Open Supabase → SQL Editor → run supabase/fix_tally_semester.sql, then refresh this page.',
    )
  }
  return error
}

export async function loadTallyContext(supabase, options = {}) {
  const period = await getActivePeriod(supabase)
  if (!period) {
    return { period: null, items: [], people: [], staff: null, tallies: [], personItemByOutput: {} }
  }

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

  const [
    { data: items, error: itemsError },
    { data: people, error: peopleError },
    { data: tallies, error: talliesError },
    activeOpcrItemIds,
    layoutMap,
    canonicalEntries,
  ] = await Promise.all([
    itemsQuery,
    peopleQuery,
    talliesQuery,
    loadActiveOpcrItemIds(supabase, period.id, options),
    loadItemLayoutMap(supabase, period.id, options),
    loadCanonicalOpcrEntries(supabase, period.id),
  ])

  if (itemsError) throw itemsError
  if (peopleError) throw rosterSetupError(peopleError)
  if (talliesError) throw rosterSetupError(talliesError)

  const linkPeople = options.includePeople
    ? people || []
    : linkedStaff
      ? [linkedStaff]
      : []
  const links = await loadOpcrItemLinks(supabase, period.id, linkPeople, options)

  const visibleItems = canonicalEntries.length
    ? itemsFromOpcrEntries(canonicalEntries, period.id)
    : finalizeVisibleItems(items || [], layoutMap, {
        activeIds: activeOpcrItemIds,
        refCount: links.refCount,
      })

  return {
    period,
    items: visibleItems,
    people: people || [],
    staff: linkedStaff,
    tallies: normalizeTallies(tallies || []),
    personItemByOutput: links.personItemByOutput,
  }
}

export function buildBoardRows(people, items, tallies, personItemByOutput = {}) {
  const indexed = indexTallies(tallies)
  const nextRows = {}
  for (const person of people || []) {
    const outputs = personItemByOutput[person.id] || {}
    for (const item of items || []) {
      const boardKey = tallyKey(person.id, item.id, TALLY_PERIOD_ID)
      const personItemId = outputs[outputKey(item.output)] || item.id
      const personTally = indexed[tallyKey(person.id, personItemId, TALLY_PERIOD_ID)]
      const boardTally =
        item.id !== personItemId ? indexed[tallyKey(person.id, item.id, TALLY_PERIOD_ID)] : null
      const target = toCount(personTally?.target) || toCount(boardTally?.target)
      const accomplished = Math.max(
        toCount(personTally?.accomplished),
        toCount(boardTally?.accomplished),
      )
      nextRows[boardKey] = {
        staff_id: person.id,
        user_id: person.user_id || null,
        item_id: personItemId,
        semester: TALLY_PERIOD_ID,
        target: target ? String(target) : '',
        accomplished: accomplished ? String(accomplished) : '',
      }
    }
  }
  return nextRows
}

export function indexTallies(tallies) {
  const map = {}
  for (const tally of normalizeTallies(tallies)) {
    const personId = tally.staff_id || tally.user_id
    map[tallyKey(personId, tally.item_id, TALLY_PERIOD_ID)] = tally
  }
  return map
}

export function normalizeTallies(tallies) {
  const merged = new Map()
  for (const tally of tallies || []) {
    const personId = tally.staff_id || tally.user_id
    if (!personId || !tally.item_id) continue
    const mergeKey = `${personId}:${tally.item_id}`
    const existing = merged.get(mergeKey)
    if (!existing) {
      merged.set(mergeKey, {
        ...tally,
        semester: TALLY_PERIOD_ID,
        target: toCount(tally.target),
        accomplished: toCount(tally.accomplished),
      })
      continue
    }
    existing.target = toCount(existing.target) + toCount(tally.target)
    existing.accomplished = toCount(existing.accomplished) + toCount(tally.accomplished)
  }
  return [...merged.values()]
}

const BOARD_CACHE_KEY = 'opcr-tally-board'
const MY_TALLY_CACHE_KEY = 'opcr-my-tally'
const MY_OPCR_CACHE_KEY = 'opcr-my-form'

export function readBoardCache() {
  try {
    const raw = sessionStorage.getItem(BOARD_CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (parsed?.cacheVersion !== TALLY_CACHE_VERSION) return null
    if (!parsed?.period || !Array.isArray(parsed.items) || !Array.isArray(parsed.people)) return null
    return parsed
  } catch {
    return null
  }
}

export function writeBoardCache(snapshot) {
  try {
    sessionStorage.setItem(
      BOARD_CACHE_KEY,
      JSON.stringify({ ...snapshot, cacheVersion: TALLY_CACHE_VERSION }),
    )
  } catch {
    // Ignore quota / private-mode failures.
  }
}

export function clearBoardCache() {
  try {
    sessionStorage.removeItem(BOARD_CACHE_KEY)
    sessionStorage.removeItem(MY_TALLY_CACHE_KEY)
    sessionStorage.removeItem(MY_OPCR_CACHE_KEY)
    sessionStorage.removeItem('opcr-daily-log')
  } catch {
    // Ignore private-mode failures.
  }
}

export function readMyOpcrCache(userId) {
  if (!userId) return null
  try {
    const raw = sessionStorage.getItem(MY_OPCR_CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || parsed.userId !== userId) return null
    if (parsed.cacheVersion !== TALLY_CACHE_VERSION) return null
    if (!parsed.period || !parsed.form) return null
    return parsed
  } catch {
    return null
  }
}

export function writeMyOpcrCache(snapshot) {
  if (!snapshot?.userId) return
  try {
    sessionStorage.setItem(
      MY_OPCR_CACHE_KEY,
      JSON.stringify({ ...snapshot, cacheVersion: TALLY_CACHE_VERSION }),
    )
  } catch {
    // Ignore quota / private-mode failures.
  }
}

export function patchBoardCacheRow(tally) {
  const cached = readBoardCache()
  if (!cached?.period || cached.period.id !== tally.period_id) return cached
  const personId = tally.staff_id || tally.user_id
  if (!personId) return cached
  const key = tallyKey(personId, tally.item_id, TALLY_PERIOD_ID)
  const existing = cached.rows?.[key] || {
    staff_id: personId,
    user_id: tally.user_id || null,
    item_id: tally.item_id,
    semester: TALLY_PERIOD_ID,
    target: '',
    accomplished: '',
  }
  cached.rows = {
    ...(cached.rows || {}),
    [key]: {
      ...existing,
      semester: TALLY_PERIOD_ID,
      target: String(toCount(tally.target ?? existing.target)),
      accomplished: String(toCount(tally.accomplished ?? existing.accomplished)),
    },
  }
  writeBoardCache(cached)
  return cached
}

export function readMyTallyCache(userId) {
  try {
    const raw = sessionStorage.getItem(MY_TALLY_CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || parsed.userId !== userId) return null
    if (parsed.cacheVersion !== TALLY_CACHE_VERSION) return null
    return parsed
  } catch {
    return null
  }
}

export function writeMyTallyCache(snapshot) {
  try {
    sessionStorage.setItem(
      MY_TALLY_CACHE_KEY,
      JSON.stringify({ ...snapshot, cacheVersion: TALLY_CACHE_VERSION }),
    )
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
    semester: TALLY_PERIOD_ID,
    accomplished: toCount(row.accomplished),
  }))

  const { error } = await supabase.from('opcr_tallies').upsert(payload, {
    onConflict: 'period_id,staff_id,item_id,semester',
  })
  if (error) throw missingSemesterError(error)

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
    semester: TALLY_PERIOD_ID,
    target: toCount(row.target),
    accomplished: toCount(row.accomplished),
  }))

  const { error } = await supabase.from('opcr_tallies').upsert(payload, {
    onConflict: 'period_id,staff_id,item_id,semester',
  })
  if (error) throw missingSemesterError(error)

  if (readBoardCache()?.period?.id === periodId) {
    for (const row of payload) {
      patchBoardCacheRow({ ...row, period_id: periodId })
    }
  }
}

