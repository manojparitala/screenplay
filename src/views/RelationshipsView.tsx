import { ChartNetwork } from 'lucide-react'
import { useMemo, useState, type KeyboardEvent } from 'react'
import { circleOrder, sharedScenes, type Interactions, type PairInteraction } from '../core/tracking'
import { RAMP, useTooltip, useWidth } from '../components/viz'
import { useInteractions, useTracking } from '../store/hooks'
import { bucket, Panel, rampEdges, useOpenScene } from './TimelineView'

type Bind = ReturnType<typeof useTooltip>['bind']

const MAX_NODES = 20
const MAX_MATRIX = 12

function pairLabel(p: PairInteraction) {
  return `${p.a} & ${p.b}`
}

function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`
}

/* ------------------------------------------------------------------ */
/* Conversation map                                                    */
/* ------------------------------------------------------------------ */

function ConversationMap(props: {
  names: string[]
  speeches: Map<string, number>
  pairs: PairInteraction[]
  focus: string | null
  pinned: string | null
  setHover: (n: string | null) => void
  setPinned: (n: string | null) => void
  bind: Bind
}) {
  const { names, speeches, pairs, focus, pinned, setHover, setPinned, bind } = props
  const [ref, width] = useWidth<HTMLDivElement>()
  const weight = useMemo(() => {
    const m = new Map<string, number>()
    for (const p of pairs) {
      m.set(`${p.a}\u0000${p.b}`, p.exchanges)
      m.set(`${p.b}\u0000${p.a}`, p.exchanges)
    }
    return (a: string, b: string) => m.get(`${a}\u0000${b}`) ?? 0
  }, [pairs])
  const order = useMemo(() => circleOrder(names, weight), [names, weight])

  const w = Math.max(280, width)
  const longest = Math.max(4, ...names.map((n) => n.length))
  const labelRoom = Math.min(130, 18 + longest * 7.4)
  const h = Math.round(Math.max(300, Math.min(480, w * 0.55)))
  const cx = w / 2
  const cy = h / 2
  const R = Math.max(60, Math.min(w / 2 - labelRoom, h / 2 - 34))
  const maxSpeeches = Math.max(1, ...names.map((n) => speeches.get(n) ?? 0))
  const maxEx = Math.max(1, ...pairs.map((p) => p.exchanges))
  const pos = new Map(
    order.map((n, i) => {
      const angle = -Math.PI / 2 + (i / order.length) * Math.PI * 2
      return [n, { x: cx + R * Math.cos(angle), y: cy + R * Math.sin(angle), angle }]
    }),
  )
  const radius = (n: string) => 6 + 14 * Math.sqrt((speeches.get(n) ?? 0) / maxSpeeches)
  const partners = new Set(focus ? pairs.filter((p) => p.a === focus || p.b === focus).flatMap((p) => [p.a, p.b]) : [])
  const edges = [...pairs].filter((p) => pos.has(p.a) && pos.has(p.b)).sort((x, y) => x.exchanges - y.exchanges)
  const touches = (p: PairInteraction) => focus !== null && (p.a === focus || p.b === focus)

  const onKey = (e: KeyboardEvent, n: string) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      setPinned(pinned === n ? null : n)
    } else if (e.key === 'Escape') setPinned(null)
  }

  return (
    <div className="network" ref={ref}>
      {width > 0 && (
        <svg width={w} height={h} role="img" aria-label={`Conversation map of ${names.length} characters`}>
          <rect width={w} height={h} fill="transparent" onClick={() => setPinned(null)} />
          {edges.map((p) => {
            const a = pos.get(p.a)!
            const b = pos.get(p.b)!
            const mx = (a.x + b.x) / 2
            const my = (a.y + b.y) / 2
            const qx = mx + (cx - mx) * 0.25
            const qy = my + (cy - my) * 0.25
            const d = `M${a.x},${a.y} Q${qx},${qy} ${b.x},${b.y}`
            const strokeW = 1.5 + 8.5 * (p.exchanges / maxEx)
            const lit = touches(p)
            const tip = bind(
              <>
                <b className="tip-value">{plural(p.exchanges, 'exchange')}</b>
                <span className="tip-row">{pairLabel(p)}</span>
                <span className="tip-row muted">in {plural(p.sceneIndexes.length, 'scene')}</span>
              </>,
            )
            return (
              <g key={`${p.a}-${p.b}`}>
                <path
                  d={d}
                  fill="none"
                  stroke={focus && !lit ? 'var(--series-other)' : 'var(--ramp-3)'}
                  strokeOpacity={focus ? (lit ? 0.95 : 0.25) : 0.6}
                  strokeWidth={strokeW}
                  strokeLinecap="round"
                />
                <path d={d} fill="none" stroke="transparent" strokeWidth={Math.max(14, strokeW + 10)} className="hit" {...tip} />
              </g>
            )
          })}
          {order.map((n) => {
            const p = pos.get(n)!
            const r = radius(n)
            const dim = focus !== null && n !== focus && !partners.has(n)
            const right = Math.cos(p.angle) >= -0.01
            const lx = p.x + Math.cos(p.angle) * (r + 8)
            const ly = p.y + Math.sin(p.angle) * (r + 8) + 4
            const talks = pairs.filter((q) => q.a === n || q.b === n)
            const tip = bind(
              <>
                <b className="tip-value">{plural(speeches.get(n) ?? 0, 'speech', 'speeches')}</b>
                <span className="tip-row">{n}</span>
                <span className="tip-row muted">{talks.length ? `talks with ${plural(talks.length, 'character')}` : 'talks with no one'}</span>
              </>,
            )
            return (
              <g
                key={n}
                className="node"
                opacity={dim ? 0.3 : 1}
                tabIndex={0}
                role="button"
                aria-pressed={pinned === n}
                aria-label={`${n}: ${talks.length ? `talks with ${talks.map((q) => (q.a === n ? q.b : q.a)).join(', ')}` : 'talks with no one'}`}
                onClick={() => setPinned(pinned === n ? null : n)}
                onKeyDown={(e) => onKey(e, n)}
                onPointerEnter={() => setHover(n)}
                onPointerLeave={() => {
                  tip.onPointerLeave()
                  setHover(null)
                }}
                onPointerMove={tip.onPointerMove}
                onFocus={(e) => {
                  tip.onFocus(e)
                  setHover(n)
                }}
                onBlur={() => {
                  tip.onBlur()
                  setHover(null)
                }}
              >
                <circle cx={p.x} cy={p.y} r={r + 8} fill="transparent" />
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={r}
                  fill={n === focus ? 'var(--ramp-3)' : 'var(--node-fill)'}
                  stroke={n === focus ? 'var(--surface)' : 'var(--node-stroke)'}
                  strokeWidth={2}
                />
                <text x={lx} y={ly} textAnchor={Math.abs(Math.cos(p.angle)) < 0.2 ? 'middle' : right ? 'start' : 'end'} className="node-label">
                  {n}
                </text>
              </g>
            )
          })}
        </svg>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Partner list (also used on the Characters view)                     */
/* ------------------------------------------------------------------ */

export function PartnerBars(props: { name: string; interactions: Interactions; onSelect?: (name: string) => void }) {
  const { name, interactions, onSelect } = props
  const tracking = useTracking()
  const open = useOpenScene(tracking.scenes)
  const rows = interactions.pairs
    .filter((p) => p.a === name || p.b === name)
    .map((p) => ({ partner: p.a === name ? p.b : p.a, pair: p }))
  if (!rows.length) return <p className="faint" style={{ margin: 0, fontSize: 13 }}>{name} doesn’t exchange lines with anyone yet.</p>
  const max = Math.max(...rows.map((r) => r.pair.exchanges))
  return (
    <div className="partners">
      {rows.map(({ partner, pair }) => (
        <div key={partner} className="partner-row">
          {onSelect ? (
            <button className="partner-name" onClick={() => onSelect(partner)} title={`Show ${partner}`}>
              {partner}
            </button>
          ) : (
            <span className="partner-name">{partner}</span>
          )}
          <div className="bar-track">
            <div className="bar-fill" style={{ width: `${(pair.exchanges / max) * 100}%` }} />
          </div>
          <span className="value">{pair.exchanges}</span>
          <span className="partner-scenes">
            {pair.sceneIndexes.map((si) => (
              <button key={si} className="scene-num-chip" onClick={() => open(si)} title={tracking.scenes[si]?.heading}>
                {tracking.scenes[si]?.number}
              </button>
            ))}
          </span>
        </div>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Pair matrix                                                         */
/* ------------------------------------------------------------------ */

function PairMatrix({ names, values, unit, bind }: { names: string[]; values: number[][]; unit: [string, string]; bind: Bind }) {
  const max = Math.max(1, ...values.flatMap((row, i) => row.filter((_, j) => j !== i)))
  const edges = rampEdges(max)
  const label = (v: number) => `${v} ${v === 1 ? unit[0] : unit[1]}`
  return (
    <div className="table-wrap">
      <table className="matrix">
        <thead>
          <tr>
            <th />
            {names.map((n) => (
              <th key={n} scope="col">
                <span>{n}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {names.map((a, i) => (
            <tr key={a}>
              <th scope="row">{a}</th>
              {names.map((b, j) => {
                const v = values[i][j]
                if (i === j)
                  return (
                    <td key={b} className="diag" tabIndex={0} {...bind(<><b className="tip-value">{label(v)}</b><span className="tip-row">{a} in total</span></>)}>
                      {v}
                    </td>
                  )
                const k = bucket(v, edges)
                return (
                  <td
                    key={b}
                    tabIndex={0}
                    style={v ? { background: RAMP[k], color: `var(--ramp-ink-${k + 1})` } : undefined}
                    className={v ? '' : 'zero'}
                    {...bind(
                      <>
                        <b className="tip-value">{label(v)}</b>
                        <span className="tip-row">
                          {a} & {b}
                        </span>
                      </>,
                    )}
                  >
                    {v || ''}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* View                                                                */
/* ------------------------------------------------------------------ */

export function RelationshipsView() {
  const interactions = useInteractions()
  const tracking = useTracking()
  const open = useOpenScene(tracking.scenes)
  const tooltip = useTooltip()
  const [minEx, setMinEx] = useState(1)
  const [hover, setHover] = useState<string | null>(null)
  const [pinned, setPinned] = useState<string | null>(null)
  const [measure, setMeasure] = useState<'talk' | 'scenes'>('talk')
  const [showAll, setShowAll] = useState(false)

  const speeches = useMemo(() => {
    const m = new Map<string, number>()
    for (const t of tracking.characters) m.set(t.name, t.presence.reduce((s, p) => s + (p?.speeches ?? 0), 0))
    return m
  }, [tracking])
  const pairs = interactions.pairs.filter((p) => p.exchanges >= minEx)
  const present = interactions.names.filter((n) => (speeches.get(n) ?? 0) > 0)
  const nodes = present.slice(0, MAX_NODES)
  const focus = pinned ?? hover
  const shownPairs = showAll ? pairs : pairs.slice(0, 12)
  const maxPair = Math.max(1, ...pairs.map((p) => p.exchanges))

  const matrixTracks = useMemo(() => tracking.characters.filter((t) => t.sceneIndexes.length > 0).slice(0, MAX_MATRIX), [tracking])
  const matrixNames = useMemo(() => matrixTracks.map((t) => t.name), [matrixTracks])
  const matrixValues = useMemo(() => {
    if (measure === 'scenes') return sharedScenes(matrixTracks)
    const idx = matrixNames.map((n) => interactions.names.indexOf(n))
    return idx.map((i, a) =>
      idx.map((j, b) => (a === b ? interactions.matrix[i].reduce((s, v) => s + v, 0) : interactions.matrix[i][j])),
    )
  }, [measure, matrixTracks, matrixNames, interactions])

  if (present.length < 2) {
    return (
      <div className="view-scroll">
        <div className="empty-state">
          <ChartNetwork size={36} />
          <h3>Not enough characters yet</h3>
          <p>Once two or more characters speak in the script, you’ll see who talks with whom here.</p>
        </div>
      </div>
    )
  }

  const most = [...present].sort(
    (a, b) => interactions.pairs.filter((p) => p.a === b || p.b === b).length - interactions.pairs.filter((p) => p.a === a || p.b === a).length,
  )[0]

  return (
    <div className="view-scroll viz-root">
      <div className="view-inner" style={{ maxWidth: 1400 }}>
        <div className="view-header">
          <div>
            <h1>Relationships</h1>
            <p>Who talks with whom. Each time one character’s speech is followed by another’s in the same scene, the two exchange a line.</p>
          </div>
        </div>

        <div className="viz-filters">
          <label className="field inline-field">
            <span>Show pairs with at least</span>
            <select className="select" value={minEx} onChange={(e) => setMinEx(Number(e.target.value))}>
              {[1, 2, 3, 5, 10].map((v) => (
                <option key={v} value={v}>
                  {plural(v, 'exchange')}
                </option>
              ))}
            </select>
          </label>
        </div>

        <Panel
          title="Conversation map"
          description={`Lines join characters who talk to each other; the thicker the line, the more they exchange. Bigger circles speak more. Hover or click a character to highlight their conversations.${present.length > MAX_NODES ? ` Showing the ${MAX_NODES} characters with the most lines.` : ''}`}
        >
          <div className="network-layout">
            <ConversationMap
              names={nodes}
              speeches={speeches}
              pairs={pairs}
              focus={focus}
              pinned={pinned}
              setHover={setHover}
              setPinned={setPinned}
              bind={tooltip.bind}
            />
            <aside className="network-side">
              {focus ? (
                <>
                  <h3>{focus} talks with</h3>
                  <PartnerBars name={focus} interactions={{ ...interactions, pairs }} onSelect={(n) => setPinned(n)} />
                  {pinned && (
                    <button className="btn small" onClick={() => setPinned(null)}>
                      Clear selection
                    </button>
                  )}
                </>
              ) : (
                <>
                  <h3>At a glance</h3>
                  <dl className="glance">
                    <div>
                      <dt>Talking pairs</dt>
                      <dd>{pairs.length}</dd>
                    </div>
                    <div>
                      <dt>Closest pair</dt>
                      <dd>{pairs[0] ? pairLabel(pairs[0]) : '–'}</dd>
                    </div>
                    <div>
                      <dt>Most connected</dt>
                      <dd>{most}</dd>
                    </div>
                  </dl>
                  <p className="faint" style={{ fontSize: 12.5, margin: 0 }}>
                    Select a character to see everyone they talk with and the scenes where it happens.
                  </p>
                </>
              )}
            </aside>
          </div>
        </Panel>

        <Panel title="Strongest pairs" description="Pairs ranked by lines exchanged. The numbers on the right are the scenes where they talk; click one to open it.">
          {pairs.length === 0 ? (
            <p className="faint" style={{ margin: 0 }}>
              No pairs with that many exchanges.
            </p>
          ) : (
            <div className="partners">
              {shownPairs.map((p) => (
                <div key={pairLabel(p)} className="partner-row">
                  <span className="partner-name">{pairLabel(p)}</span>
                  <div className="bar-track">
                    <div className="bar-fill" style={{ width: `${(p.exchanges / maxPair) * 100}%` }} />
                  </div>
                  <span className="value">{p.exchanges}</span>
                  <span className="partner-scenes">
                    {p.sceneIndexes.map((si) => (
                      <button key={si} className="scene-num-chip" onClick={() => open(si)} title={tracking.scenes[si]?.heading}>
                        {tracking.scenes[si]?.number}
                      </button>
                    ))}
                  </span>
                </div>
              ))}
              {pairs.length > 12 && (
                <button className="btn small" style={{ alignSelf: 'flex-start' }} onClick={() => setShowAll(!showAll)}>
                  {showAll ? 'Show fewer' : `Show all ${pairs.length} pairs`}
                </button>
              )}
            </div>
          )}
        </Panel>

        <Panel
          title="Who talks with whom"
          description={`${measure === 'talk' ? 'Lines exchanged' : 'Scenes shared'} by each pair of characters${present.length > MAX_MATRIX ? ` (the ${MAX_MATRIX} characters in the most scenes)` : ''}. The diagonal shows each character’s total.`}
          actions={
            <div className="segmented" role="radiogroup" aria-label="Measure">
              <button className={measure === 'talk' ? 'active' : ''} role="radio" aria-checked={measure === 'talk'} onClick={() => setMeasure('talk')}>
                Conversations
              </button>
              <button className={measure === 'scenes' ? 'active' : ''} role="radio" aria-checked={measure === 'scenes'} onClick={() => setMeasure('scenes')}>
                Shared scenes
              </button>
            </div>
          }
        >
          <PairMatrix names={matrixNames} values={matrixValues} unit={measure === 'talk' ? ['exchange', 'exchanges'] : ['scene', 'scenes']} bind={tooltip.bind} />
        </Panel>
      </div>
      {tooltip.node}
    </div>
  )
}

/** "Talks with" section on a character's profile. */
export function TalksWith({ name, onSelect }: { name: string; onSelect: (name: string) => void }) {
  const interactions = useInteractions()
  return <PartnerBars name={name} interactions={interactions} onSelect={onSelect} />
}
