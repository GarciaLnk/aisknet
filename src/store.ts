/**
 * This module provides utilities for managing the application state.
 *
 * @module store
 * @category Common
 * @author Alberto García
 */

import { writable, type Readable } from "svelte/store"
import { Storage } from "@plasmohq/storage"
import localForage from "localforage"
import type { CacheItem, Embedding } from "~types"

/**
 * Interface for representing a custom store that conforms to the Svelte store contract.
 * To be used within the application to sync the state among different contexts.
 */
export interface CustomStore<T> extends Readable<T> {
  destroy: () => Promise<void>
  getStorage: () => Promise<T>
  init: () => Promise<void>
  set: (value: T) => Promise<void>
  reset: () => Promise<void>
}

/**
 * Sets the storage area to be used.
 *
 * @returns The created storage object.
 *
 * @notExported
 */
const createStorage = () => {
  // BUG-FIREFOX: https://bugzilla.mozilla.org/show_bug.cgi?id=1687778
  return process.env.PLASMO_BROWSER === "firefox" ? new Storage({ area: "local" }) : new Storage({ area: "session" })
}

const storage = createStorage()

/**
 * Creates a store object conforming to the Svelte store contract.
 *
 * @param name - The name of the store.
 * @param def - The default value for the store.
 * @returns A store object with its corresponding methods.
 */
export function createStore<T>(name: string, def: T): CustomStore<T> {
  const { subscribe, set } = writable(def)

  return {
    subscribe,
    set: async (value: T) => {
      set(value)
      await storage.set(name, value)
    },
    reset: async () => {
      set(def)
      await storage.set(name, def)
    },
    init: async () => {
      const storedValue = (await storage.get(name)) ?? def
      storage.watch({
        [name]: (c) => {
          set(c.newValue as T)
        }
      })
      set(storedValue as T)
    },
    destroy: async () => {
      storage.unwatch({
        [name]: (c) => {
          set(c.newValue as T)
        }
      })
      await storage.remove(name)
    },
    getStorage: async () => {
      return (await storage.get(name)) ?? def
    }
  }
}

/**
 * Stores the state of the question.
 */
export const question = createStore("question", "")

/**
 * Stores the state of the prompt.
 */
export const prompt = createStore("prompt", "")

/**
 * Stores the state of the output.
 */
export const output = createStore("output", "")

/**
 * Stores the state of the stop flag.
 */
export const stop = createStore("stop", false)

/**
 * Stores the state of the error message.
 */
export const error = createStore("error", "")

/**
 * Stores the state of the status of the application.
 */
export const status = createStore("status", {
  isAnswering: false,
  isDownloading: false,
  isEmbedding: false,
  showStop: false,
  hasTimeout: false
})

/**
 * Stores the progress of the processed embeddings.
 */
export const progress = createStore("progress", {
  processed: 0,
  total: 0
})

/**
 * Stores the heartbeat timestamp of the bgsw.
 */
export const heartbeat = createStore("heartbeat", Date.now())

/**
 * A LocalForage instance to store the embeddings cache.
 */
export const embeddingIndexDB = localForage.createInstance({
  name: "AIskNet",
  storeName: "embeddings"
})

/**
 * This function validates the cache by checking size and age.
 *
 * @remarks
 * If a cache item is too old, it's removed.
 * If the cache is too big, oldest items are removed until the cache is small enough.
 *
 * @param embedIndex - An optional array of embeddings.
 */
export async function validateCache(embedIndex?: Embedding[]) {
  const maxCacheSize = 200 * 1024 * 1024 // 200 MB in bytes
  const maxCacheAge = 1000 * 60 * 10 // 10 minutes in milliseconds
  const cacheItemSizes = new Map<string, number>()
  const currentTime = Date.now()
  let cacheSize = 0

  await embeddingIndexDB.iterate(async (item: CacheItem, key: string) => {
    if (currentTime - item.timestamp > maxCacheAge) {
      await embeddingIndexDB.removeItem(key)
    } else if (embedIndex) {
      const dataLength = new TextEncoder().encode(JSON.stringify(item.data)).byteLength

      cacheSize += dataLength
      cacheItemSizes.set(key, dataLength)
    }
  })

  if (!embedIndex) return

  let newCacheSize = cacheSize + new TextEncoder().encode(JSON.stringify(embedIndex)).byteLength
  while (newCacheSize > maxCacheSize) {
    const [key, size] = cacheItemSizes.entries().next().value as [string, number]

    cacheItemSizes.delete(key)
    newCacheSize -= size
    await embeddingIndexDB.removeItem(key)
  }
}
