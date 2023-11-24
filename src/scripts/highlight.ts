/**
 * This content script is responsible for highlighting text on a webpage.
 *
 * @module content-highlighter
 * @category Content Script
 * @author Alberto García
 */

import type { HighlightMessage, NearestResult } from "~types"
import Mark from "mark.js"

/**
 * This function is responsible for highlighting the given elements on the webpage.
 *
 * @param markInstance - An instance of Mark.js.
 * @param nearest - The object containing the result to be highlighted and its score.
 * @param idx - The index of the current result being highlighted.
 * @param total - The total number of elements to highlight.
 *
 * @notExported
 */
function markElements(markInstance: Mark, nearest: NearestResult, idx: number, total: number) {
  const greenValue = Math.min(70 + Math.floor((idx / total) * 28), 99)
  const color = `hsl(120, 60%, ${greenValue}%)`
  const options = {
    separateWordSearch: false,
    acrossElements: true,
    ignoreJoiners: true
  }

  markInstance.mark(nearest.text, {
    ...options,
    each: (el: HTMLElement) => {
      el.style.backgroundColor = color
      el.title = "Score: " + (nearest.score * 100).toFixed(2) + "%"
    }
  })

  if (idx === 0) document.querySelector("mark")?.scrollIntoView({ behavior: "smooth" })
}

// Listens for highlight messages sent to this content script.
chrome.runtime.onMessage.addListener((request: HighlightMessage) => {
  const markInstance = new Mark(document.body)

  markInstance.unmark()
  request.body.nearests.forEach((nearest, idx) =>
    markElements(markInstance, nearest, idx, request.body.nearests.length)
  )
})
