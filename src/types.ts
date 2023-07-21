/**
 * This module defines several TypeScript types and interfaces that are used across the application.
 *
 * @module types
 * @category Common
 * @author Alberto García
 */

/**
 * Enum for identifying different types of models.
 */
export enum ModelTypes {
  Answer = "answerModel",
  Embeddings = "embeddingsModel",
  Hyde = "hydeModel"
}

/**
 * Interface for representing relevant information of a model.
 */
export interface ModelInfo {
  id: string
  sizeMB: number
}

/**
 * Interface for representing a list of models.
 */
export interface ModelList {
  answerModels: ModelInfo[]
  embeddingModels: ModelInfo[]
}

/**
 * Interface for representing the result of a nearest neighbor search of embeddings.
 */
export interface NearestResult {
  id: string
  text: string
  score: number
}

/**
 * Interface for representing a message to be sent to the highlight content script.
 */
export interface HighlightMessage {
  body: {
    nearests: NearestResult[]
  }
}

/**
 * Interface for representing an embedding object.
 */
export interface Embedding {
  id: string
  text: string
  embeddings: number[] | number[][]
}

/**
 * Interface for representing an item of the embeddings cache.
 */
export interface CacheItem {
  data: Embedding[]
  timestamp: number
}

/**
 * Interface for representing the status of the page embeddings.
 */
export interface PageStatus {
  chunks: string[]
  isParsing: boolean
}
