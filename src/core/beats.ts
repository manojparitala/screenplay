export interface BeatDef {
  id: string
  name: string
  description: string
  /** Where the beat starts and ends, as a fraction of the script's length. */
  start: number
  end: number
}

export interface BeatTemplate {
  id: string
  name: string
  description: string
  beats: BeatDef[]
}

const b = (id: string, name: string, start: number, end: number, description: string): BeatDef => ({
  id,
  name,
  start,
  end,
  description,
})

export const BEAT_TEMPLATES: BeatTemplate[] = [
  {
    id: 'save-the-cat',
    name: 'Save the Cat!',
    description: "Blake Snyder's 15-beat sheet.",
    beats: [
      b('opening-image', 'Opening Image', 0, 0.01, 'A snapshot of the hero and their world before the story changes it.'),
      b('theme-stated', 'Theme Stated', 0.045, 0.05, 'Someone states (often to the hero) the lesson the hero will learn.'),
      b('setup', 'Set-Up', 0.01, 0.1, "Introduce the hero, the stakes, and what's missing in their life."),
      b('catalyst', 'Catalyst', 0.1, 0.11, 'The life-changing event that knocks the hero out of their status quo.'),
      b('debate', 'Debate', 0.11, 0.2, 'The hero hesitates: should I go? What will it cost?'),
      b('break-into-two', 'Break into Two', 0.2, 0.23, 'The hero makes a choice and enters the upside-down world of Act Two.'),
      b('b-story', 'B Story', 0.22, 0.27, 'A new relationship that carries the theme — often the love story.'),
      b('fun-and-games', 'Fun and Games', 0.2, 0.5, 'The promise of the premise: the trailer moments.'),
      b('midpoint', 'Midpoint', 0.5, 0.5, 'A false victory or false defeat; the stakes are raised.'),
      b('bad-guys-close-in', 'Bad Guys Close In', 0.5, 0.68, 'Internal and external pressure mounts; the team frays.'),
      b('all-is-lost', 'All Is Lost', 0.68, 0.7, 'The low point — often a "whiff of death".'),
      b('dark-night', 'Dark Night of the Soul', 0.7, 0.77, 'The hero wallows before finding the final insight.'),
      b('break-into-three', 'Break into Three', 0.77, 0.8, 'A-story and B-story meet; the hero finds the solution.'),
      b('finale', 'Finale', 0.8, 0.99, 'The hero applies the lesson, defeats the bad guys, and changes the world.'),
      b('final-image', 'Final Image', 0.99, 1, 'The opposite of the opening image: proof that change has occurred.'),
    ],
  },
  {
    id: 'three-act',
    name: 'Three-Act Structure',
    description: 'Setup, confrontation and resolution with classic plot points.',
    beats: [
      b('hook', 'Hook', 0, 0.03, 'Grab the audience with an arresting image, question or event.'),
      b('inciting-incident', 'Inciting Incident', 0.1, 0.12, 'The event that sets the story in motion.'),
      b('plot-point-1', 'Plot Point 1', 0.23, 0.25, 'The hero commits; Act One ends.'),
      b('pinch-1', 'Pinch Point 1', 0.37, 0.38, 'A reminder of the antagonistic force and what is at stake.'),
      b('midpoint', 'Midpoint', 0.5, 0.5, 'A reversal that shifts the hero from reacting to acting.'),
      b('pinch-2', 'Pinch Point 2', 0.62, 0.63, 'The antagonist strikes again, harder.'),
      b('plot-point-2', 'Plot Point 2', 0.75, 0.77, 'The final piece of information; Act Two ends in crisis.'),
      b('climax', 'Climax', 0.88, 0.95, 'The final confrontation — the central question is answered.'),
      b('resolution', 'Resolution', 0.95, 1, 'The new normal.'),
    ],
  },
  {
    id: 'heros-journey',
    name: "Hero's Journey",
    description: "Christopher Vogler's twelve stages.",
    beats: [
      b('ordinary-world', 'Ordinary World', 0, 0.1, 'The hero at home, before the adventure.'),
      b('call', 'Call to Adventure', 0.1, 0.12, 'A problem or challenge presents itself.'),
      b('refusal', 'Refusal of the Call', 0.12, 0.17, 'Fear or reluctance holds the hero back.'),
      b('mentor', 'Meeting the Mentor', 0.17, 0.22, 'Advice, training or a gift prepares the hero.'),
      b('threshold', 'Crossing the Threshold', 0.22, 0.25, 'The hero commits and enters the special world.'),
      b('tests', 'Tests, Allies, Enemies', 0.25, 0.5, 'The hero learns the rules of the new world.'),
      b('approach', 'Approach to the Inmost Cave', 0.5, 0.6, 'Preparation for the central ordeal.'),
      b('ordeal', 'The Ordeal', 0.6, 0.65, 'The hero faces their greatest fear; something dies.'),
      b('reward', 'Reward', 0.65, 0.75, 'The hero seizes the prize.'),
      b('road-back', 'The Road Back', 0.75, 0.8, 'The hero recommits to finishing the journey.'),
      b('resurrection', 'Resurrection', 0.85, 0.95, 'A final test where everything is at stake.'),
      b('elixir', 'Return with the Elixir', 0.95, 1, 'The hero returns home, transformed.'),
    ],
  },
  {
    id: 'story-circle',
    name: 'Story Circle',
    description: "Dan Harmon's eight-step circle.",
    beats: [
      b('you', '1. You', 0, 0.125, 'A character is in a zone of comfort.'),
      b('need', '2. Need', 0.125, 0.25, 'But they want something.'),
      b('go', '3. Go', 0.25, 0.375, 'They enter an unfamiliar situation.'),
      b('search', '4. Search', 0.375, 0.5, 'Adapt to it.'),
      b('find', '5. Find', 0.5, 0.625, 'Get what they wanted.'),
      b('take', '6. Take', 0.625, 0.75, 'Pay a heavy price for it.'),
      b('return', '7. Return', 0.75, 0.875, 'Then return to their familiar situation.'),
      b('change', '8. Change', 0.875, 1, 'Having changed.'),
    ],
  },
]

export function beatTemplate(id: string): BeatTemplate {
  return BEAT_TEMPLATES.find((t) => t.id === id) ?? BEAT_TEMPLATES[0]
}

/** Page range for a beat given the script's length. */
export function beatPages(beat: BeatDef, totalPages: number): [number, number] {
  const from = Math.max(1, Math.round(beat.start * totalPages))
  const to = Math.max(from, Math.round(beat.end * totalPages))
  return [from, to]
}
