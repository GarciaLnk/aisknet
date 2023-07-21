/**
 * This is the main entry point for the background service worker.
 * It initializes and sets up various utilities including storage, configuration values, and event listeners.
 *
 * @module background-entry
 * @category Background Service Worker
 * @author Alberto García
 */

import "@plasmohq/messaging/background"
import { ModelManager } from "~models"
import { embeddingIndexDB, status, heartbeat } from "~store"
import { Storage } from "@plasmohq/storage"
import { ModelTypes } from "~types"

// Instantiate the storage and model manager.
const storage = new Storage()
const modelManager = ModelManager.getInstance()

/**
 * Allow session storage access from untrusted contexts, including content scripts.
 *
 * @notExported
 */
function setStorageAccessLevel() {
  chrome.storage.session
    .setAccessLevel({
      accessLevel: "TRUSTED_AND_UNTRUSTED_CONTEXTS"
    })
    .catch((e) => console.log("bg:", e))
}

/**
 * Sets default storage values for a given key if it's not already present.
 *
 * @param key - Key to check in storage.
 * @param defaultValue - Default value to set if the key doesn't exist.
 *
 * @notExported
 */
async function setDefaultStorageValues(key: string, defaultValue: unknown) {
  if (!(await storage.get(key))) await storage.set(key, defaultValue)
}

/**
 * Downloads all necessary AI models, clearing any pre-existing embedding cache.
 *
 * @notExported
 */
async function downloadModels() {
  let currentStatus = await status.getStorage()

  await status.init()
  status.subscribe((value) => {
    currentStatus = value
  })
  await embeddingIndexDB.clear()
  await status.set({ ...currentStatus, isDownloading: true })

  setTimeout(() => {
    if (currentStatus.isDownloading) {
      status.set({ ...currentStatus, hasTimeout: true }).catch((e) => console.log("bg:", e))
    }
  }, 150000)

  await Promise.all(Object.values(ModelTypes).map((modelName) => modelManager.initModel(modelName)))
  await status.set({ ...currentStatus, isDownloading: false, hasTimeout: false })
}

/**
 * Sets the heartbeat timestamp to the current time to check if the bgsw is still running.
 *
 * @notExported
 */
function setHeartbeat() {
  const timestamp = Date.now()
  heartbeat.set(timestamp).catch((e) => console.log("bg:", e))
}

// Set storage.session access level.
if (process.env.PLASMO_BROWSER !== "firefox") setStorageAccessLevel()

// Initialize configuration values.
setDefaultStorageValues("chunkSize", 280).catch((e) => console.log("bg:", e))
setDefaultStorageValues("topK", 5).catch((e) => console.log("bg:", e))
modelManager.init().catch((e) => console.log("bg:", e))

// Sets up a timer to set the heartbeat timestamp every 5 seconds.
setHeartbeat()
setInterval(setHeartbeat, 5000)

// Sets up a listener to download models whenever the extension is installed or updated.
chrome.runtime.onInstalled.addListener(() => {
  downloadModels().catch((e) => console.log("bg:", e))
})

// Sets up a listener to reset the status on suspend.
chrome.runtime.onSuspend.addListener(() => {
  status.reset().catch((e) => console.log("bg:", e))
})
