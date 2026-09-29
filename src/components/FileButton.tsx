import { HardDrive, HardDriveDownload, TriangleAlert } from 'lucide-react'
import { useApp } from '../store/app'
import { fileAccessSupported } from '../store/files'
import { Menu } from './ui'

/**
 * The file on the computer the open script is saved to: a button to choose
 * one, or the file's name with what can be done with it. Only where the
 * browser can write files (Chrome and Edge, in a tab of their own).
 */
export function FileButton() {
  const file = useApp((s) => s.file)
  if (!fileAccessSupported()) return null
  const { saveToFile, saveFileAs, unlinkFile } = useApp.getState()

  if (!file) {
    return (
      <button
        className="btn small ghost file-btn"
        onClick={() => void saveFileAs()}
        title="Keep this script in a file on your computer, saved as you write (Ctrl/⌘+S)"
      >
        <HardDriveDownload size={15} /> <span className="file-label">Save to file</span>
      </button>
    )
  }

  const problem = file.status === 'needs-permission' || file.status === 'error'
  const title =
    file.status === 'needs-permission'
      ? `The browser needs your permission again to save to “${file.name}”. Until then, changes are kept in this browser only.`
      : file.status === 'error'
        ? `The last save to “${file.name}” failed. Your work is still saved in this browser.`
        : `Saving to “${file.name}” on your computer as you write`
  const item = (close: () => void, label: string, fn: () => unknown, hint?: string) => (
    <button
      className="menu-item"
      role="menuitem"
      onClick={() => {
        close()
        void fn()
      }}
    >
      {label}
      {hint && <small>{hint}</small>}
    </button>
  )
  return (
    <Menu
      trigger={(open, toggle) => (
        <button
          className={`btn small ghost file-btn${problem ? ' problem' : ''}${open ? ' active' : ''}`}
          onClick={toggle}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={problem ? `${file.name}: not saving. ${title}` : `Saving to ${file.name}`}
          title={title}
        >
          {problem ? <TriangleAlert size={15} /> : <HardDrive size={15} />}
          <span className="file-label">{file.name}</span>
        </button>
      )}
    >
      {(close) => (
        <>
          {file.status === 'needs-permission'
            ? item(close, `Allow saving to “${file.name}”`, saveToFile, 'Ctrl/⌘+S')
            : item(close, file.status === 'error' ? 'Try again' : 'Save now', saveToFile, 'Ctrl/⌘+S')}
          {item(close, 'Save to another file…', saveFileAs)}
          <div className="menu-sep" />
          {item(close, 'Stop saving to this file', unlinkFile)}
        </>
      )}
    </Menu>
  )
}
