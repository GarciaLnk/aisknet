/**
 * This background script contains a message handler that interacts with an AI model to answer user queries.
 *
 * @remarks
 * It performs similarity searches, sends the context to a content script and saves the answers in the storage.
 *
 * @module answer-generator
 * @category Background Service Worker
 * @author Alberto García
 */

import { sendToContentScript, type PlasmoMessaging } from "@plasmohq/messaging"
import { Storage } from "@plasmohq/storage"
import { FeatureExtractionModel, Seq2SeqModel } from "@visheratin/web-ai/text"
import { ModelManager } from "~models"
import { embeddingIndexDB, error, output, prompt, status, stop } from "~store"
import { ModelTypes } from "~types"
import type { CacheItem, Embedding, NearestResult } from "~types"
import { similarity } from "ml-distance"

/**
 * Perform similarity search over an array of embeddings and return the `k` nearest results.
 *
 * @param index - An array of embedding objects where each object contains its id, text, and embeddings vector.
 * @param query - Embeddings vector of the query.
 * @param k - Number of nearest neighbors to return.
 * @returns An array of the nearest results where each result contains the id, text, and similarity score.
 *
 * @notExported
 */
function similaritySearch(index: Embedding[], query: number[], k: number): NearestResult[] {
  const searches = index
    .map((vector, idx) => ({
      similarity: similarity.cosine(query, vector.embeddings),
      idx
    }))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, k)

  const result = searches.map((search) => ({
    id: index[search.idx].id,
    text: index[search.idx].text,
    score: search.similarity
  }))

  return result
}

/**
 * This is a message port handler responsible for processing incomings question requests.
 *
 * @remarks
 * It is triggered upon receiving a request message and takes in the question and site as input.
 *
 * The handler then leverages several AI models to perform several actions including:
 * 1) Extracting embeddings from the question.
 * 2) Searching for the most similar embeddings in the context.
 * 3) Sending the nearest matches to the highlighter content script.
 * 4) Preparing and setting a prompt.
 * 5) Generating an answer and stream the output.
 * 6) Handling errors and reloading when necessary.
 *
 * @param req - The request message object containing the body with question and site.
 */
const handlerAnswer: PlasmoMessaging.PortHandler = async (req) => {
  const { question, site } = req.body as { question: string; site: string }
  const start = performance.now()
  const modelManager = ModelManager.getInstance()

  try {
    const embedIndex = (await embeddingIndexDB.getItem(site)) as CacheItem

    let currentPrompt = question
    let currentOutput = ""
    let context = ""
    let currStop = await stop.getStorage()

    await stop.init()
    stop.subscribe((value) => {
      currStop = value
    })

    if (embedIndex?.data?.length > 0) {
      const storage = new Storage()
      const topK = Number(await storage.get("topK"))
      const modelHyde = await modelManager.initModel<Seq2SeqModel>(ModelTypes.Hyde)
      const hyde = (await modelHyde.process(question + " Short answer:")).text.join("\n\n")
      const modelEmbeddings = await modelManager.initModel<FeatureExtractionModel>(ModelTypes.Embeddings)
      const q = await modelEmbeddings.process(question + "\n" + hyde)
      const nearests = similaritySearch(embedIndex.data, q.result as number[], topK)

      sendToContentScript({ name: "highlight", body: { nearests: nearests } }).catch((e) => console.log("answer:", e))
      context = nearests.map((n, idx) => `${idx + 1}) ${n.text}${n.text.endsWith(".") ? "" : "."}`).join("\n\n")
    }

    if (context !== "") currentPrompt = `Context:\n\n${context}\n\nQuestion: ${question}\nAnswer:`
    await prompt.set(currentPrompt)

    const modelAnswer = await modelManager.initModel<Seq2SeqModel>(ModelTypes.Answer)
    await status.set({ ...(await status.getStorage()), showStop: true })
    for await (const pieces of modelAnswer.processStream(currentPrompt)) {
      if (currStop) break
      pieces.forEach((piece) => {
        currentOutput = currentOutput.concat(piece)
      })
      currentOutput = currentOutput.replace(" .", ".")
      await output.set(currentOutput)
    }

    const end = performance.now()
    console.log(`Answer found in ${end - start} ms`)
    await stop.set(false)
    await error.set("")
  } catch (e) {
    console.log("answer:", e)
    e instanceof Error ? await error.set(e.message) : await error.set("Couldn't find an answer.")

    // BUG: hard reload when the inference library accesses out of bounds memory
    setTimeout(() => {
      chrome.runtime.reload()
    }, 300)
  } finally {
    await status.set({ ...(await status.getStorage()), isAnswering: false, showStop: false, hasTimeout: false })
  }
}

export default handlerAnswer
