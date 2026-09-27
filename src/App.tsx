import { useEffect } from 'react'
import { Library } from './components/Library'
import { ProjectShell } from './components/ProjectShell'
import { Toasts } from './components/ui'
import { useApp } from './store/app'

export function App() {
  const ready = useApp((s) => s.ready)
  const hasProject = useApp((s) => !!s.project)
  const theme = useApp((s) => s.prefs.theme)

  useEffect(() => {
    const { init, openProject } = useApp.getState()
    void init().then(() => {
      const m = location.hash.match(/^#\/project\/([\w-]+)/)
      if (m) void openProject(m[1])
    })
  }, [])

  useEffect(() => {
    if (theme === 'system') delete document.documentElement.dataset.theme
    else document.documentElement.dataset.theme = theme
  }, [theme])

  useEffect(() => {
    const save = () => {
      const s = useApp.getState()
      if (s.project && s.saveState !== 'saved') void s.saveNow()
    }
    const onHide = () => document.visibilityState === 'hidden' && save()
    const onUnload = (e: BeforeUnloadEvent) => {
      const s = useApp.getState()
      if (s.project && s.saveState !== 'saved') {
        save()
        e.preventDefault()
      }
    }
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('beforeunload', onUnload)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('beforeunload', onUnload)
    }
  }, [])

  return (
    <div className="app">
      {!ready ? null : hasProject ? <ProjectShell /> : <Library />}
      <Toasts />
    </div>
  )
}
