/** A wrapped line, as [start, end) offsets into the source text (trailing spaces excluded). */
export interface LineRange {
  start: number
  end: number
}

/**
 * Greedy word wrap for a monospace font. Honours `\n` as a forced break and
 * hard-breaks words longer than the line width. Always returns at least one line.
 */
export function wrapText(text: string, width: number): LineRange[] {
  const lines: LineRange[] = []
  const w = Math.max(1, width)
  let paraStart = 0
  while (paraStart <= text.length) {
    let paraEnd = text.indexOf('\n', paraStart)
    if (paraEnd === -1) paraEnd = text.length
    wrapParagraph(text, paraStart, paraEnd, w, lines)
    paraStart = paraEnd + 1
  }
  return lines
}

function wrapParagraph(text: string, from: number, to: number, width: number, out: LineRange[]) {
  let lineStart = from
  // Skip leading spaces on wrapped continuation lines, but keep indentation on the first line.
  if (lineStart >= to) {
    out.push({ start: from, end: from })
    return
  }
  while (lineStart < to) {
    if (to - lineStart <= width) {
      out.push({ start: lineStart, end: trimEnd(text, lineStart, to) })
      return
    }
    // Find the last space within [lineStart, lineStart + width].
    let breakAt = -1
    for (let i = lineStart + width; i > lineStart; i--) {
      if (text[i] === ' ') {
        breakAt = i
        break
      }
    }
    let next: number
    if (breakAt === -1) {
      // Long word: hard break (or break after a hyphen if there is one).
      let hyphen = -1
      for (let i = lineStart + width - 1; i > lineStart; i--) {
        if (text[i] === '-') {
          hyphen = i
          break
        }
      }
      const end = hyphen !== -1 ? hyphen + 1 : lineStart + width
      out.push({ start: lineStart, end })
      next = end
    } else {
      out.push({ start: lineStart, end: trimEnd(text, lineStart, breakAt) })
      next = breakAt
    }
    while (next < to && text[next] === ' ') next++
    lineStart = next
  }
}

function trimEnd(text: string, start: number, end: number): number {
  let e = end
  while (e > start && text[e - 1] === ' ') e--
  return e
}

