# Screenplay

A screenwriting app that runs in the browser. It has everything you need to get a script from first idea to a correctly formatted, submission-ready PDF. It formats as you type, plans on index cards and beat sheets, keeps a character and location bible, reports on length and pacing, and reads and writes Fountain and Final Draft.

Your scripts stay on your machine, saved in the browser's own storage (IndexedDB). There is no account and no server.

## Features

### Writing
- **Industry-standard formatting**: Scene Heading, Action, Character, Parenthetical, Dialogue, Transition, Shot and Centered text, set in Courier on US Letter with the standard margins (1.5" left, dialogue at 2.5", character cues at 3.7").
- **Final Draft–style keys**: **Enter** starts the next logical element (scene → action, character → dialogue, dialogue → action). **Tab** switches element (action → character, character → parenthetical, and so on). **Alt+1…0** jumps straight to an element.
- **Smart typing**:
  - Type `int.` on an action line and it becomes a scene heading.
  - Type `(` on an empty dialogue line and it becomes a parenthetical, with the parentheses added for you.
  - Autocomplete fills in character names, locations, times of day, cue extensions such as (V.O.) and (O.S.), and transitions.
- **Live pagination**: dashed lines show exactly where each printed page ends. Page breaks follow the same rules as professional software:
  - A scene heading is never left alone at the bottom of a page.
  - Long speeches split at the end of a sentence, with **(MORE)** and **CHARACTER (CONT'D)** added.
- **Automatic (CONT'D)** when a character speaks again in the same scene.
- **Bold, italic and underline**, find & replace (match case, whole word), and undo and redo that also cover reordering on the Cards view and renames from the Characters and Locations views.
- **Writer-only elements**: *Act / Sequence* markers and *Notes* help you organise the script and never print.
- Scene numbers, colour-coded scenes, zoom, typewriter scrolling, focus mode, and dark mode.
- **Paste a screenplay** as plain text or Fountain and it is formatted automatically. Copy several elements out and you get Fountain text.

### Planning
- **Scene navigator** with synopses, filtering, act dividers and the page each scene starts on.
- **Scene inspector**: synopsis, private notes, card colour, cast and length in eighths of a page for the scene the cursor is in.
- **Index cards**: a corkboard of scenes. Drag a card to reorder scenes in the script. Edit headings and synopses on the card, filter by colour and add or delete scenes.
- **Beat sheets**: *Save the Cat!* (15 beats), *Three-Act Structure*, *Hero's Journey* (12 stages) and *Story Circle* (8 steps).
  - Each beat shows the page range it should land on for your target length and which scenes fall on those pages.
  - Link scenes to each beat and keep notes on it.

### Story bible
- **Characters**: every speaking character is found automatically. Each has a profile (role, age, description, personality, want, need, flaw, arc, backstory) and stats (speeches, words, share of dialogue, scenes).
  - **Rename a character everywhere**: cues keep their (V.O.)-style extensions, and action and dialogue keep each occurrence's capitalisation.
- **Locations** are collected from scene headings, with INT/EXT, times of day, scene list, page count, and description and production notes. Renaming a location updates every heading.
- **Notes**: a notebook for research and feedback, plus a list of every note left inside the script.

### Character timeline
- **Journeys**: each character is a line moving between locations in script order. You can see where they go, when their paths cross, and when they are off-screen. Follow up to 8 characters at once; hover a point to see who is there and how much they say, and click to open the scene.
- **Scene presence**: a character-by-scene grid showing who is in every scene, shaded by how much they speak. Characters who are only named in the action are marked separately.
- Each character's profile shows their own journey: a strip across the whole script and the ordered path of places they visit.
- Options to group sub-locations (HOUSE - KITCHEN → HOUSE) and to count characters who are named in the action but don't speak.

### Relationships
- **Conversation map**: a network of who talks with whom. Lines join characters who exchange dialogue, thicker for more exchanges; bigger circles speak more. Select a character to highlight their conversations and list their partners.
- **Strongest pairs**: pairs ranked by lines exchanged, with the scenes where they talk (click to open).
- **Who talks with whom**: a matrix of lines exchanged, or of scenes shared, for every pair.
- Each character's profile shows who they talk with and in which scenes.
- An exchange is counted each time one character's speech is followed by a different character's speech in the same scene.

### Reports
- Page count, estimated runtime, scenes, words, speaking characters, locations and dialogue share.
- Charts of dialogue by character, interior/exterior split, time of day and scene lengths in script order.
- A scene breakdown table with lengths in eighths, which you can export as CSV (UTF-8 with a byte-order mark, so Excel shows accents and other alphabets correctly).

### Output & safety
- **Export**: PDF with an optional title page, Fountain (`.fountain`), Final Draft (`.fdx`) and a full project backup (`.json`).
  - Files are named after the script's title as you typed it, in any language; only characters that file systems reject (such as `/ : * ? " < > |`) are replaced.
- **Import**: PDF, Fountain, Final Draft, indented plain-text scripts and project backups. You can also drop a file onto the library.
  - PDF import rebuilds the script from the page layout: indentation, capitals and bold tell scene headings, action, character cues, parentheticals and dialogue apart. Page numbers, headers and footers, (MORE)/(CONT'D), scene numbers and revision marks are removed, and speeches split across pages are rejoined. It works with scripts exported from screenwriting software and with web pages saved as PDF (for example from IMSDb). Scanned PDFs need text recognition (OCR) first.
- **Print preview** drawn from exactly the same layout as the PDF, and **Print** straight from the browser.
- **Title page** editor with a live preview.
- **Snapshots**: save named copies of the script (for example "First draft" or "Before Act 2 rewrite"). You can restore one later; the current version is snapshotted first, so nothing is lost.
- Autosaves as you type.

### Opened from claude.ai

When the app is opened as a claude.ai artifact, it runs inside the artifact viewer, which doesn't let pages start downloads or print. Exports go through the viewer instead: it asks you to confirm each file before saving it. The viewer only saves certain file types, so:

- PDF, project backups (`.json`) and the CSV report are saved as usual.
- Fountain scripts are saved as `.fountain.txt`. The contents are unchanged, and Fountain apps open `.txt` files.
- Final Draft scripts are saved inside a `.zip` file. Unzip it to get the `.fdx`.
- **Print** isn't offered there. Use **Download PDF** and print the PDF.

## Getting started

```bash
npm install
npm run dev        # http://localhost:5173
```

Build a static site you can host anywhere (GitHub Pages, Netlify, or any static web server):

```bash
npm run build      # output in dist/
npm run preview
```

## Keyboard shortcuts

| Keys | Action |
| --- | --- |
| Enter | Next element (scene → action → …, character → dialogue). On an empty line it switches type instead. |
| Tab / Shift+Tab | Change element type. After a character or dialogue it adds a parenthetical. |
| Shift+Enter | Line break inside an element |
| Alt+1 … Alt+0 | Scene, Action, Character, Parenthetical, Dialogue, Transition, Shot, Centered, Act/Sequence, Note |
| ↑ ↓ then Enter/Tab | Choose an autocomplete suggestion. Esc hides the list. |
| Ctrl/⌘+B / I / U | Bold / italic / underline |
| Ctrl/⌘+Z, Ctrl/⌘+Shift+Z | Undo / redo |
| Ctrl/⌘+F | Find & replace |
| Ctrl/⌘+S | Save now |
| Ctrl/⌘+P | Print preview |
| F1 | Help |

## Project structure

```
src/
  core/        Framework-free screenplay logic, all unit-tested
    paginate.ts    page layout: widths, spacing, keep-together rules, (MORE)/(CONT'D)
    fountain.ts    Fountain parser and writer (title page, emphasis, forced elements, notes, sections)
    fdx.ts         Final Draft XML reader and writer
    pdfimport.ts   rebuilds screenplay elements from a laid-out PDF or indented text
    pdf.ts         PDF drawing via jsPDF (and the print preview uses the same drawing code)
    analysis.ts    scenes, characters, locations, word counts, renaming
    tracking.ts    who is in which scene and where, and who talks with whom
    beats.ts       beat sheet templates
  editor/      ProseMirror editor
    schema.ts      one node type per screenplay element
    commands.ts    Enter/Tab behaviour and smart typing
    autocomplete.ts, plugins.ts   suggestions, page-break markers, find & replace, typewriter scrolling
    controller.ts  owns the editor state so every view edits the script through undoable transactions
  store/       zustand app state and IndexedDB persistence
  views/       Script, Cards, Beats, Characters, Timeline, Relationships, Locations, Reports, Title Page, Notes, Preview
  components/  app shell, library, dialogs, shared UI
e2e/           Playwright end-to-end tests
```

## Testing

```bash
npm run typecheck
npm test           # unit tests (Vitest)
npm run test:e2e   # browser tests (Playwright; builds and serves the app)
```

## Known limitations

- Dual (side-by-side) dialogue is imported as regular dialogue.
- The downloadable PDF uses the standard Courier font, which only covers Western European characters. Accents it lacks are dropped (ő becomes o), and other characters (Tamil, Devanagari, Cyrillic, CJK, emoji and so on) print as “?”; the app warns you when this happens. To keep them, use **Preview → Print** and save as PDF, which uses the browser's fonts. Fountain, Final Draft and backup files keep every character.
- Revision marks and coloured revision pages, locked scene numbers and real-time collaboration are not implemented yet.
