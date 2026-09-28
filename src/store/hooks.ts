import { useMemo, useSyncExternalStore } from 'react'
import type { ScriptAnalysis } from '../core/analysis'
import type { Pagination } from '../core/paginate'
import { buildInteractions, buildTracking, type Interactions, type Tracking } from '../core/tracking'
import type { Project, ScriptElement } from '../core/types'
import type { ScriptController } from '../editor/controller'
import { useApp } from './app'

/** The open project's controller. Only use inside project views. */
export function useController(): ScriptController {
  const c = useApp((s) => s.controller)
  if (!c) throw new Error('No project is open.')
  return c
}

export function useProject(): Project {
  const p = useApp((s) => s.project)
  if (!p) throw new Error('No project is open.')
  return p
}

/** Re-renders on every transaction (selection included). */
export function useEditorState() {
  const c = useController()
  return useSyncExternalStore(c.subscribe, c.getState)
}

/** Re-renders only when the document changes. */
export function useDoc() {
  const c = useController()
  return useSyncExternalStore(c.subscribe, c.getDoc)
}

export function useElements(): ScriptElement[] {
  const c = useController()
  const doc = useDoc()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => c.getElements(), [c, doc])
}

export function useAnalysis(): ScriptAnalysis {
  const c = useController()
  const doc = useDoc()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => c.getAnalysis(), [c, doc])
}

export function usePagination(): Pagination {
  const c = useController()
  return useSyncExternalStore(c.subscribe, c.getPagination)
}

/** Who is in which scene and where, following the writer's tracking preferences. */
export function useTracking(): Tracking {
  const elements = useElements()
  const analysis = useAnalysis()
  const includeMentions = useApp((s) => s.prefs.trackMentions)
  const groupLocations = useApp((s) => s.prefs.groupPlaces)
  return useMemo(() => buildTracking(elements, analysis, { includeMentions, groupLocations }), [elements, analysis, includeMentions, groupLocations])
}

/** Conversation exchanges between every pair of characters. */
export function useInteractions(): Interactions {
  const elements = useElements()
  const analysis = useAnalysis()
  return useMemo(() => buildInteractions(elements, analysis), [elements, analysis])
}
