# Screenplay

A screenwriting app that runs in the browser. It has everything you need to get a script from first idea to a correctly formatted, submission-ready PDF. It formats as you type, plans on index cards and beat sheets, keeps a character and location bible, reports on length and pacing, and reads and writes Fountain and Final Draft.

Your scripts stay on your machine, saved in the browser's own storage (IndexedDB) and, if you like, in files on your computer. There is no account and no server. It works offline and installs as an app.

**Use it:** <https://manojparitala.github.io/screenplay/> (once GitHub Pages is turned on, see [Publishing](#publishing-on-github-pages)).

### Installing it as an app

The app keeps itself in the browser's cache the first time it loads, so it opens and works with no internet connection.

- **Chrome or Edge** (Windows, macOS, Linux, ChromeOS, Android): click **Install app** in the library, or the install icon in the address bar. It then opens in its own window from the Start menu, dock or home screen.
- **Safari**: on a Mac, choose **File → Add to Dock**; on an iPhone or iPad, **Share → Add to Home Screen**.
- **Firefox**: works offline in a tab; desktop Firefox doesn't install web apps.

When a new version is published, the app shows **A new version of Screenplay is ready** with a **Reload** button. Your work is saved before it reloads.

## Features

### Writing
- **Industry-standard formatting**: Scene Heading, Action, Character, Parenthetical, Dialogue, Transition, Shot and Centered text, set in Courier with the standard margins (1.5" left, dialogue at 2.5", character cues at 3.7").
- **US Letter or A4** paper (Settings). New scripts start on A4 unless your region uses Letter (the US, Canada, Mexico and a few others). The text sits in the same place on both; A4 fits 59 lines a page to Letter's 55.
- **Header and footer**: optional lines such as the draft name or a copyright notice. The header prints from page 2, beside the page number, and the footer on every script page.
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

### Indian languages
Write in **Hindi** (and other languages in Devanagari), **Tamil**, **Telugu**, **Kannada** and **Malayalam**, on their own or mixed with English on the same line.
- The app bundles Noto Sans fonts for these scripts, so they display the same on every computer. A font is only downloaded when a script uses it.
- Scene headings can mix languages, for example `INT. வீடு - இரவு`. Character names in these scripts work like any other: autocomplete, the Characters view, the timeline and relationships all pick them up.
- These scripts have taller vowel signs than Courier, so a printed line holding them is 1¼ lines high, and page breaks account for it.
- The PDF embeds the fonts and draws conjuncts and vowel signs correctly, using HarfBuzz, the text engine browsers use. Text in the PDF can be searched and copied, and the app can import its own PDFs again.
- Fountain doesn't recognise character names written without capital letters, so the app writes them with Fountain's `@` marker (`@வாலி`).

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

### Keeping your work safe
- **Autosave**: every change is saved in the browser as you type.
- **Save to file** (Chrome and Edge): press **Ctrl/⌘+S** or choose **Save to file** at the top, and pick where to keep the script on your computer, for example in a Dropbox, Google Drive or iCloud folder. From then on every change is written to that `.screenplay.json` file as well.
  - The file's name at the top of the window shows where the script is saved. Its menu has **Save now**, **Save to another file…** and **Stop saving to this file**.
  - Browsers forget their permission to write to a file when you close them. When that happens, the file name turns red; press **Ctrl/⌘+S** or click it to allow saving again. Until then, changes stay in the browser, so nothing is lost.
  - **Open file…** in the library opens a saved script and carries on saving to it, on this computer or another one. If the browser already has a newer version of that script, the newer version is kept and the other goes to Snapshots.
  - Only files saved by the app are ever written to. Other files you open (Fountain, Final Draft, PDF) are imported as new scripts and left untouched.
- **Automatic snapshots**: as you write, the app keeps a copy of the script as it was before your latest changes, at most every ten minutes. It keeps all of them from the last hour, one an hour for the last day and one a day for the last month. They're listed under **Snapshots → Automatic backups**, where you can restore or download any of them.
- **Snapshots**: save named copies of the script (for example "First draft" or "Before Act 2 rewrite"). Restoring one first snapshots the current version, so nothing is lost.
- **Back up all scripts** (in the library) saves one `.zip` file holding every script with its notes, characters, beats and snapshots, plus a Fountain copy of each that other screenwriting apps and any text editor can open. Keep it somewhere safe, or use it to move your scripts to another computer or browser.
  - **Restore from backup…** brings the scripts back. You can also drop the zip onto the library. If a script in the backup also exists in the browser, the newer version is kept and the other is added to its Snapshots.
  - If you haven't backed up for a week and scripts have changed, the library reminds you.

### Output
- **Export**: PDF with an optional title page, Fountain (`.fountain`), Final Draft (`.fdx`) and a full project backup (`.json`).
  - Files are named after the script's title as you typed it, in any language; only characters that file systems reject (such as `/ : * ? " < > |`) are replaced.
- **Import**: PDF, Fountain, Final Draft, indented plain-text scripts and project backups. You can also drop a file onto the library.
  - PDF import rebuilds the script from the page layout: indentation, capitals and bold tell scene headings, action, character cues, parentheticals and dialogue apart. Page numbers, headers and footers, (MORE)/(CONT'D), scene numbers and revision marks are removed, and speeches split across pages are rejoined. It works with scripts exported from screenwriting software and with web pages saved as PDF (for example from IMSDb). Scanned PDFs need text recognition (OCR) first.
- **Print preview** drawn from exactly the same layout as the PDF, and **Print** straight from the browser.
- PDFs are written by the app itself: Courier for Latin text (in the standard PDF font, so files stay small), and embedded font subsets for the Indian scripts.
- **Title page** editor with a live preview.

### Opened from claude.ai

When the app is opened as a claude.ai artifact, it runs inside the artifact viewer, which doesn't let pages start downloads or print. Exports go through the viewer instead: it asks you to confirm each file before saving it. The viewer only saves certain file types, so:

- PDF, project backups (`.json`), library backups (`.zip`) and the CSV report are saved as usual.
- Fountain scripts are saved as `.fountain.txt`. The contents are unchanged, and Fountain apps open `.txt` files.
- Final Draft scripts are saved inside a `.zip` file. Unzip it to get the `.fdx`, or drop the zip onto the library to import it.
- **Print** isn't offered there. Use **Download PDF** and print the PDF.
- **Save to file** and installing aren't available inside the viewer. Use **Back up all scripts**, or open the app from its own site.

## Browsers

| | Chrome, Edge | Safari | Firefox |
| --- | --- | --- | --- |
| Writing, planning, reports, import and export | ✓ | ✓ | ✓ |
| Works offline | ✓ | ✓ | ✓ |
| Install as an app | ✓ | ✓ (Add to Dock / Home Screen) | – |
| Save to file, Open file… | ✓ | – | – |
| Automatic snapshots, Back up all scripts | ✓ | ✓ | ✓ |

The browser tests run in Chromium, Firefox and WebKit (Safari's engine) on every push.

## Getting started

```bash
npm install
npm run dev        # http://localhost:5173
```

Build a static site you can host anywhere (GitHub Pages, Netlify, or any static web server):

```bash
npm run build      # output in dist/, including the service worker (sw.js) for offline use
npm run preview
```

The build uses relative paths, so it works from any folder of a site. Offline use and installing need HTTPS (or `localhost`).

### Publishing on GitHub Pages

The **GitHub Pages** workflow (`.github/workflows/pages.yml`) builds `main` and publishes it on every push. Turn it on once:

1. In the repository on GitHub, open **Settings → Pages**.
2. Under **Build and deployment**, set **Source** to **GitHub Actions**.
3. Open **Actions → GitHub Pages → Run workflow** (or push to `main`).

The app is then at `https://<user>.github.io/<repository>/`. Until Pages is turned on, the workflow skips publishing and says so in its summary.

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
| Ctrl/⌘+S | Save now. In Chrome and Edge, the first time also asks where to keep the script as a file. |
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
    pdf.ts         draws the pages (the PDF and the print preview use the same drawing code)
    pdfwriter.ts   writes PDF files: standard Courier text and embedded, shaped fonts
    scripts.ts     the Indian scripts: finding them in text and measuring their width
    shaper.ts      text shaping with HarfBuzz for the PDF
    ttf.ts         reads TrueType fonts: metrics, outlines and subsets
    analysis.ts    scenes, characters, locations, word counts, renaming
    tracking.ts    who is in which scene and where, and who talks with whom
    beats.ts       beat sheet templates
    backup.ts      automatic snapshot thinning, library backups, backup reminders
    zip.ts         reads and writes zip files (compressed with the browser's own deflate)
  editor/      ProseMirror editor
    schema.ts      one node type per screenplay element
    commands.ts    Enter/Tab behaviour and smart typing
    autocomplete.ts, plugins.ts   suggestions, page-break markers, find & replace, typewriter scrolling
    controller.ts  owns the editor state so every view edits the script through undoable transactions
  store/       zustand app state, IndexedDB persistence, loading fonts
    files.ts       saving scripts to files on the computer (File System Access API)
    offline.ts     registering the service worker, updates and installing
  assets/fonts Noto Sans for Devanagari, Tamil, Telugu, Kannada and Malayalam (SIL Open Font License, see OFL.txt)
  views/       Script, Cards, Beats, Characters, Timeline, Relationships, Locations, Reports, Title Page, Notes, Preview
  components/  app shell, library, dialogs, shared UI
sw/            the service worker; the build lists the app's files in it (see vite.config.ts)
public/        icons and the web app manifest
e2e/           Playwright end-to-end tests
```

## Testing

```bash
npm run typecheck
npm test           # unit tests (Vitest)
npm run test:e2e   # browser tests (Playwright; builds and serves the app)
BROWSERS=chromium,firefox,webkit npm run test:e2e   # in other browsers too (install them with npx playwright install)
```

## Known limitations

- Dual (side-by-side) dialogue is imported as regular dialogue.
- The downloadable PDF shows Latin-alphabet text (in Courier, which covers Western European characters) and the five Indian scripts above. Accents Courier lacks are dropped (ő becomes o), and characters of other scripts (Bengali, Gujarati, Gurmukhi, Odia, Cyrillic, CJK, emoji and so on) print as “?”; the app warns you when this happens. To keep them, use **Preview → Print** and save as PDF, which uses the browser's fonts. Fountain, Final Draft and backup files keep every character.
- Bold and italic text in the Indian scripts is drawn by thickening and slanting the regular font, as browsers do.
- Revision marks and coloured revision pages, locked scene numbers and real-time collaboration are not implemented yet.
- Saving to a file needs Chrome or Edge. In other browsers, use **Back up all scripts** or export.
