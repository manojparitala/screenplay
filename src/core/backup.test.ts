import { describe, expect, it } from 'vitest'
import { autoSnapshotsToDrop, BACKUP_REMINDER_AFTER, backupEntries, backupFileName, backupOverdue, isBackupScript } from './backup'
import { createProject, parseProjectBackup } from './project'
import { SAMPLE_FOUNTAIN } from './sample'
import { parseFountain } from './fountain'
import type { Snapshot } from './types'
import { unzipFiles, zipFilesCompressed } from './zip'

const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR

describe('automatic snapshots', () => {
  const now = new Date(2026, 8, 29, 18, 0).getTime()
  const every = (step: number, span: number) => Array.from({ length: Math.floor(span / step) }, (_, i) => ({ id: `s${i}`, createdAt: now - i * step }))

  it('keeps everything from the last hour', () => {
    expect(autoSnapshotsToDrop(every(10 * MIN, HOUR), now)).toEqual([])
  })

  it('thins out older ones: one an hour for a day, one a day for a month', () => {
    const snaps = every(10 * MIN, 40 * DAY)
    const drop = new Set(autoSnapshotsToDrop(snaps, now))
    const kept = snaps.filter((s) => !drop.has(s.id))
    const within = (from: number, to: number) => kept.filter((s) => now - s.createdAt >= from && now - s.createdAt < to)
    expect(within(0, HOUR)).toHaveLength(6)
    // One in each hour of the rest of the day (the hour straddling the one-hour mark shares its slot).
    expect(within(HOUR, DAY).length).toBeGreaterThanOrEqual(22)
    expect(within(HOUR, DAY).length).toBeLessThanOrEqual(24)
    const days = within(DAY, 31 * DAY).map((s) => new Date(s.createdAt).toDateString())
    expect(new Set(days).size).toBe(days.length)
    expect(days.length).toBeGreaterThanOrEqual(29)
    expect(within(31 * DAY, Infinity)).toEqual([])
    // Each hour and day keeps its newest copy.
    const kept5h = within(5 * HOUR, 6 * HOUR)
    expect(kept5h).toHaveLength(1)
    expect(snaps.filter((s) => s.createdAt > kept5h[0].createdAt && new Date(s.createdAt).getHours() === new Date(kept5h[0].createdAt).getHours())).toEqual([])
  })

  it('always keeps the three newest, however old', () => {
    const old = [0, 1, 2, 3].map((i) => ({ id: `o${i}`, createdAt: now - 90 * DAY - i * HOUR }))
    expect(autoSnapshotsToDrop(old, now)).toEqual(['o3'])
  })
})

describe('backing up the library', () => {
  const sample = createProject('The Last Lighthouse')
  sample.script = parseFountain(SAMPLE_FOUNTAIN).elements
  const twin = createProject('The Last Lighthouse')
  const other = createProject('Vāli: “The Return”')
  const snapshot: Snapshot = {
    id: 'snap1',
    projectId: sample.id,
    name: 'First draft',
    createdAt: 1,
    pages: 3,
    script: sample.script.slice(0, 2),
    titlePage: sample.titlePage,
  }
  const auto: Snapshot = { ...snapshot, id: 'snap2', name: 'Automatic backup', auto: true }
  const now = new Date(2026, 8, 29, 9, 5)

  it('names the zip after the day', () => {
    expect(backupFileName(now)).toBe('Screenplay backup 2026-09-29.zip')
  })

  it('holds each script in full and as Fountain, with distinct names', () => {
    const entries = backupEntries(
      [
        { project: sample, snapshots: [snapshot, auto] },
        { project: twin, snapshots: [] },
        { project: other, snapshots: [] },
      ],
      now,
    )
    expect(entries.map((e) => e.name)).toEqual([
      'README.txt',
      'The Last Lighthouse.screenplay.json',
      'The Last Lighthouse.fountain',
      'The Last Lighthouse (2).screenplay.json',
      'The Last Lighthouse (2).fountain',
      'Vāli - “The Return”.screenplay.json',
      'Vāli - “The Return”.fountain',
    ])
    const text = (i: number) => new TextDecoder().decode(entries[i].data)
    expect(text(0)).toContain('3 scripts')
    expect(text(2)).toContain('EXT. NORTHERN COAST - LIGHTHOUSE - DUSK')
    expect(entries[1].date).toEqual(new Date(sample.updatedAt))
  })

  it('restores scripts and snapshots from the zip', async () => {
    const zip = await zipFilesCompressed(backupEntries([{ project: sample, snapshots: [snapshot, auto] }, { project: other, snapshots: [] }], now))
    const files = await unzipFiles(zip, isBackupScript)
    expect(files.map((f) => f.name)).toEqual(['The Last Lighthouse.screenplay.json', 'Vāli - “The Return”.screenplay.json'])
    const [first, second] = files.map((f) => parseProjectBackup(new TextDecoder().decode(f.data)))
    expect(first.project).toEqual(sample)
    expect(first.snapshots).toEqual([snapshot, auto])
    expect(second.project.titlePage.title).toBe('Vāli: “The Return”')
    expect(second.snapshots).toEqual([])
  })

  it('skips the extra files macOS adds when it zips a folder', () => {
    expect(isBackupScript('Backup/Dune.screenplay.json')).toBe(true)
    expect(isBackupScript('Dune.SCREENPLAY.JSON')).toBe(true)
    expect(isBackupScript('__MACOSX/Backup/._Dune.screenplay.json')).toBe(false)
    expect(isBackupScript('Backup/._Dune.screenplay.json')).toBe(false)
    expect(isBackupScript('Dune.fountain')).toBe(false)
  })
})

describe('backup reminder', () => {
  const now = new Date(2026, 8, 29).getTime()
  const base = { now, lastBackup: null, firstSeen: now - 30 * DAY, snoozedUntil: 0, lastChange: now - HOUR }

  it('reminds a week after the last backup when scripts have changed since', () => {
    expect(backupOverdue(base)).toBe(true)
    expect(backupOverdue({ ...base, lastBackup: now - BACKUP_REMINDER_AFTER + HOUR })).toBe(false)
    expect(backupOverdue({ ...base, lastBackup: now - BACKUP_REMINDER_AFTER })).toBe(true)
    // Nothing new to back up.
    expect(backupOverdue({ ...base, lastBackup: now - 20 * DAY, lastChange: now - 21 * DAY })).toBe(false)
  })

  it('waits a week after the writer starts, and while snoozed', () => {
    expect(backupOverdue({ ...base, firstSeen: now - 2 * DAY })).toBe(false)
    expect(backupOverdue({ ...base, snoozedUntil: now + HOUR })).toBe(false)
    expect(backupOverdue({ ...base, snoozedUntil: now - HOUR })).toBe(true)
  })
})
