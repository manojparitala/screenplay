import { BACKUP_REMINDER_SNOOZE, backupEntries, backupFileName, backupOverdue, type BackupItem } from '../core/backup'
import { zipFilesCompressed } from '../core/zip'
import { useApp } from '../store/app'
import * as db from '../store/db'
import { saveFile } from './save'

/** Backing up the whole library to one file, and reminding the writer to. */

const LAST_BACKUP = 'screenplay:last-backup'
const FIRST_SEEN = 'screenplay:first-seen'
const SNOOZED_UNTIL = 'screenplay:backup-snoozed-until'

function readTime(key: string): number | null {
  try {
    const v = Number(localStorage.getItem(key))
    return v > 0 ? v : null
  } catch {
    return null
  }
}

function writeTime(key: string, v: number) {
  try {
    localStorage.setItem(key, String(v))
  } catch {
    /* storage disabled: no reminders then */
  }
}

export function lastBackupAt(): number | null {
  return readTime(LAST_BACKUP)
}

/** Whether to remind the writer to back up, given when a script last changed. */
export function backupReminderDue(lastChange: number, now = Date.now()): boolean {
  let firstSeen = readTime(FIRST_SEEN)
  if (firstSeen === null) {
    firstSeen = now
    writeTime(FIRST_SEEN, now)
  }
  return backupOverdue({ now, lastBackup: lastBackupAt(), firstSeen, snoozedUntil: readTime(SNOOZED_UNTIL) ?? 0, lastChange })
}

export function snoozeBackupReminder(now = Date.now()) {
  writeTime(SNOOZED_UNTIL, now + BACKUP_REMINDER_SNOOZE)
}

/** Save every script, with its snapshots, into one zip file. Resolves true once it was handed to the writer. */
export async function backupAll(): Promise<boolean> {
  const { notify } = useApp.getState()
  try {
    const projects = await db.listProjects()
    if (!projects.length) {
      notify('There are no scripts to back up yet.')
      return false
    }
    const items: BackupItem[] = []
    for (const project of projects) items.push({ project, snapshots: await db.listSnapshots(project.id) })
    const now = new Date()
    const zip = await zipFilesCompressed(backupEntries(items, now))
    const saved = await saveFile(backupFileName(now), new Blob([zip as Uint8Array<ArrayBuffer>], { type: 'application/zip' }), 'application/zip')
    if (saved) {
      writeTime(LAST_BACKUP, now.getTime())
      const n = projects.length
      notify(`Backed up ${n} script${n === 1 ? '' : 's'}. Keep the file somewhere safe, such as a cloud drive or a USB stick.`)
    }
    return saved
  } catch (e) {
    notify(`Backup failed: ${(e as Error).message}`, 'error')
    return false
  }
}
