import type { ElementType, EnterAfterDialogue, PaperSize } from './types'

export interface ElementInfo {
  label: string
  /** Alt+<key> switches the current paragraph to this element. */
  shortcut: string
  /** Printed on the page (sections and notes are writer-only). */
  printable: boolean
  uppercase: boolean
  /** Layout in character cells (Courier 12pt = 10 characters per inch), measured from the 1.5" left margin. */
  indent: number
  width: number
  align: 'left' | 'right' | 'center'
  /** Blank lines printed before the element. */
  spaceBefore: number
}

export const ELEMENTS: Record<ElementType, ElementInfo> = {
  scene: { label: 'Scene Heading', shortcut: '1', printable: true, uppercase: true, indent: 0, width: 60, align: 'left', spaceBefore: 1 },
  action: { label: 'Action', shortcut: '2', printable: true, uppercase: false, indent: 0, width: 60, align: 'left', spaceBefore: 1 },
  character: { label: 'Character', shortcut: '3', printable: true, uppercase: true, indent: 22, width: 38, align: 'left', spaceBefore: 1 },
  parenthetical: { label: 'Parenthetical', shortcut: '4', printable: true, uppercase: false, indent: 16, width: 24, align: 'left', spaceBefore: 0 },
  dialogue: { label: 'Dialogue', shortcut: '5', printable: true, uppercase: false, indent: 10, width: 35, align: 'left', spaceBefore: 0 },
  transition: { label: 'Transition', shortcut: '6', printable: true, uppercase: true, indent: 0, width: 60, align: 'right', spaceBefore: 1 },
  shot: { label: 'Shot', shortcut: '7', printable: true, uppercase: true, indent: 0, width: 60, align: 'left', spaceBefore: 1 },
  centered: { label: 'Centered', shortcut: '8', printable: true, uppercase: false, indent: 0, width: 60, align: 'center', spaceBefore: 1 },
  section: { label: 'Act / Sequence', shortcut: '9', printable: false, uppercase: false, indent: 0, width: 60, align: 'left', spaceBefore: 1 },
  note: { label: 'Note', shortcut: '0', printable: false, uppercase: false, indent: 0, width: 60, align: 'left', spaceBefore: 1 },
}

/** Order used by menus and the element toolbar. */
export const ELEMENT_ORDER: ElementType[] = [
  'scene',
  'action',
  'character',
  'parenthetical',
  'dialogue',
  'transition',
  'shot',
  'centered',
  'section',
  'note',
]

/** Element created when pressing Enter at the end of a paragraph. */
export function nextOnEnter(type: ElementType, enterAfterDialogue: EnterAfterDialogue = 'action'): ElementType {
  switch (type) {
    case 'scene':
      return 'action'
    case 'character':
      return 'dialogue'
    case 'parenthetical':
      return 'dialogue'
    case 'dialogue':
      return enterAfterDialogue
    case 'transition':
      return 'scene'
    case 'section':
      return 'scene'
    default:
      return 'action'
  }
}

/** Tab converts the current paragraph (Final Draft style). */
export function nextOnTab(type: ElementType): ElementType {
  switch (type) {
    case 'scene':
      return 'action'
    case 'action':
      return 'character'
    case 'character':
      return 'transition'
    case 'parenthetical':
      return 'dialogue'
    case 'dialogue':
      return 'parenthetical'
    case 'transition':
      return 'scene'
    case 'section':
      return 'scene'
    default:
      return 'action'
  }
}

/** Shift+Tab converts the current paragraph backwards. */
export function prevOnTab(type: ElementType): ElementType {
  switch (type) {
    case 'scene':
      return 'transition'
    case 'action':
      return 'scene'
    case 'character':
      return 'action'
    case 'parenthetical':
      return 'dialogue'
    case 'dialogue':
      return 'character'
    case 'transition':
      return 'character'
    default:
      return 'action'
  }
}

export const SCENE_PREFIXES = ['INT.', 'EXT.', 'INT./EXT.', 'EXT./INT.', 'I/E.', 'EST.']

export const TIMES_OF_DAY = [
  'DAY',
  'NIGHT',
  'MORNING',
  'AFTERNOON',
  'EVENING',
  'DAWN',
  'DUSK',
  'SUNRISE',
  'SUNSET',
  'CONTINUOUS',
  'LATER',
  'MOMENTS LATER',
  'SAME TIME',
]

export const TRANSITIONS = [
  'CUT TO:',
  'FADE IN:',
  'FADE OUT.',
  'FADE TO BLACK.',
  'DISSOLVE TO:',
  'SMASH CUT TO:',
  'MATCH CUT TO:',
  'JUMP CUT TO:',
  'TIME CUT:',
  'INTERCUT WITH:',
  'BACK TO SCENE:',
]

export const CHARACTER_EXTENSIONS = ['V.O.', 'O.S.', 'O.C.', "CONT'D", 'PRE-LAP', 'ON PHONE', 'INTO PHONE']

/** Physical page geometry (US Letter, industry-standard margins; see PAPER for A4). */
export const PAGE = {
  /** Page size and margins in inches. */
  widthIn: 8.5,
  heightIn: 11,
  leftIn: 1.5,
  topIn: 1,
  /** Characters per inch for 12pt Courier. */
  cpi: 10,
  /** Lines per inch for 12pt Courier with single spacing. */
  lpi: 6,
  linesPerPage: 55,
}

export interface PaperInfo {
  label: string
  widthIn: number
  heightIn: number
  linesPerPage: number
}

/**
 * Paper sizes. The text sits in the same place on both: 1.5in from the left
 * edge, 1in from the top and 6in wide, so a script wraps the same way on
 * either. A4 is narrower and taller: the right margin shrinks to 0.77in and
 * the page holds 59 lines instead of 55, with the same bottom margin.
 */
export const PAPER: Record<PaperSize, PaperInfo> = {
  letter: { label: 'US Letter (8.5 × 11 in)', widthIn: 8.5, heightIn: 11, linesPerPage: 55 },
  a4: { label: 'A4 (210 × 297 mm)', widthIn: 210 / 25.4, heightIn: 297 / 25.4, linesPerPage: 59 },
}

export function paperOf(settings: { paper?: PaperSize }): PaperInfo {
  return PAPER[settings.paper === 'a4' ? 'a4' : 'letter']
}
