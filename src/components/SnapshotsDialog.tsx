import { Download, RotateCcw, Trash } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { toFountain } from '../core/fountain'
import { safeFileName } from '../core/project'
import type { Snapshot } from '../core/types'
import { useApp } from '../store/app'
import * as db from '../store/db'
import { useProject } from '../store/hooks'
import { saveFile } from './save'
import { Modal, timeAgo } from './ui'

export function SnapshotsDialog({ onClose }: { onClose: () => void }) {
  const project = useProject()
  const { createSnapshot, restoreSnapshot } = useApp.getState()
  const [snaps, setSnaps] = useState<Snapshot[] | null>(null)
  const [name, setName] = useState('')
  const [confirm, setConfirm] = useState<Snapshot | null>(null)

  const load = useCallback(async () => setSnaps(await db.listSnapshots(project.id)), [project.id])
  useEffect(() => {
    void load()
  }, [load])

  return (
    <Modal title="Snapshots" onClose={onClose} wide>
      <p className="muted" style={{ margin: 0 }}>
        A snapshot is a saved copy of the script at a moment in time — save one before a big rewrite, or at the end of each draft. Restoring a snapshot first saves the current version, so nothing is lost.
      </p>
      <form
        style={{ display: 'flex', gap: 8 }}
        onSubmit={async (e) => {
          e.preventDefault()
          await createSnapshot(name || `Snapshot – ${new Date().toLocaleString()}`)
          setName('')
          void load()
        }}
      >
        <input className="input" placeholder="Name, e.g. “First draft” or “Before Act 2 rewrite”" value={name} onChange={(e) => setName(e.target.value)} aria-label="Snapshot name" />
        <button className="btn primary" type="submit">
          Save snapshot
        </button>
      </form>
      {snaps === null ? null : snaps.length === 0 ? (
        <p className="faint" style={{ margin: 0 }}>
          No snapshots yet.
        </p>
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Name</th>
                <th>Saved</th>
                <th className="num">Pages</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {snaps.map((s) => (
                <tr key={s.id}>
                  <td style={{ fontWeight: 600 }}>{s.name}</td>
                  <td className="muted" title={new Date(s.createdAt).toLocaleString()}>
                    {timeAgo(s.createdAt)}
                  </td>
                  <td className="num">{s.pages}</td>
                  <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                    <button className="btn small" onClick={() => setConfirm(s)}>
                      <RotateCcw size={14} /> Restore
                    </button>{' '}
                    <button
                      className="icon-btn small"
                      aria-label="Download as Fountain"
                      title="Download as Fountain"
                      onClick={() => void saveFile(`${safeFileName(s.name)}.fountain`, toFountain(s.script, s.titlePage))}
                    >
                      <Download size={15} />
                    </button>
                    <button
                      className="icon-btn small"
                      aria-label="Delete snapshot"
                      title="Delete snapshot"
                      onClick={async () => {
                        await db.deleteSnapshot(s.id)
                        void load()
                      }}
                    >
                      <Trash size={15} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {confirm && (
        <div className="panel" style={{ padding: 14, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', background: 'var(--accent-soft)' }}>
          <span style={{ flex: 1, minWidth: 220 }}>
            Replace the current script with “{confirm.name}”? The current version is saved as a snapshot first.
          </span>
          <button className="btn" onClick={() => setConfirm(null)}>
            Cancel
          </button>
          <button
            className="btn primary"
            onClick={async () => {
              await restoreSnapshot(confirm)
              setConfirm(null)
              onClose()
            }}
          >
            Restore
          </button>
        </div>
      )}
    </Modal>
  )
}
