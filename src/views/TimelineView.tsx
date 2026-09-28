import { ArrowRight, ChartGantt } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import type { SceneInfo } from '../core/analysis'
import { characterPath, orderedPlaces, type CharacterTrack, type Presence, type Tracking } from '../core/tracking'
import { RAMP, SERIES, useTooltip, useWidth } from '../components/viz'
import { useApp } from '../store/app'
import { useAnalysis, useController, useTracking } from '../store/hooks'

const MAX_FOLLOWED = 8

type Bind = ReturnType<typeof useTooltip>['bind']

export function useOpenScene(scenes: SceneInfo[]) {
  const c = useController()
  const setView = useApp((s) => s.setView)
  return (sceneIndex: number) => {
    const scene = scenes[sceneIndex]
    if (!scene) return
    setView('script')
    setTimeout(() => c.revealScene(scene.id), 0)
  }
}

/** Word-count buckets for the one-hue ramp: upper bound of each of the 4 steps. */
export function rampEdges(max: number): number[] {
  return [0.25, 0.5, 0.75, 1].map((f) => Math.max(1, Math.ceil(max * f)))
}

export function bucket(words: number, edges: number[]): number {
  const i = edges.findIndex((e) => words <= e)
  return i === -1 ? edges.length - 1 : i
}

function PresenceTip({ p, name, scene, color }: { p: Presence; name: string; scene: SceneInfo; color?: string }) {
  return (
    <>
      <b className="tip-value">
        {p.speeches ? `${p.words} word${p.words === 1 ? '' : 's'} · ${p.speeches} speech${p.speeches === 1 ? '' : 'es'}` : 'Named in the action, no lines'}
      </b>
      <span className="tip-row">
        {color && <i className="tip-key" style={{ background: color }} />}
        {name} · scene {scene.number}
      </span>
      <span className="tip-sub">{scene.heading || 'Untitled scene'}</span>
    </>
  )
}

/* ------------------------------------------------------------------ */
/* Journeys: characters moving between locations                       */
/* ------------------------------------------------------------------ */

function Journeys(props: {
  tracking: Tracking
  followed: CharacterTrack[]
  colorOf: (name: string) => string
  hover: string | null
  setHover: (name: string | null) => void
  onOpen: (sceneIndex: number) => void
  bind: Bind
  sectionStarts: { sceneIndex: number; title: string }[]
}) {
  const { tracking, followed, colorOf, hover, setHover, onOpen, bind, sectionStarts } = props
  const [ref, width] = useWidth<HTMLDivElement>()
  const lanes = orderedPlaces(
    tracking.places,
    followed.flatMap((t) => t.sceneIndexes),
  )
  const laneOf = new Map(lanes.map((p, i) => [p, i]))
  const n = tracking.scenes.length
  const labelsOn = followed.length <= 4
  const padL = 8
  // Room for end-of-line names (12px semibold, up to ~8.4px per capital) plus the key.
  const padR = labelsOn ? Math.min(260, 44 + Math.max(...followed.map((t) => t.name.length)) * 8.4) : 16
  const top = sectionStarts.length ? 26 : 12
  const bottom = 30
  const laneH = 46
  const colW = Math.max(26, Math.min(160, (width - padL - padR) / Math.max(1, n)))
  const w = Math.ceil(padL + padR + colW * n)
  const h = top + bottom + laneH * lanes.length
  const x = (si: number) => padL + colW * si + colW / 2
  const spread = Math.min(5, 34 / Math.max(1, followed.length))
  const y = (si: number, rank: number) => top + laneOf.get(tracking.places[si])! * laneH + laneH / 2 + (rank - (followed.length - 1) / 2) * spread
  const showEvery = colW >= 22 ? 1 : 5

  // End-of-line labels, pushed apart so they never overlap.
  const labels = labelsOn
    ? followed
        .map((t, rank) => {
          const last = t.sceneIndexes[t.sceneIndexes.length - 1]
          return { name: t.name, fromX: x(last) + 6, fromY: y(last, rank), y: y(last, rank) }
        })
        .sort((a, b) => a.y - b.y)
    : []
  for (let i = 1; i < labels.length; i++) if (labels[i].y - labels[i - 1].y < 14) labels[i].y = labels[i - 1].y + 14

  // One hover target per scene and place, listing everyone followed who is there.
  const cells: { si: number; lane: number; who: { track: CharacterTrack; p: Presence }[] }[] = []
  const cellAt = new Map<string, (typeof cells)[number]>()
  for (const t of followed) {
    for (const si of t.sceneIndexes) {
      const lane = laneOf.get(tracking.places[si])!
      const key = `${si}:${lane}`
      let cell = cellAt.get(key)
      if (!cell) {
        cell = { si, lane, who: [] }
        cellAt.set(key, cell)
        cells.push(cell)
      }
      cell.who.push({ track: t, p: t.presence[si]! })
    }
  }

  // Draw the hovered character last so it sits on top.
  const order = [...followed.keys()].sort((a, b) => Number(followed[a].name === hover) - Number(followed[b].name === hover))

  return (
    <div className="journeys">
      <div className="journey-lanes" style={{ paddingTop: top, paddingBottom: bottom }} aria-hidden="true">
        {lanes.map((p) => (
          <div key={p} className="lane-label" style={{ height: laneH }} title={p}>
            {p}
          </div>
        ))}
      </div>
      <div className="journey-scroll" ref={ref}>
        {width > 0 && (
          <svg width={w} height={h} role="img" aria-label={`Journeys of ${followed.map((t) => t.name).join(', ')} across ${n} scenes`}>
            {lanes.map((p, i) => (
              <rect key={p} x={0} y={top + i * laneH} width={w} height={laneH} fill={i % 2 ? 'var(--lane-alt)' : 'transparent'} />
            ))}
            {sectionStarts.map((s) => (
              <g key={`${s.sceneIndex}-${s.title}`}>
                <line x1={padL + colW * s.sceneIndex} x2={padL + colW * s.sceneIndex} y1={top - 16} y2={h - bottom} className="section-rule" />
                <text x={padL + colW * s.sceneIndex + 4} y={top - 8} className="axis-label section-label">
                  {s.title}
                </text>
              </g>
            ))}
            {tracking.scenes.map((s, si) =>
              si % showEvery === 0 || si === n - 1 ? (
                <text key={s.id} x={x(si)} y={h - 10} textAnchor="middle" className="axis-label">
                  {s.number}
                </text>
              ) : null,
            )}
            {order.map((rank) => {
              const t = followed[rank]
              const color = colorOf(t.name)
              const dim = hover !== null && hover !== t.name
              const idx = t.sceneIndexes
              return (
                <g key={t.name} opacity={dim ? 0.18 : 1} style={{ transition: 'opacity .15s' }}>
                  {idx.slice(1).map((b, k) => {
                    const a = idx[k]
                    const x1 = x(a)
                    const y1 = y(a, rank)
                    const x2 = x(b)
                    const y2 = y(b, rank)
                    const mx = (x1 + x2) / 2
                    return (
                      <path
                        key={b}
                        d={`M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`}
                        fill="none"
                        stroke={color}
                        strokeWidth={2}
                        strokeLinecap="round"
                        strokeDasharray={b - a > 1 ? '1 5' : undefined}
                      />
                    )
                  })}
                  {idx.map((si) => {
                    const p = t.presence[si]!
                    return p.speeches ? (
                      <circle key={si} cx={x(si)} cy={y(si, rank)} r={4.5} fill={color} stroke="var(--surface)" strokeWidth={2} />
                    ) : (
                      <circle key={si} cx={x(si)} cy={y(si, rank)} r={3.5} fill="var(--surface)" stroke={color} strokeWidth={2} />
                    )
                  })}
                </g>
              )
            })}
            {cells.map((cell) => {
              const scene = tracking.scenes[cell.si]
              const b = bind(
                <>
                  <span className="tip-sub">
                    Scene {scene.number} · {scene.heading || 'Untitled scene'}
                  </span>
                  {cell.who.map((w) => (
                    <span key={w.track.name} className="tip-row">
                      <i className="tip-key" style={{ background: colorOf(w.track.name) }} />
                      <b className="tip-value">{w.p.speeches ? `${w.p.words} words` : 'no lines'}</b>
                      {w.track.name}
                    </span>
                  ))}
                </>,
              )
              return (
                <rect
                  key={`${cell.si}-${cell.lane}`}
                  x={x(cell.si) - colW / 2}
                  y={top + cell.lane * laneH}
                  width={colW}
                  height={laneH}
                  fill="transparent"
                  className="hit"
                  onClick={() => onOpen(cell.si)}
                  onPointerEnter={() => cell.who.length === 1 && setHover(cell.who[0].track.name)}
                  onPointerMove={b.onPointerMove}
                  onPointerLeave={() => {
                    b.onPointerLeave()
                    setHover(null)
                  }}
                />
              )
            })}
            {labels.map((l) => (
              <g key={l.name} opacity={hover !== null && hover !== l.name ? 0.3 : 1}>
                <path d={`M${l.fromX},${l.fromY} L${w - padR + 4},${l.y}`} className="leader" />
                <line x1={w - padR + 8} x2={w - padR + 20} y1={l.y} y2={l.y} stroke={colorOf(l.name)} strokeWidth={2} strokeLinecap="round" />
                <text x={w - padR + 26} y={l.y + 4} className="series-label">
                  {l.name}
                </text>
              </g>
            ))}
          </svg>
        )}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Scene presence grid                                                 */
/* ------------------------------------------------------------------ */

function PresenceGrid(props: {
  tracking: Tracking
  rows: CharacterTrack[]
  onOpen: (sceneIndex: number) => void
  bind: Bind
  sectionStarts: { sceneIndex: number; title: string }[]
  colorOf?: (name: string) => string | undefined
}) {
  const { tracking, rows, onOpen, bind, sectionStarts, colorOf } = props
  const [ref, width] = useWidth<HTMLDivElement>()
  const n = tracking.scenes.length
  const nameW = 150
  const cell = Math.max(14, Math.min(34, Math.floor((width - nameW) / Math.max(1, n)) - 2))
  const maxWords = Math.max(1, ...rows.flatMap((r) => r.presence.map((p) => p?.words ?? 0)))
  const edges = rampEdges(maxWords)
  const showEvery = cell >= 18 ? 1 : 5

  return (
    <>
      <div className="presence-scroll" ref={ref}>
        <div className="presence" style={{ gridTemplateColumns: `${nameW}px repeat(${n}, ${cell}px)` }} role="table" aria-label="Scene presence by character">
          {sectionStarts.length > 0 && (
            <div className="presence-sections" role="row" style={{ gridColumn: `1 / span ${n + 1}`, gridTemplateColumns: 'subgrid' }}>
              <span role="columnheader" />
              {sectionStarts.map((s, i) => {
                const end = sectionStarts[i + 1]?.sceneIndex ?? n
                return (
                  <span key={s.sceneIndex} role="columnheader" className="presence-section" style={{ gridColumn: `${s.sceneIndex + 2} / ${end + 2}` }} title={s.title}>
                    {s.title}
                  </span>
                )
              })}
            </div>
          )}
          <div className="presence-row presence-head" role="row" style={{ gridColumn: `1 / span ${n + 1}` }}>
            <span role="columnheader" className="presence-name">
              Scene
            </span>
            {tracking.scenes.map((s, si) => (
              <span key={s.id} role="columnheader" className="presence-num" title={s.heading}>
                {si % showEvery === 0 ? s.number : ''}
              </span>
            ))}
          </div>
          {rows.map((r) => (
            <div key={r.name} className="presence-row" role="row" style={{ gridColumn: `1 / span ${n + 1}` }}>
              <span role="rowheader" className="presence-name" title={r.name}>
                {colorOf?.(r.name) && <i className="tip-key" style={{ background: colorOf(r.name) }} />}
                <span className="presence-label">{r.name}</span>
                <small>{r.sceneIndexes.length}</small>
              </span>
              {r.presence.map((p, si) =>
                p ? (
                  <button
                    key={si}
                    role="cell"
                    className={`presence-cell${p.speeches ? '' : ' silent'}`}
                    style={p.speeches ? { background: RAMP[bucket(p.words, edges)] } : undefined}
                    aria-label={`${r.name}, scene ${tracking.scenes[si].number}: ${p.speeches ? `${p.words} words` : 'named in the action'}`}
                    onClick={() => onOpen(si)}
                    {...bind(<PresenceTip p={p} name={r.name} scene={tracking.scenes[si]} />)}
                  />
                ) : (
                  <span key={si} role="cell" className="presence-cell empty" />
                ),
              )}
            </div>
          ))}
        </div>
      </div>
      <div className="legend" style={{ marginTop: 10 }}>
        {edges.map((e, i) => {
          const lo = i === 0 ? 1 : edges[i - 1] + 1
          if (lo > e) return null
          return (
            <span key={i}>
              <i style={{ background: RAMP[i] }} />
              {lo === e ? e : `${lo}–${e}`} words
            </span>
          )
        })}
        <span>
          <i className="legend-silent" />
          Named in the action, no lines
        </span>
        <span>
          <i className="legend-empty" />
          Not in the scene
        </span>
      </div>
    </>
  )
}

/* ------------------------------------------------------------------ */
/* View                                                                */
/* ------------------------------------------------------------------ */

export function Panel({ title, description, children, actions }: { title: string; description: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="panel report-card timeline-panel">
      <div className="panel-head">
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
        {actions}
      </div>
      {children}
    </section>
  )
}

export function TimelineView() {
  const tracking = useTracking()
  const analysis = useAnalysis()
  const prefs = useApp((s) => s.prefs)
  const setPrefs = useApp((s) => s.setPrefs)
  const open = useOpenScene(tracking.scenes)
  const tooltip = useTooltip()
  const [hover, setHover] = useState<string | null>(null)
  const [sort, setSort] = useState<'first' | 'most'>('first')
  const tracks = tracking.characters.filter((t) => t.sceneIndexes.length > 0)

  // Followed characters keep their colour slot for as long as they stay selected.
  const [chosen, setChosen] = useState<Record<string, number> | null>(null)
  const slots = useMemo(() => {
    if (chosen) return Object.fromEntries(Object.entries(chosen).filter(([name]) => tracks.some((t) => t.name === name)))
    const top = [...tracks].sort((a, b) => b.sceneIndexes.length - a.sceneIndexes.length).slice(0, 6)
    return Object.fromEntries(top.map((t, i) => [t.name, i]))
  }, [chosen, tracks])
  const followed = tracks.filter((t) => t.name in slots)
  const colorOf = (name: string) => SERIES[slots[name] ?? 0]

  const toggle = (name: string) => {
    const next = { ...slots }
    if (name in next) delete next[name]
    else {
      if (Object.keys(next).length >= MAX_FOLLOWED) return
      const used = new Set(Object.values(next))
      let slot = 0
      while (used.has(slot)) slot++
      next[name] = slot
    }
    setChosen(next)
  }

  const sectionStarts = useMemo(
    () =>
      analysis.sections
        .map((sec) => ({ sceneIndex: tracking.scenes.findIndex((s) => s.index > sec.index), title: sec.title }))
        .filter((s) => s.sceneIndex >= 0),
    [analysis.sections, tracking.scenes],
  )

  const rows = [...tracks].sort((a, b) =>
    sort === 'first' ? a.sceneIndexes[0] - b.sceneIndexes[0] || b.sceneIndexes.length - a.sceneIndexes.length : b.sceneIndexes.length - a.sceneIndexes.length,
  )

  if (!tracking.scenes.length || !tracks.length) {
    return (
      <div className="view-scroll">
        <div className="empty-state">
          <ChartGantt size={36} />
          <h3>Nothing to track yet</h3>
          <p>Write scene headings and give your characters some lines. Each character’s journey through the story will be charted here.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="view-scroll viz-root">
      <div className="view-inner" style={{ maxWidth: 1400 }}>
        <div className="view-header">
          <div>
            <h1>Character timeline</h1>
            <p>Follow each character through the story: where they go and which scenes they are in.</p>
          </div>
        </div>

        <div className="viz-filters">
          <div className="char-chips" role="group" aria-label="Characters to follow">
            {tracks.map((t) => {
              const on = t.name in slots
              return (
                <button
                  key={t.name}
                  className={`char-chip${on ? ' on' : ''}`}
                  aria-pressed={on}
                  disabled={!on && followed.length >= MAX_FOLLOWED}
                  onClick={() => toggle(t.name)}
                  onPointerEnter={() => on && setHover(t.name)}
                  onPointerLeave={() => setHover(null)}
                  title={on ? `Stop following ${t.name}` : `Follow ${t.name}`}
                >
                  <i className="tip-key" style={on ? { background: colorOf(t.name) } : undefined} />
                  {t.name}
                  <small>{t.sceneIndexes.length}</small>
                </button>
              )
            })}
          </div>
          <div className="viz-options">
            <label className="check">
              <input type="checkbox" checked={prefs.trackMentions} onChange={(e) => setPrefs({ trackMentions: e.target.checked })} />
              <span>Count characters named in the action</span>
            </label>
            <label className="check">
              <input type="checkbox" checked={prefs.groupPlaces} onChange={(e) => setPrefs({ groupPlaces: e.target.checked })} />
              <span>Group sub-locations (HOUSE - KITCHEN → HOUSE)</span>
            </label>
          </div>
        </div>

        <Panel
          title="Journeys"
          description={`Each line follows a character from place to place in script order. A filled dot means they speak in that scene, a hollow dot means they are only named in the action, and a dotted line means they are off-screen for a while. Follow up to ${MAX_FOLLOWED} characters at once; click a dot to open the scene.`}
        >
          {followed.length ? (
            <>
              <div className="legend" style={{ marginBottom: 10 }}>
                {followed.map((t) => (
                  <span key={t.name} onPointerEnter={() => setHover(t.name)} onPointerLeave={() => setHover(null)}>
                    <i className="line-key" style={{ background: colorOf(t.name) }} />
                    {t.name}
                  </span>
                ))}
              </div>
              <Journeys
                tracking={tracking}
                followed={followed}
                colorOf={colorOf}
                hover={hover}
                setHover={setHover}
                onOpen={open}
                bind={tooltip.bind}
                sectionStarts={sectionStarts}
              />
            </>
          ) : (
            <p className="faint" style={{ margin: 0 }}>
              Pick characters above to follow their journeys.
            </p>
          )}
        </Panel>

        <Panel
          title="Scene presence"
          description="Who is in every scene. The stronger the colour, the more words the character speaks there. Click a cell to open the scene."
          actions={
            <div className="segmented" role="radiogroup" aria-label="Order characters by">
              <button className={sort === 'first' ? 'active' : ''} onClick={() => setSort('first')}>
                First appearance
              </button>
              <button className={sort === 'most' ? 'active' : ''} onClick={() => setSort('most')}>
                Most scenes
              </button>
            </div>
          }
        >
          <PresenceGrid
            tracking={tracking}
            rows={rows}
            onOpen={open}
            bind={tooltip.bind}
            sectionStarts={sectionStarts}
            colorOf={(name) => (name in slots ? colorOf(name) : undefined)}
          />
        </Panel>

      </div>
      {tooltip.node}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* One character's journey (used on the Characters view)               */
/* ------------------------------------------------------------------ */

export function CharacterJourney({ name }: { name: string }) {
  const tracking = useTracking()
  const open = useOpenScene(tracking.scenes)
  const tooltip = useTooltip()
  const track = tracking.characters.find((t) => t.name === name)
  if (!track || !track.sceneIndexes.length) {
    return <p className="faint" style={{ margin: 0 }}>Not in any scene yet.</p>
  }
  const stops = characterPath(track, tracking.places)
  const places = new Set(stops.map((s) => s.place)).size
  const maxWords = Math.max(1, ...track.presence.map((p) => p?.words ?? 0))
  const edges = rampEdges(maxWords)
  const first = tracking.scenes[track.sceneIndexes[0]]
  const last = tracking.scenes[track.sceneIndexes[track.sceneIndexes.length - 1]]
  return (
    <div className="viz-root journey-detail">
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>
        In {track.sceneIndexes.length} of {tracking.scenes.length} scenes, across {places} place{places === 1 ? '' : 's'}. First seen in scene {first.number}, last in scene {last.number}.
      </p>
      <div className="strip" role="list" aria-label={`${name} across the script`}>
        {track.presence.map((p, si) =>
          p ? (
            <button
              key={si}
              role="listitem"
              className={`strip-cell${p.speeches ? '' : ' silent'}`}
              style={p.speeches ? { background: RAMP[bucket(p.words, edges)] } : undefined}
              aria-label={`Scene ${tracking.scenes[si].number}: ${p.speeches ? `${p.words} words` : 'named in the action'}`}
              onClick={() => open(si)}
              {...tooltip.bind(<PresenceTip p={p} name={name} scene={tracking.scenes[si]} />)}
            />
          ) : (
            <span key={si} role="listitem" className="strip-cell empty" aria-label={`Scene ${tracking.scenes[si].number}: not present`} />
          ),
        )}
      </div>
      <ol className="path">
        {stops.map((s, i) => (
          <li key={i}>
            {i > 0 && <ArrowRight size={14} className="path-arrow" aria-hidden="true" />}
            <button className="path-stop" onClick={() => open(s.sceneIndexes[0])} title="Open in script">
              <span className="path-place">{s.place}</span>
              <small>
                {s.sceneIndexes.length === 1
                  ? `sc ${tracking.scenes[s.sceneIndexes[0]].number}`
                  : `sc ${tracking.scenes[s.sceneIndexes[0]].number}–${tracking.scenes[s.sceneIndexes[s.sceneIndexes.length - 1]].number}`}
              </small>
            </button>
          </li>
        ))}
      </ol>
      {tooltip.node}
    </div>
  )
}
