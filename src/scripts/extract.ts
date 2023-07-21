/**
 * This content script is responsible for extracting and processing the text content from websites and PDFs.
 *
 * @module content-extractor
 * @category Content Script
 * @author Alberto García
 *  */

import { Readability, isProbablyReaderable } from "@mozilla/readability"
import { convert, type HtmlToTextOptions } from "html-to-text"
import { createStore } from "~store"
import * as pdfjsLib from "pdfjs-dist"
import type { TextItem } from "pdfjs-dist/types/src/display/api"
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter"
import { Storage } from "@plasmohq/storage"

// Define the current webpage's URL and a key to store it.
const url = window.location.href
const storageSiteKey = Buffer.from(url).toString("base64")
const pageStore = createStore(storageSiteKey, { chunks: [""], isParsing: true })

/**
 * Sets up the default options for text conversion.
 *
 * @notExported
 */
function getConvertOptions(): HtmlToTextOptions {
  const defaultHeaderOptions = {
    uppercase: false,
    trailingLineBreaks: 1,
    leadingLineBreaks: 2
  }

  const convertOptions = {
    wordwrap: null,
    selectors: [
      { selector: "a", options: { ignoreHref: true, noAnchorUrl: true } },
      { selector: "img", format: "skip" },
      { selector: "nav", format: "skip" },
      { selector: "ul", options: { itemPrefix: " " } },
      { selector: "p", options: { leadingLineBreaks: 1, trailingLineBreaks: 2 } },
      { selector: "pre", options: { leadingLineBreaks: 1, trailingLineBreaks: 1 } },
      ...Array.from({ length: 6 }, (_, i) => ({
        selector: `h${i + 1}`,
        options: defaultHeaderOptions
      }))
    ]
  }

  return convertOptions
}

/**
 * Extracts and processes the text content from a website.
 *
 * @notExported
 */
async function getWebsiteText() {
  let articleText: string

  if (isProbablyReaderable(document)) {
    const documentClone = document.cloneNode(true) as Document
    const article = new Readability(documentClone, { keepClasses: true }).parse()
    articleText = article?.content ? convert(article?.content, getConvertOptions()) : document.body.innerText
  } else {
    articleText = document.body.innerText
  }

  return saveSplitText(articleText)
}

/**
 * Extracts and processes the text content from a PDF.
 *
 * @notExported
 */
async function getPDFText() {
  pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL("/pdf.worker.min.js")
  const pdfDoc = await pdfjsLib.getDocument(url).promise
  const numPages = pdfDoc.numPages
  let pdfText = ""

  for (let i = 1; i <= numPages; i++) {
    const page = await pdfDoc.getPage(i)
    const textContent = await page.getTextContent({ includeMarkedContent: false })
    pdfText += textContent.items.map((item) => (item as TextItem).str).join(" ") + "\n\n"
    page.cleanup()
  }

  return saveSplitText(pdfText)
}

/**
 * Cleans up extra whitespace in the extracted text.
 *
 * @param text - Text to clean up.
 * @returns Text with cleaned up whitespaces.
 *
 * @notExported
 */
function cleanWhitespaces(text: string): string {
  const cleanedLines = text.split("\n").map((line) => line.trim().replace(/[^\S\n]{2,}/g, " "))
  const cleanedText = cleanedLines.join("\n").replace(/\n{3,}/g, "\n\n")

  return cleanedText
}

/**
 * Splits a given text into chunks and stores it.
 *
 * @param text - Text to split.
 *
 * @notExported
 */
async function saveSplitText(text: string) {
  const storage = new Storage()
  const chunkSize = Number(await storage.get("chunkSize"))
  const chunkOverlap = Math.min(20, Math.floor(chunkSize * 0.1))
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: chunkSize,
    chunkOverlap: chunkOverlap,
    separators: ["\n\n", "\n", " "]
  })

  const chunks = (await splitter.splitText(cleanWhitespaces(text)))
    .map((t) => t.replaceAll("\n", " "))
    .filter((c) => c.trim() !== "")

  await pageStore.set({ chunks: chunks, isParsing: false })
}

// Checks if the URL refers to a local file.
if (url.startsWith("file://")) {
  getWebsiteText().catch((e) => console.log("extract:", e))
} else {
  fetch(url, { method: "HEAD" }).then(
    (response) => {
      const contentType = response.headers.get("content-type")
      // Checks if the URL refers to a PDF.
      if (contentType?.includes("application/pdf")) {
        getPDFText().catch((e) => console.log("extract:", e))
      } else {
        // The content is processed when the document is fully loaded.
        if (document.readyState === "complete") {
          getWebsiteText().catch((e) => console.log("extract:", e))
        } else {
          window.onload = getWebsiteText
        }
      }
    },
    (error) => {
      console.log("extract:", error)
    }
  )
}
