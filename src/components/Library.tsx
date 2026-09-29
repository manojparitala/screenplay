import {
  Archive,
  ArchiveRestore,
  BookOpen,
  ChartColumn,
  Clapperboard,
  Copy,
  Download,
  EllipsisVertical,
  FileDown,
  FilePlus,
  FolderOpen,
  LayoutGrid,
  MapPin,
  MonitorDown,
  Moon,
  Route,
  ShieldCheck,
  Sparkles,
  Sun,
  Trash,
  Upload,
  Users,
} from 'lucide-react'
import { useEffect, useReducer, useRef, useState, type DragEvent } from 'react'
import { projectTitle, safeFileName, serializeProject } from '../core/project'
import type { Project } from '../core/types'
import { useApp } from '../store/app'
import { fileAccessSupported } from '../store/files'
import { canInstall, install, onInstallChange } from '../store/offline'
import { backupAll, backupReminderDue, lastBackupAt, snoozeBackupReminder } from './backup'
import { saveFile } from './save'
import { Menu, Modal, timeAgo } from './ui'

const ACCEPT = '.fountain,.spmd,.txt,.fdx,.pdf,.json,.md,.zip'

/** Offered where the browser can install the app (Chrome and Edge), until it is installed. */
function InstallButton() {
  const [, refresh] = useReducer((n: number) => n + 1, 0)
  useEffect(() => onInstallChange(refresh), [])
  if (!canInstall()) return null
  return (
    <button
      className="btn small ghost"
      onClick={() => void install()}
      title="Install Screenplay on this device: it opens in its own window, from the dock, taskbar or home screen, and works offline"
    >
      <MonitorDown size={15} /> Install app
    </button>
  )
}

const FEATURES = [
  { icon: Clapperboard, title: 'Industry-standard formatting', text: 'Scene headings, action, character, parenthetical, dialogue and transitions laid out in Courier on real page margins. Enter and Tab move between elements for you.' },
  { icon: Sparkles, title: 'Smart typing', text: 'Autocompletes character names, locations and times of day. Adds (MORE) and (CONT’D) automatically, and shows page breaks as you write.' },
  { icon: LayoutGrid, title: 'Index cards & outline', text: 'Plan on a corkboard. Drag cards to reorder scenes in the script, colour-code storylines and write a synopsis for each scene.' },
  { icon: Route, title: 'Beat sheets', text: 'Save the Cat!, Three-Act, Hero’s Journey and Story Circle templates. Each beat shows the page it should land on.' },
  { icon: Users, title: 'Characters & locations', text: 'Character bios, wants, needs and arcs. Chart each character’s journey through scenes and places, and rename anyone everywhere in one step.' },
  { icon: ChartColumn, title: 'Reports', text: 'Page count, runtime, scene lengths in eighths, dialogue share per character, INT/EXT and day/night breakdowns.' },
  { icon: FileDown, title: 'Import & export', text: 'Fountain, Final Draft (.fdx) and PDF with a title page. Automatic snapshots and one-click backups keep earlier drafts safe.' },
  { icon: BookOpen, title: 'Private & offline', text: 'Your scripts are saved in this browser, on this device. Nothing is uploaded to a server.' },
]

export function Library() {
  const projects = useApp((s) => s.projects)
  const { newProject, openProject, importFile, openFile, restoreBackup, duplicateProject, deleteProject, setPrefs } = useApp.getState()
  const files = fileAccessSupported()
  const theme = useApp((s) => s.prefs.theme)
  const fileRef = useRef<HTMLInputElement>(null)
  const restoreRef = useRef<HTMLInputElement>(null)
  const [confirm, setConfirm] = useState<Project | null>(null)
  const [dragging, setDragging] = useState(false)
  const [lastBackup, setLastBackup] = useState(lastBackupAt)
  const [snoozed, setSnoozed] = useState(false)
  const remind = !snoozed && projects.length > 0 && backupReminderDue(Math.max(...projects.map((p) => p.updatedAt)))

  const backUp = async () => {
    if (await backupAll()) setLastBackup(lastBackupAt())
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) void importFile(file)
  }

  const isDark = theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)

  return (
    <>
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">
            <Clapperboard size={16} />
          </span>
          <span className="brand-name">Screenplay</span>
        </div>
        <div className="tabs" />
        <div className="topbar-actions">
          <InstallButton />
          <button className="icon-btn" onClick={() => setPrefs({ theme: isDark ? 'light' : 'dark' })} aria-label="Toggle dark mode" title="Toggle dark mode">
            {isDark ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        </div>
      </header>
      <main
        className="library"
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        style={dragging ? { outline: '3px dashed var(--accent)', outlineOffset: -12 } : undefined}
      >
        <div className="view-inner">
          <div className="library-hero">
            <div>
              <h1>Your screenplays</h1>
              <p>Write, outline and format scripts to industry standard. Drop a PDF, Fountain, Final Draft or backup file here to import it.</p>
            </div>
            <div className="library-actions">
              {files && (
                <button className="btn" onClick={() => void openFile()} title="Open a script you saved to a file on this computer, and keep saving to it">
                  <FolderOpen size={16} /> Open file…
                </button>
              )}
              <button className="btn" onClick={() => fileRef.current?.click()}>
                <Upload size={16} /> Import
              </button>
              <button className="btn" onClick={() => void newProject('sample')}>
                <Sparkles size={16} /> Open sample script
              </button>
              <button className="btn primary" onClick={() => void newProject('blank')}>
                <FilePlus size={16} /> New screenplay
              </button>
              <input
                ref={fileRef}
                type="file"
                accept={ACCEPT}
                hidden
                aria-label="File to import"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) void importFile(f)
                  e.target.value = ''
                }}
              />
            </div>
          </div>

          {remind && (
            <div className="backup-reminder" role="status">
              <ShieldCheck size={18} />
              <p>
                {lastBackup ? `Your last backup was ${timeAgo(lastBackup)}.` : 'You haven’t backed up your scripts yet.'} They are kept in this browser, so a backup keeps
                them safe if its data is ever cleared.
              </p>
              <button className="btn primary small" onClick={() => void backUp()}>
                Back up now
              </button>
              <button
                className="btn ghost small"
                onClick={() => {
                  snoozeBackupReminder()
                  setSnoozed(true)
                }}
              >
                Remind me later
              </button>
            </div>
          )}

          <div className="library-grid">
            {projects.map((p) => (
              <div key={p.id} style={{ position: 'relative' }}>
                <button className="script-card" style={{ width: '100%' }} onClick={() => void openProject(p.id)}>
                  <div className="script-card-cover">
                    <strong>{projectTitle(p)}</strong>
                    {p.titlePage.author && <span>by {p.titlePage.author}</span>}
                  </div>
                  <div className="script-card-body">
                    <span style={{ fontWeight: 600 }}>{projectTitle(p)}</span>
                    <span className="meta">
                      {p.stats ? `${p.stats.pages} page${p.stats.pages === 1 ? '' : 's'} · ${p.stats.scenes} scene${p.stats.scenes === 1 ? '' : 's'} · ` : ''}
                      edited {timeAgo(p.updatedAt)}
                    </span>
                  </div>
                </button>
                <div className="script-card-menu">
                  <Menu
                    trigger={(_open, toggle) => (
                      <button className="icon-btn small" onClick={toggle} aria-label={`More actions for ${projectTitle(p)}`} style={{ background: 'var(--surface)' }}>
                        <EllipsisVertical size={16} />
                      </button>
                    )}
                  >
                    {(close) => (
                      <>
                        <button
                          className="menu-item"
                          onClick={() => {
                            close()
                            void duplicateProject(p.id)
                          }}
                        >
                          <Copy size={16} /> Duplicate
                        </button>
                        <button
                          className="menu-item"
                          onClick={() => {
                            close()
                            void saveFile(`${safeFileName(projectTitle(p))}.screenplay.json`, serializeProject(p), 'application/json')
                          }}
                        >
                          <Download size={16} /> Download backup
                        </button>
                        <div className="menu-sep" />
                        <button
                          className="menu-item"
                          style={{ color: 'var(--danger)' }}
                          onClick={() => {
                            close()
                            setConfirm(p)
                          }}
                        >
                          <Trash size={16} /> Delete…
                        </button>
                      </>
                    )}
                  </Menu>
                </div>
              </div>
            ))}
            <button className="new-card" onClick={() => void newProject('blank')}>
              <FilePlus size={28} />
              <span>New screenplay</span>
            </button>
          </div>

          <section className="backup-panel panel" aria-labelledby="backups-title">
            <div>
              <h2 id="backups-title">
                <ShieldCheck size={16} color="var(--accent)" /> Backups
              </h2>
              <p>
                One file with every script and its snapshots, to keep somewhere safe or move to another computer.{' '}
                {lastBackup ? `Last backup ${timeAgo(lastBackup)}.` : 'No backup yet.'} Snapshots are also kept automatically as you write.
              </p>
            </div>
            <div className="library-actions">
              <button className="btn" onClick={() => void backUp()} disabled={!projects.length}>
                <Archive size={16} /> Back up all scripts
              </button>
              <button className="btn" onClick={() => restoreRef.current?.click()}>
                <ArchiveRestore size={16} /> Restore from backup…
              </button>
              <input
                ref={restoreRef}
                type="file"
                accept=".zip,.json"
                hidden
                aria-label="Backup file to restore"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) void restoreBackup(f)
                  e.target.value = ''
                }}
              />
            </div>
          </section>

          <div className="feature-list">
            {FEATURES.map((f) => (
              <div className="feature" key={f.title}>
                <strong>
                  <f.icon size={16} color="var(--accent)" /> {f.title}
                </strong>
                <p>{f.text}</p>
              </div>
            ))}
          </div>
          <p className="faint" style={{ marginTop: 24, fontSize: 12.5 }}>
            <MapPin size={12} style={{ verticalAlign: -1 }} />{' '}
            {files
              ? 'Scripts are stored in this browser. To keep one in a file on your computer as well, open it and choose “Save to file”.'
              : 'Scripts are stored in this browser only. Use “Back up all scripts” regularly to keep a copy elsewhere.'}
          </p>
        </div>
      </main>
      {confirm && (
        <Modal
          title="Delete screenplay?"
          onClose={() => setConfirm(null)}
          footer={
            <>
              <button className="btn" onClick={() => setConfirm(null)}>
                Cancel
              </button>
              <button
                className="btn primary"
                style={{ background: 'var(--danger)', borderColor: 'var(--danger)', color: '#fff' }}
                onClick={() => {
                  void deleteProject(confirm.id)
                  setConfirm(null)
                }}
              >
                Delete
              </button>
            </>
          }
        >
          <p style={{ margin: 0 }}>
            “{projectTitle(confirm)}” and all of its snapshots will be permanently deleted from this browser. Download a backup first if you might need it.
          </p>
        </Modal>
      )}
    </>
  )
}
