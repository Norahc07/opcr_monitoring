import { useEffect, useMemo, useState } from 'react'
import { Pencil, Plus, Trash2, X } from 'lucide-react'
import { useAuth } from '../context/useAuth'
import { supabase } from '../lib/supabase'
import { writeAudit } from '../lib/audit'
import { Alert, Avatar, Button, LoadingState, PageHeader, Toast, useToast } from '../components/ui'

const emptyStaff = {
  email: '',
  password: '',
  full_name: '',
  short_name: '',
  position: '',
  office: 'E-Learning Ville',
  role: 'staff',
}

function Modal({ title, children, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/40"
        aria-label="Close"
        onClick={onClose}
      />
      <div className="card relative z-10 w-full max-w-lg p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-1.5 text-slate-500 hover:bg-slate-100"
          >
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-500">{label}</span>
      {children}
    </label>
  )
}

export default function Users() {
  const { user } = useAuth()
  const { toast, toastPhase, showToast, clearToast } = useToast()
  const [staffs, setStaffs] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [modal, setModal] = useState(null)
  const [confirm, setConfirm] = useState(null)

  async function load() {
    const [
      { data: staffRows, error: staffError },
      { data: loginRows, error: loginError },
      { data: profileRows, error: profileError },
    ] = await Promise.all([
      supabase
        .from('office_staff')
        .select('*')
        .not('user_id', 'is', null)
        .order('sort_order', { ascending: true }),
      supabase.rpc('admin_list_logins'),
      supabase.from('profiles').select('id, avatar_url, office'),
    ])
    if (staffError) throw staffError
    if (profileError) throw profileError

    let logins = loginRows || []
    if (loginError) {
      logins = profileRows || []
      if (loginError.message?.includes('admin_list_logins') || loginError.code === 'PGRST202') {
        setError(
          'Staff create/delete is not set up yet. Run supabase/staffs.sql in the Supabase SQL editor, then refresh this page.',
        )
      } else {
        throw loginError
      }
    }

    const emailById = new Map(logins.map((row) => [row.id, row.email || '']))
    const officeById = new Map(
      (profileRows || []).map((row) => [row.id, row.office || '']).concat(
        logins.map((row) => [row.id, row.office || '']),
      ),
    )
    const photoById = new Map((profileRows || []).map((row) => [row.id, row.avatar_url || '']))
    setStaffs(
      (staffRows || []).map((row) => ({
        ...row,
        email: emailById.get(row.user_id) || '',
        office: officeById.get(row.user_id) || 'E-Learning Ville',
        avatar_url: photoById.get(row.user_id) || '',
      })),
    )
  }

  useEffect(() => {
    let active = true
    async function start() {
      try {
        await load()
      } catch (err) {
        if (active) setError(err.message)
      } finally {
        if (active) setLoading(false)
      }
    }
    start()
    return () => {
      active = false
    }
  }, [])

  const editingId = modal?.user_id || null

  async function saveStaff(form) {
    setBusy('save')
    setError('')
    clearToast()
    try {
      if (form.user_id) {
        const { error: saveError } = await supabase
          .from('profiles')
          .update({
            full_name: form.full_name.trim(),
            short_name: form.short_name.trim().toUpperCase(),
            position: form.position.trim(),
            office: form.office.trim() || 'E-Learning Ville',
            role: form.role,
          })
          .eq('id', form.user_id)
        if (saveError) throw saveError
        await writeAudit(
          supabase,
          'Updated staff',
          'Users',
          `${form.full_name.trim() || 'Staff'} · ${form.role}`,
        )
        showToast(`Updated ${form.full_name || 'staff'}.`)
      } else {
        const { error: createError } = await supabase.rpc('admin_create_login', {
          p_email: form.email.trim(),
          p_password: form.password,
          p_full_name: form.full_name.trim(),
          p_short_name: form.short_name.trim().toUpperCase(),
          p_position: form.position.trim(),
          p_office: form.office.trim() || 'E-Learning Ville',
          p_role: form.role,
        })
        if (createError) throw createError
        await writeAudit(
          supabase,
          'Created staff',
          'Users',
          `${form.email.trim()} · ${form.full_name.trim() || 'Staff'} · ${form.role}`,
        )
        showToast(`Created staff account for ${form.email.trim()}.`)
      }
      setModal(null)
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy('')
    }
  }

  async function deleteStaff(row) {
    setBusy('delete')
    setError('')
    clearToast()
    try {
      const { error: deleteError } = await supabase.rpc('admin_delete_login', {
        p_user_id: row.user_id,
      })
      if (deleteError) throw deleteError
      await writeAudit(
        supabase,
        'Deleted staff',
        'Users',
        `${row.email || row.full_name || 'Staff'}`,
      )
      setConfirm(null)
      showToast(`Removed ${row.email || row.full_name}.`)
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy('')
    }
  }

  const sorted = useMemo(
    () =>
      [...staffs].sort((a, b) => {
        if (a.role === 'admin' && b.role !== 'admin') return -1
        if (a.role !== 'admin' && b.role === 'admin') return 1
        return (a.sort_order || 0) - (b.sort_order || 0)
      }),
    [staffs],
  )

  if (loading) return <LoadingState label="Loading staffs…" />

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Accounts"
        title="Users"
        description="Staffs with a real login appear here and as columns on the tally board, including admin."
        actions={
          <Button onClick={() => setModal({ ...emptyStaff })}>
            <Plus size={16} />
            Add staff
          </Button>
        }
      />

      {error && <Alert tone="danger">{error}</Alert>}

      <Alert>
        Create the account in Supabase Authentication, then run <strong>supabase/staffs.sql</strong>{' '}
        in the SQL editor — or add them here. Only people with a login are listed.
      </Alert>

      <section className="card overflow-hidden">
        <div className="border-b border-slate-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-900">Staffs</h2>
          <p className="text-xs text-slate-500">Official staff accounts used on the tally board.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-slate-50 text-xs tracking-wide text-slate-500 uppercase">
              <tr>
                <th className="px-4 py-3 font-semibold">Name</th>
                <th className="px-4 py-3 font-semibold">Email</th>
                <th className="px-4 py-3 font-semibold">Position</th>
                <th className="px-4 py-3 font-semibold">Role</th>
                <th className="px-4 py-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-slate-500">
                    No staff accounts yet. Add staff here, or create users in Supabase and run
                    supabase/staffs.sql.
                  </td>
                </tr>
              )}
              {sorted.map((row) => (
                <tr key={row.id} className="border-t border-slate-100">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Avatar
                        name={row.full_name || row.short_name || 'Staff'}
                        src={row.avatar_url || ''}
                        size="sm"
                      />
                      <div>
                        <p className="font-semibold text-slate-900">
                          {row.short_name || row.full_name}
                        </p>
                        <p className="text-xs text-slate-500">{row.full_name}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{row.email || '—'}</td>
                  <td className="px-4 py-3 text-slate-600">{row.position || '—'}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {row.role === 'admin' ? 'Admin' : 'Staff'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="secondary"
                        className="px-3 py-2"
                        onClick={() =>
                          setModal({
                            ...emptyStaff,
                            ...row,
                            password: '',
                          })
                        }
                      >
                        <Pencil size={14} />
                        Edit
                      </Button>
                      <Button
                        variant="danger"
                        className="px-3 py-2"
                        disabled={row.user_id === user?.id}
                        onClick={() =>
                          setConfirm({
                            title: 'Remove staff?',
                            body: `This deletes the login for ${row.email || row.full_name} and removes them from the tally board.`,
                            onConfirm: () => deleteStaff(row),
                          })
                        }
                      >
                        <Trash2 size={14} />
                        Delete
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {modal && (
        <Modal title={editingId ? 'Edit staff' : 'Add staff'} onClose={() => setModal(null)}>
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault()
              saveStaff(modal)
            }}
          >
            {!editingId && (
              <>
                <Field label="Email">
                  <input
                    type="email"
                    required
                    className="field"
                    value={modal.email}
                    onChange={(event) => setModal({ ...modal, email: event.target.value })}
                    placeholder="staff@example.com"
                  />
                </Field>
                <Field label="Password">
                  <input
                    type="text"
                    required
                    minLength={6}
                    className="field"
                    value={modal.password}
                    onChange={(event) => setModal({ ...modal, password: event.target.value })}
                    placeholder="At least 6 characters"
                  />
                </Field>
              </>
            )}
            <Field label="Full name">
              <input
                className="field"
                required
                value={modal.full_name || ''}
                onChange={(event) => setModal({ ...modal, full_name: event.target.value })}
                placeholder="e.g. Conchita Marta Mirabueno"
              />
            </Field>
            <Field label="Short name">
              <input
                className="field uppercase"
                value={modal.short_name || ''}
                onChange={(event) => setModal({ ...modal, short_name: event.target.value })}
                placeholder="e.g. BAL"
              />
            </Field>
            <Field label="Position">
              <input
                className="field"
                value={modal.position || ''}
                onChange={(event) => setModal({ ...modal, position: event.target.value })}
                placeholder="e.g. Knowledge Worker"
              />
            </Field>
            <Field label="Office">
              <input
                className="field"
                value={modal.office || ''}
                onChange={(event) => setModal({ ...modal, office: event.target.value })}
                placeholder="E-Learning Ville"
              />
            </Field>
            <Field label="Role">
              <select
                className="field"
                value={modal.role || 'staff'}
                onChange={(event) => setModal({ ...modal, role: event.target.value })}
              >
                <option value="staff">Staff</option>
                <option value="admin">Admin / Head / Manager</option>
              </select>
            </Field>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={() => setModal(null)}>
                Cancel
              </Button>
              <Button disabled={busy === 'save'} type="submit">
                {busy === 'save' ? 'Saving…' : editingId ? 'Save changes' : 'Create staff'}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {confirm && (
        <Modal title={confirm.title} onClose={() => setConfirm(null)}>
          <p className="text-sm leading-6 text-slate-600">{confirm.body}</p>
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setConfirm(null)}>
              Cancel
            </Button>
            <Button variant="danger" disabled={busy === 'delete'} onClick={confirm.onConfirm}>
              {busy === 'delete' ? 'Deleting…' : 'Delete'}
            </Button>
          </div>
        </Modal>
      )}
      <Toast message={toast} phase={toastPhase} />
    </div>
  )
}
