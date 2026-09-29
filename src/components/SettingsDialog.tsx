import { PAPER } from '../core/elements'
import type { PaperSize } from '../core/types'
import { useApp, type Theme } from '../store/app'
import { useProject } from '../store/hooks'
import { LazyInput, Modal } from './ui'

export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const project = useProject()
  const prefs = useApp((s) => s.prefs)
  const { updateSettings, setPrefs } = useApp.getState()
  const s = project.settings

  return (
    <Modal title="Settings" onClose={onClose} footer={<button className="btn primary" onClick={onClose}>Done</button>}>
      <h3 className="section-title" style={{ margin: 0 }}>
        This screenplay
      </h3>
      <label className="field">
        <span>Paper</span>
        <select className="select" value={s.paper} onChange={(e) => updateSettings({ paper: e.target.value as PaperSize })}>
          {(Object.keys(PAPER) as PaperSize[]).map((k) => (
            <option key={k} value={k}>
              {PAPER[k].label}
            </option>
          ))}
        </select>
        <small>Lines wrap the same on both. A4 is taller, so each page holds 59 lines instead of 55.</small>
      </label>
      <label className="field">
        <span>Header</span>
        <LazyInput className="input" value={s.header} onCommit={(header) => updateSettings({ header })} placeholder="For example: TITLE – Blue draft – 12/05/26" />
        <small>Printed at the top left of every page after the first, beside the page number.</small>
      </label>
      <label className="field">
        <span>Footer</span>
        <LazyInput className="input" value={s.footer} onCommit={(footer) => updateSettings({ footer })} placeholder="For example: © 2026 Your Name. Confidential." />
        <small>Printed at the bottom of every script page.</small>
      </label>
      <label className="check">
        <input type="checkbox" checked={s.autoContd} onChange={(e) => updateSettings({ autoContd: e.target.checked })} />
        <span>
          Automatic (CONT’D)
          <small>Add (CONT’D) when a character speaks again in the same scene after action.</small>
        </span>
      </label>
      <label className="check">
        <input type="checkbox" checked={s.showSceneNumbers} onChange={(e) => updateSettings({ showSceneNumbers: e.target.checked })} />
        <span>
          Scene numbers
          <small>Show scene numbers in the editor and print them in both margins (shooting script style).</small>
        </span>
      </label>
      <label className="check">
        <input type="checkbox" checked={s.boldSceneHeadings} onChange={(e) => updateSettings({ boldSceneHeadings: e.target.checked })} />
        <span>
          Bold scene headings
        </span>
      </label>
      <label className="check">
        <input type="checkbox" checked={s.sceneSpacing === 2} onChange={(e) => updateSettings({ sceneSpacing: e.target.checked ? 2 : 1 })} />
        <span>
          Double-space before scene headings
          <small>Two blank lines instead of one. Adds pages, but some writers prefer the breathing room.</small>
        </span>
      </label>
      <label className="check">
        <input type="checkbox" checked={s.includeTitlePage} onChange={(e) => updateSettings({ includeTitlePage: e.target.checked })} />
        <span>Print the title page</span>
      </label>
      <label className="field">
        <span>After dialogue, Enter starts a new…</span>
        <select className="select" value={s.enterAfterDialogue} onChange={(e) => updateSettings({ enterAfterDialogue: e.target.value as 'action' | 'character' })}>
          <option value="action">Action line</option>
          <option value="character">Character cue (for back-and-forth dialogue)</option>
        </select>
      </label>
      <label className="field">
        <span>Target length (pages)</span>
        <input
          className="input"
          type="number"
          min={0}
          max={400}
          value={s.targetPages || ''}
          placeholder="Use actual length"
          onChange={(e) => updateSettings({ targetPages: Math.max(0, Math.min(400, Number(e.target.value) || 0)) })}
        />
        <small>Used by the beat sheet to place each beat. Features usually run 90–120 pages; TV hours 50–60.</small>
      </label>

      <h3 className="section-title" style={{ margin: '8px 0 0' }}>
        App
      </h3>
      <label className="field">
        <span>Theme</span>
        <select className="select" value={prefs.theme} onChange={(e) => setPrefs({ theme: e.target.value as Theme })}>
          <option value="system">Match system</option>
          <option value="light">Light</option>
          <option value="dark">Dark</option>
        </select>
      </label>
      <label className="check">
        <input type="checkbox" checked={prefs.typewriter} onChange={(e) => setPrefs({ typewriter: e.target.checked })} />
        <span>
          Typewriter scrolling
          <small>Keep the line you are writing in the middle of the screen.</small>
        </span>
      </label>
    </Modal>
  )
}
