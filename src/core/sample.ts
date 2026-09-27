import { parseFountain } from './fountain'
import type { Project } from './types'

/** A short original screenplay used to demo the app. */
export const SAMPLE_FOUNTAIN = `Title: The Last Lighthouse
Credit: Written by
Author: A. Screenwriter
Draft date: First Draft
Contact:
    writer@example.com

# ACT ONE

FADE IN:

EXT. NORTHERN COAST - LIGHTHOUSE - DUSK
= Teo arrives to shut the lighthouse down and finds Maren still at her post.

Wind shears the grass flat. A white tower stands at the edge of a cliff, its lamp dark.

A mud-streaked hatchback grinds up the gravel track and stops. TEO ALVES (28), rain jacket, clipboard, climbs out and squints up at the tower.

TEO
(to himself)
Last one on the list.

The tower door swings open. MAREN HOLT (67), wool sweater, oil can in hand, regards him like weather.

MAREN
You're late. Storms don't wait for surveyors.

TEO
I'm not here about the storm, Mrs. Holt. I'm here about the light.

MAREN
There's nothing wrong with the light.

TEO
That's the problem. The ships have satellites now. The Authority wants it decommissioned by Friday.

She looks past him, out to the gray horizon.

MAREN
Satellites.
(beat)
Come inside before you blow away.

CUT TO:

INT. LIGHTHOUSE - KEEPER'S ROOM - NIGHT
= Maren shows Teo the logbooks: forty years of ships she has seen home.

A narrow room crowded with logbooks. A kettle hisses on a camping stove. Teo drips on the doormat.

[[Consider opening on the logbooks as an insert shot.]]

MAREN
Every ship that passed this point since nineteen eighty-four. Name, time, weather.

TEO
You wrote all of these?

MAREN
Someone had to remember them.

He opens one at random. Neat handwriting, columns of names: *Aurora*, *Saint Brendan*, *Kittiwake*.

TEO
Mrs. Holt, the decision's already been made. I just count the equipment and sign the form.

MAREN
Then count carefully.

A LOW HORN sounds, far out at sea. Both of them turn to the window.

EXT. NORTHERN COAST - LIGHTHOUSE - NIGHT

Rain now, sideways. Beyond the rocks, a small fishing boat pitches in the swell, running blind.

INT. LIGHTHOUSE - LAMP ROOM - CONTINUOUS

Maren hauls herself up the last steps. Teo follows, breathless.

MAREN
The electrics went in the spring. Nobody came to fix them.

TEO
So it doesn't work.

MAREN
It works. It just doesn't work by itself.

She strikes a match. The old paraffin mantle catches. She pulls the clockwork lever and the great lens begins, slowly, to turn.

The beam sweeps out across the water.

# ACT TWO

EXT. HARBOR - DAWN

The fishing boat, battered but whole, noses into the harbor. A YOUNG FISHERMAN on deck raises a hand toward the distant tower.

INT. LIGHTHOUSE - KEEPER'S ROOM - MORNING

Teo sits at the table with the form in front of him. Maren pours two mugs of tea.

MAREN
Well?

He looks at the form. Then at the logbook, still open.

TEO
(finally)
I think I miscounted.

He tears the form in half.

MAREN
You'll get in trouble.

TEO
Probably. Teach me how to light it.

She almost smiles.

FADE OUT.
`

export function sampleProject(base: Project): Project {
  const parsed = parseFountain(SAMPLE_FOUNTAIN)
  return {
    ...base,
    titlePage: { ...base.titlePage, ...parsed.titlePage },
    script: parsed.elements,
    characters: {
      MAREN: {
        name: 'MAREN',
        role: 'Protagonist',
        age: '67',
        description: 'Weathered, unhurried, wool sweater with oil stains on the cuffs.',
        personality: 'Stubborn, dry, fiercely loyal to the sea and its people.',
        want: 'To keep the light burning.',
        need: 'To pass on what she knows before it is lost.',
        flaw: 'Refuses help from anyone.',
        arc: 'From lone keeper to teacher.',
        backstory: 'Has kept the Northern Coast light since 1984, after her husband drowned within sight of it.',
        notes: '',
      },
    },
  }
}
