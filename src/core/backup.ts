import { toFountain } from './fountain'
import { projectTitle, safeFileName, serializeProject } from './project'
import type { Project, ScriptElement, Snapshot, TitlePage } from './types'
import type { ZipEntry } from './zip'

/* ------------------------------------------------------------------ */
/* Automatic snapshots                                                 */
/* ------------------------------------------------------------------ */

/** At most how often the app keeps an automatic snapshot while the writer works. */
export const AUTO_SNAPSHOT_EVERY = 10 * 60_000

const HOUR = 3_600_000
const DAY = 24 * HOUR

/** How many of the newest automatic snapshots are kept however old they are. */
const ALWAYS_KEEP = 3

/**
 * The automatic snapshots to let go, keeping fewer the older they get: every
 * one from the last hour, the newest of each hour for a day, and the newest of
 * each day for a month. The three newest are kept whatever their age, so a
 * script left alone for a while still has its history.
 */
export function autoSnapshotsToDrop(snaps: Pick<Snapshot, 'id' | 'createdAt'>[], now: number): string[] {
  const seen = new Set<string>()
  const drop: string[] = []
  ;[...snaps]
    .sort((a, b) => b.createdAt - a.createdAt)
    .forEach((s, i) => {
      const age = now - s.createdAt
      const d = new Date(s.createdAt)
      const day = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
      const bucket = age < DAY ? `${day} ${d.getHours()}h` : age < 31 * DAY ? day : null
      const keep = i < ALWAYS_KEEP || age < HOUR || (bucket !== null && !seen.has(bucket))
      if (bucket) seen.add(bucket)
      if (!keep) drop.push(s.id)
    })
  return drop
}

type Content = { script: ScriptElement[]; titlePage: TitlePage }

export function sameContent(a: Content, b: Content): boolean {
  return JSON.stringify(a.script) === JSON.stringify(b.script) && JSON.stringify(a.titlePage) === JSON.stringify(b.titlePage)
}

/** Whether a script has any words in it (a new, empty one isn't worth a snapshot). */
export function hasWords(script: ScriptElement[]): boolean {
  return script.some((e) => e.runs.some((r) => r.text.trim()))
}

/* ------------------------------------------------------------------ */
/* Backing up the whole library                                        */
/* ------------------------------------------------------------------ */

export interface BackupItem {
  project: Project
  snapshots: Snapshot[]
}

const pad = (n: number) => String(n).padStart(2, '0')

export function backupFileName(now: Date): string {
  return `Screenplay backup ${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.zip`
}

/** Files of a backup that hold scripts (skipping the extra files macOS adds when it zips a folder). */
export function isBackupScript(name: string): boolean {
  return /\.screenplay\.json$/i.test(name) && !/(^|\/)(__MACOSX\/|\._)/.test(name)
}

/**
 * The files in a backup of the library: each script in full, with its
 * snapshots, to restore from, and as Fountain, which other apps and any text
 * editor can open.
 */
export function backupEntries(items: BackupItem[], now = new Date()): ZipEntry[] {
  const enc = new TextEncoder()
  const used = new Set<string>()
  const entries: ZipEntry[] = [{ name: 'README.txt', data: enc.encode(readme(items.length, now)), date: now }]
  for (const { project, snapshots } of items) {
    const base = safeFileName(projectTitle(project))
    let name = base
    for (let n = 2; used.has(name.toLowerCase()); n++) name = `${base} (${n})`
    used.add(name.toLowerCase())
    const date = new Date(project.updatedAt)
    entries.push({ name: `${name}.screenplay.json`, data: enc.encode(serializeProject(project, snapshots)), date })
    entries.push({ name: `${name}.fountain`, data: enc.encode(toFountain(project.script, project.titlePage)), date })
  }
  return entries
}

function readme(count: number, now: Date): string {
  return [
    `Screenplay backup, ${now.toLocaleString()}`,
    '',
    `${count} script${count === 1 ? '' : 's'}, each in two files:`,
    '',
    '  NAME.screenplay.json  The whole script, with its notes, characters, beats and snapshots.',
    '                        To restore, choose “Restore from backup…” in the Screenplay library',
    '                        and pick this zip file.',
    '',
    '  NAME.fountain         The script as plain text in the Fountain format, which most',
    '                        screenwriting apps and any text editor can open.',
    '',
  ].join('\n')
}

/* ------------------------------------------------------------------ */
/* Reminding the writer                                                */
/* ------------------------------------------------------------------ */

export const BACKUP_REMINDER_AFTER = 7 * DAY
export const BACKUP_REMINDER_SNOOZE = 3 * DAY

/**
 * Whether to remind the writer to back up: a week after the last backup (or
 * since they started using the app), if anything has changed since, and they
 * haven't asked to be reminded later.
 */
export function backupOverdue(o: { now: number; lastBackup: number | null; firstSeen: number; snoozedUntil: number; lastChange: number }): boolean {
  const since = o.lastBackup ?? o.firstSeen
  return o.now >= o.snoozedUntil && o.lastChange > since && o.now - since >= BACKUP_REMINDER_AFTER
}
