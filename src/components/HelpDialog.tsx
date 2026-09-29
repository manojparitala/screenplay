import { ELEMENT_ORDER, ELEMENTS } from '../core/elements'
import { fileAccessSupported } from '../store/files'
import { Modal } from './ui'

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
const mod = isMac ? '⌘' : 'Ctrl'
const alt = isMac ? '⌥' : 'Alt'

const SHORTCUTS: [string, string][] = [
  ['Enter', 'New element: the next logical type (scene → action, character → dialogue, dialogue → action). On an empty line, switches type instead.'],
  ['Tab', 'Change element: action → character → transition → scene. After a character or dialogue, adds a parenthetical; after a parenthetical, back to dialogue.'],
  ['Shift+Tab', 'Change element backwards.'],
  ['Shift+Enter', 'Line break inside the same element.'],
  [`${alt}+1 … ${alt}+0`, 'Jump straight to an element type (see list below).'],
  ['↑ ↓ then Enter/Tab', 'Pick an autocomplete suggestion (characters, locations, times, transitions). Esc hides it.'],
  [`${mod}+Space`, 'Show autocomplete suggestions.'],
  [`${mod}+B / I / U`, 'Bold, italic, underline.'],
  [`${mod}+Z / ${mod}+Shift+Z`, 'Undo / redo — works across all views.'],
  [`${mod}+F`, 'Find and replace.'],
  [`${mod}+S`, 'Save now (the app also saves automatically). Where the browser allows it, the first time also asks for a file on your computer to keep the script in.'],
  [`${mod}+P`, 'Print preview.'],
  ['F1', 'This help.'],
]

export function HelpDialog({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Help & keyboard shortcuts" onClose={onClose} wide>
      <table className="shortcut-table">
        <tbody>
          {SHORTCUTS.map(([k, d]) => (
            <tr key={k}>
              <td>
                <kbd>{k}</kbd>
              </td>
              <td>{d}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div>
        <h3 className="section-title">Element shortcuts</h3>
        <div className="flow">
          {ELEMENT_ORDER.map((t) => (
            <span key={t} style={{ display: 'contents' }}>
              <kbd>
                {alt}+{ELEMENTS[t].shortcut}
              </kbd>
              <b>{ELEMENTS[t].label}</b>
              <span className="muted">{ELEMENTS[t].printable ? '' : 'writer-only, never printed'}</span>
            </span>
          ))}
        </div>
      </div>
      <div>
        <h3 className="section-title">Smart typing</h3>
        <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
          <li>Type <kbd>int.</kbd> or <kbd>ext.</kbd> and a space on an action line to turn it into a scene heading.</li>
          <li>Type <kbd>(</kbd> on an empty dialogue line to start a parenthetical.</li>
          <li>Paste Fountain or plain-text screenplays and they are formatted automatically. Copying several elements gives Fountain text.</li>
          <li>(MORE) and (CONT’D) are added automatically where dialogue breaks across pages. Dashed lines show where each page ends.</li>
        </ul>
      </div>
      <div>
        <h3 className="section-title">Where is my work saved?</h3>
        <p className="muted" style={{ margin: 0 }}>
          In this browser on this device (IndexedDB). Nothing is sent to a server.{' '}
          {fileAccessSupported()
            ? 'Choose “Save to file” at the top to keep the script in a file on your computer as well: every change is written to it, and “Open file…” in the library opens it again, on this computer or another. '
            : ''}
          As you write, the app keeps automatic snapshots of earlier versions (see Snapshots), and “Back up all scripts” in the library saves every script to one
          file to keep somewhere safe or move to another computer.
        </p>
      </div>
    </Modal>
  )
}
