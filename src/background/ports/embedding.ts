/**
 * This background script manages the extraction of embeddings from a given text data set.
 *
 * @remarks
 * It exports a message port handler function that performs embedding extraction on request.
 *
 * @module embeddings-generator
 * @category Background Service Worker
 * @author Alberto García
 */

import type { PlasmoMessaging } from "@plasmohq/messaging"
import { FeatureExtractionModel } from "@visheratin/web-ai/text"
import { ModelManager } from "~models"
import { embeddingIndexDB, error, progress, status, validateCache } from "~store"
import { ModelTypes } from "~types"
import type { CacheItem, Embedding } from "~types"

/**
 * Function to extract embeddings from a knowledge base (KB) using a given model.
 *
 * @param kb - An array of strings to process for embeddings.
 * @param modelEmbeddings - The model to use for embedding extraction.
 * @returns A promise that resolves to an array of embedding objects.
 *
 * @notExported
 */
async function processEmbeddings(kb: string[], modelEmbeddings: FeatureExtractionModel): Promise<Embedding[]> {
  const total = kb.length
  let processedSoFar = 0

  const processed = []
  for (const q of kb) {
    const processedItem = await modelEmbeddings.process(q)
    processedSoFar++
    await progress.set({ total, processed: processedSoFar })
    processed.push(processedItem)
  }

  return processed.map(({ result }, i) => ({
    id: String(i),
    text: kb[i],
    embeddings: result
  }))
}

/**
 * This is a message port handler responsible for processing and storing embeddings for a requested site.
 *
 * @remarks
 * It gets activated upon receiving a request, takes the knowledge base (KB) and site from the request body,
 * uses a model to process the KB and extract embeddings, creates a cache item, validates the cache,
 * and stores the embeddings in a database. Error handling and status updates are also managed within the handler.
 *
 * @param req - The request message object containing the body with the knowledge base and site.
 */
const handlerEmbeddings: PlasmoMessaging.PortHandler = async (req) => {
  const { kb, site } = req.body as { kb: string[]; site: string }

  if (kb.length === 1 && kb[0] === "") {
    await status.set({ ...(await status.getStorage()), isEmbedding: false })
    return
  }

  const start = performance.now()
  const modelManager = ModelManager.getInstance()

  try {
    const modelEmbeddings = await modelManager.initModel<FeatureExtractionModel>(ModelTypes.Embeddings)
    const data = await processEmbeddings(kb, modelEmbeddings)
    const item: CacheItem = {
      data: data,
      timestamp: Date.now()
    }

    await validateCache(data)
    await embeddingIndexDB.setItem(site, item)
    const end = performance.now()
    console.log(`Embeddings obtained in ${end - start} ms`)
    await error.set("")
  } catch (e) {
    console.log("answer:", e)
    e instanceof Error ? await error.set(e.message) : await error.set("Couldn't process embeddings.")

    // BUG: hard reload when the inference library accesses out of bounds memory
    setTimeout(() => {
      chrome.runtime.reload()
    }, 300)
  } finally {
    await status.set({ ...(await status.getStorage()), isEmbedding: false, hasTimeout: false })
  }
}

export default handlerEmbeddings
