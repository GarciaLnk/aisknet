/**
 * This module is responsible for managing AI models and the factories that create them.
 *
 * @module models
 * @category Common
 * @author Alberto García
 */

import { SessionParams } from "@visheratin/web-ai"
import { FeatureExtractionModel, Seq2SeqModel, ModelType, type TextMetadata } from "@visheratin/web-ai/text"
import { Storage } from "@plasmohq/storage"
import { error } from "~store"
import { ModelTypes, type ModelList } from "~types"

/**
 * This abstract class is a factory pattern for AI models.
 *
 * @notExported
 */
abstract class ModelFactory<T> {
  /**
   * Abstract method to create a model of type T
   *
   * @param modelPath - The model metadata that includes information like its ID, type, size etc.
   */
  abstract createModel(modelPath: TextMetadata): T
}

/**
 * This class extends ModelFactory for Seq2Seq models.
 *
 * @notExported
 */
class SeqModelFactory extends ModelFactory<Seq2SeqModel> {
  /**
   * Method to create a Seq2SeqModel.
   *
   * @param modelPath - The model metadata that includes information like its ID, type, size etc.
   * @returns Seq2SeqModel
   */
  createModel(modelPath: TextMetadata): Seq2SeqModel {
    return new Seq2SeqModel(modelPath)
  }
}

/**
 * This class extends ModelFactory for TextFeatureExtraction models.
 *
 * @notExported
 */
class FeatureModelFactory extends ModelFactory<FeatureExtractionModel> {
  /**
   * Method to create a FeatureExtractionModel.
   *
   * @param modelPath - The model metadata that includes information like its ID, type, size etc.
   * @returns FeatureExtractionModel
   */
  createModel(modelPath: TextMetadata): FeatureExtractionModel {
    return new FeatureExtractionModel(modelPath)
  }
}

/**
 * The ModelManager class is responsible for managing the different AI models, their creation and their initialization.
 */
export class ModelManager {
  private static instance: ModelManager
  private storage = new Storage()
  private defaultEmbeddingsModel = "multi-qa-MiniLM-L6-cos-v1-quantized"
  private defaultAnswerModel = "LaMini-Flan-T5-248M-quantized"
  private defaultHydeModel = "LaMini-Flan-T5-77M-quantized"

  private models: {
    [ModelTypes.Embeddings]: [FeatureExtractionModel, string]
    [ModelTypes.Answer]: [Seq2SeqModel, string]
    [ModelTypes.Hyde]: [Seq2SeqModel, string]
  } = {
    [ModelTypes.Embeddings]: [
      new FeatureModelFactory().createModel(this.findModelById(this.defaultEmbeddingsModel)),
      this.defaultEmbeddingsModel
    ],
    [ModelTypes.Answer]: [
      new SeqModelFactory().createModel(this.findModelById(this.defaultAnswerModel)),
      this.defaultAnswerModel
    ],
    [ModelTypes.Hyde]: [
      new SeqModelFactory().createModel(this.findModelById(this.defaultHydeModel)),
      this.defaultHydeModel
    ]
  }

  /**
   * Method to initialize the model manager by setting default models and saving model lists into storage.
   */
  public async init() {
    if (!(await this.storage.get(ModelTypes.Embeddings))) {
      await this.storage.set(ModelTypes.Embeddings, this.defaultEmbeddingsModel)
    }

    if (!(await this.storage.get(ModelTypes.Answer))) {
      await this.storage.set(ModelTypes.Answer, this.defaultAnswerModel)
    }

    if (!(await this.storage.get(ModelTypes.Hyde))) {
      await this.storage.set(ModelTypes.Hyde, this.defaultHydeModel)
    }

    const modelList: ModelList = {
      embeddingModels: this.filterModels(ModelType.FeatureExtraction).map((m) => ({
        id: m.id,
        sizeMB: m.sizeMB ?? 0
      })),
      answerModels: this.filterModels(ModelType.Seq2Seq).map((m) => ({
        id: m.id,
        sizeMB: m.sizeMB ?? 0
      }))
    }

    await this.storage.set("modelList", modelList)
  }

  /**
   * Method to get the singleton instance of the ModelManager.
   *
   * @returns ModelManager instance.
   */
  public static getInstance(): ModelManager {
    if (!ModelManager.instance) ModelManager.instance = new ModelManager()

    return ModelManager.instance
  }

  /**
   * Method to find a model by its ID.
   *
   * @param id - ID of the model.
   * @returns Model metadata
   *
   * @throws Error if the model is not found.
   */
  findModelById(id: string): TextMetadata {
    const model = modelList.find((m) => m.id === id)

    if (!model) {
      throw new Error("Model not found")
    } else {
      return model
    }
  }

  /**
   * Method to filter models by their type.
   *
   * @param type - Type of the models to filter.
   * @returns Array of models of the specified type.
   */
  filterModels(type: ModelType): TextMetadata[] {
    return modelList
      .filter((m) => m.type === type)
      .sort((a, b) => {
        return (a.sizeMB ?? 0) - (b.sizeMB ?? 0)
      })
  }

  /**
   * Method to set session parameters.
   */
  setSessionParams() {
    SessionParams.numThreads = 1
    SessionParams.cacheSizeMB = 800
    SessionParams.wasmRoot = "/assets/"
    SessionParams.tokenizersPath = new URL(
      "@visheratin/tokenizers/tokenizers_wasm_bg.wasm",
      import.meta.url
    ).href.split("?")[0]
  }

  /**
   * Method to initialize a model.
   *
   * @param modelType - Type of the model to be initialized.
   * @returns Initialized model.
   */
  async initModel<T extends FeatureExtractionModel | Seq2SeqModel>(modelType: ModelTypes): Promise<T> {
    const currModel = await this.storage.get(modelType)

    if (currModel && currModel !== this.models[modelType][1]) {
      this.models[modelType][1] = currModel
      if (modelType === ModelTypes.Embeddings) {
        this.models[modelType][0] = new FeatureModelFactory().createModel(this.findModelById(currModel))
      } else {
        this.models[modelType][0] = new SeqModelFactory().createModel(this.findModelById(currModel))
      }
    }

    this.setSessionParams()
    await this.models[modelType][0]
      .init()
      .catch(() => error.set("Failed to initialize model").catch((e) => console.log("models:", e)))

    return this.models[modelType][0] as T
  }
}

/**
 * List of models to be used.
 *
 * @notExported
 */
const modelList: TextMetadata[] = [
  {
    id: "flan-t5-small-quantized",
    title: "FLAN-T5 small (quantized)",
    description: "",
    type: ModelType.Seq2Seq,
    sizeMB: 72,
    memEstimateMB: 330,
    modelPaths: new Map<string, string>([
      ["encoder", "https://models.aisknet.com/flan-t5-small/encoder_model_quantized.onnx.gz"],
      ["decoder", "https://models.aisknet.com/flan-t5-small/decoder_model_quantized.onnx.gz"]
    ]),
    outputNames: new Map<string, string>([
      ["encoder", "last_hidden_state"],
      ["decoder", "logits"]
    ]),
    tokenizerPath: "/assets/tokenizer-flan-t5.json",
    tokenizerParams: {
      bosTokenID: 0,
      eosTokenID: 1,
      padTokenID: 0
    },
    tags: ["general", "t5-flan"],
    referenceURL: "https://huggingface.co/google/flan-t5-small"
  },
  {
    id: "flan-t5-small",
    title: "FLAN-T5 small",
    description: "",
    type: ModelType.Seq2Seq,
    sizeMB: 346,
    memEstimateMB: 900,
    modelPaths: new Map<string, string>([
      ["encoder", "https://models.aisknet.com/flan-t5-small/encoder_model.onnx.gz"],
      ["decoder", "https://models.aisknet.com/flan-t5-small/decoder_model.onnx.gz"]
    ]),
    outputNames: new Map<string, string>([
      ["encoder", "last_hidden_state"],
      ["decoder", "logits"]
    ]),
    tokenizerPath: "/assets/tokenizer-flan-t5.json",
    tokenizerParams: {
      bosTokenID: 0,
      eosTokenID: 1,
      padTokenID: 0
    },
    tags: ["general", "t5-flan"],
    referenceURL: "https://huggingface.co/google/flan-t5-small"
  },
  {
    id: "LaMini-Flan-T5-77M-quantized",
    title: "LaMini-Flan-T5-77M (quantized)",
    description: "",
    type: ModelType.Seq2Seq,
    sizeMB: 72,
    memEstimateMB: 330,
    modelPaths: new Map<string, string>([
      ["encoder", "https://models.aisknet.com/LaMini-Flan-T5-77M/encoder_model_quantized.onnx.gz"],
      ["decoder", "https://models.aisknet.com/LaMini-Flan-T5-77M/decoder_model_quantized.onnx.gz"]
    ]),
    outputNames: new Map<string, string>([
      ["encoder", "last_hidden_state"],
      ["decoder", "logits"]
    ]),
    tokenizerPath: "/assets/tokenizer-flan-t5.json",
    tokenizerParams: {
      bosTokenID: 0,
      eosTokenID: 1,
      padTokenID: 0
    },
    tags: ["general", "t5-flan"],
    referenceURL: "https://huggingface.co/MBZUAI/LaMini-Flan-T5-77M"
  },
  {
    id: "LaMini-Flan-T5-77M",
    title: "LaMini-Flan-T5-77M",
    description: "",
    type: ModelType.Seq2Seq,
    sizeMB: 346,
    memEstimateMB: 900,
    modelPaths: new Map<string, string>([
      ["encoder", "https://models.aisknet.com/LaMini-Flan-T5-77M/encoder_model.onnx.gz"],
      ["decoder", "https://models.aisknet.com/LaMini-Flan-T5-77M/decoder_model.onnx.gz"]
    ]),
    outputNames: new Map<string, string>([
      ["encoder", "last_hidden_state"],
      ["decoder", "logits"]
    ]),
    tokenizerPath: "/assets/tokenizer-flan-t5.json",
    tokenizerParams: {
      bosTokenID: 0,
      eosTokenID: 1,
      padTokenID: 0
    },
    tags: ["general", "t5-flan"],
    referenceURL: "https://huggingface.co/MBZUAI/LaMini-Flan-T5-77M"
  },
  {
    id: "flan-t5-base-quantized",
    title: "FLAN-T5 base (quantized)",
    description: "",
    type: ModelType.Seq2Seq,
    sizeMB: 213,
    memEstimateMB: 800,
    modelPaths: new Map<string, string>([
      ["encoder", "https://models.aisknet.com/flan-t5-base/encoder_model_quantized.onnx.gz"],
      ["decoder", "https://models.aisknet.com/flan-t5-base/decoder_model_quantized.onnx.gz"]
    ]),
    outputNames: new Map<string, string>([
      ["encoder", "last_hidden_state"],
      ["decoder", "logits"]
    ]),
    tokenizerPath: "/assets/tokenizer-flan-t5.json",
    tokenizerParams: {
      bosTokenID: 0,
      eosTokenID: 1,
      padTokenID: 0
    },
    tags: ["general", "t5-flan"],
    referenceURL: "https://huggingface.co/google/flan-t5-base"
  },
  {
    id: "flan-alpaca-base-quantized",
    title: "FLAN-Alpaca base (quantized)",
    description: "",
    type: ModelType.Seq2Seq,
    sizeMB: 213,
    memEstimateMB: 800,
    modelPaths: new Map<string, string>([
      ["encoder", "https://models.aisknet.com/flan-alpaca-base/encoder_model_quantized.onnx.gz"],
      ["decoder", "https://models.aisknet.com/flan-alpaca-base/decoder_model_quantized.onnx.gz"]
    ]),
    outputNames: new Map<string, string>([
      ["encoder", "last_hidden_state"],
      ["decoder", "logits"]
    ]),
    tokenizerPath: "/assets/tokenizer-flan-t5.json",
    tokenizerParams: {
      bosTokenID: 0,
      eosTokenID: 1,
      padTokenID: 0
    },
    tags: ["general", "t5-flan"],
    referenceURL: "https://huggingface.co/declare-lab/flan-alpaca-base"
  },
  {
    id: "LaMini-Flan-T5-248M-quantized",
    title: "LaMini-Flan-T5-248M (quantized)",
    description: "",
    type: ModelType.Seq2Seq,
    sizeMB: 213,
    memEstimateMB: 800,
    modelPaths: new Map<string, string>([
      ["encoder", "https://models.aisknet.com/LaMini-Flan-T5-248M/encoder_model_quantized.onnx.gz"],
      ["decoder", "https://models.aisknet.com/LaMini-Flan-T5-248M/decoder_model_quantized.onnx.gz"]
    ]),
    outputNames: new Map<string, string>([
      ["encoder", "last_hidden_state"],
      ["decoder", "logits"]
    ]),
    tokenizerPath: "/assets/tokenizer-flan-t5.json",
    tokenizerParams: {
      bosTokenID: 0,
      eosTokenID: 1,
      padTokenID: 0
    },
    tags: ["general", "t5-flan"],
    referenceURL: "https://huggingface.co/MBZUAI/LaMini-Flan-T5-248M"
  },
  {
    id: "flan-t5-large-quantized",
    title: "FLAN-T5 large (quantized)",
    description: "",
    type: ModelType.Seq2Seq,
    sizeMB: 640,
    memEstimateMB: 1530,
    modelPaths: new Map<string, string>([
      ["encoder", "https://models.aisknet.com/flan-t5-large/encoder_model_quantized.onnx.gz"],
      ["decoder", "https://models.aisknet.com/flan-t5-large/decoder_model_quantized.onnx.gz"]
    ]),
    outputNames: new Map<string, string>([
      ["encoder", "last_hidden_state"],
      ["decoder", "logits"]
    ]),
    tokenizerPath: "/assets/tokenizer-flan-t5.json",
    tokenizerParams: {
      bosTokenID: 0,
      eosTokenID: 1,
      padTokenID: 0
    },
    tags: ["general", "t5-flan"],
    referenceURL: "https://huggingface.co/google/flan-t5-large"
  },
  {
    id: "LaMini-Flan-T5-783M-quantized",
    title: "LaMini-Flan-T5-783M (quantized)",
    description: "",
    type: ModelType.Seq2Seq,
    sizeMB: 640,
    memEstimateMB: 1530,
    modelPaths: new Map<string, string>([
      ["encoder", "https://models.aisknet.com/LaMini-Flan-T5-783M/encoder_model_quantized.onnx.gz"],
      ["decoder", "https://models.aisknet.com/LaMini-Flan-T5-783M/decoder_model_quantized.onnx.gz"]
    ]),
    outputNames: new Map<string, string>([
      ["encoder", "last_hidden_state"],
      ["decoder", "logits"]
    ]),
    tokenizerPath: "/assets/tokenizer-flan-t5.json",
    tokenizerParams: {
      bosTokenID: 0,
      eosTokenID: 1,
      padTokenID: 0
    },
    tags: ["general", "t5-flan"],
    referenceURL: "https://huggingface.co/MBZUAI/LaMini-Flan-T5-783M"
  },
  {
    id: "all-mpnet-base-v2-quantized",
    title: "all-mpnet-base-v2 (quantized)",
    description: "",
    memEstimateMB: 200,
    type: ModelType.FeatureExtraction,
    sizeMB: 80,
    modelPaths: new Map<string, string>([
      ["encoder", "https://models.aisknet.com/all-mpnet-base-v2/model_quantized.onnx.gz"]
    ]),
    outputNames: new Map<string, string>([["encoder", "last_hidden_state"]]),
    tokenizerPath: "https://models.aisknet.com/tokenizers/mpnet-tokenizer.json",
    tokenizerParams: {
      bosTokenID: 0,
      eosTokenID: 2,
      padTokenID: 1
    },
    tags: ["feature-extraction", "mpnet"],
    referenceURL: "https://huggingface.co/sentence-transformers/all-mpnet-base-v2"
  },
  {
    id: "multi-qa-mpnet-base-cos-v1-quantized",
    title: "multi-qa-mpnet-base-cos-v1 (quantized)",
    description: "",
    memEstimateMB: 200,
    type: ModelType.FeatureExtraction,
    sizeMB: 80,
    modelPaths: new Map<string, string>([
      ["encoder", "https://models.aisknet.com/multi-qa-mpnet-base-cos-v1/model_quantized.onnx.gz"]
    ]),
    outputNames: new Map<string, string>([["encoder", "last_hidden_state"]]),
    tokenizerPath: "https://models.aisknet.com/tokenizers/qa-mpnet-tokenizer.json",
    tokenizerParams: {
      bosTokenID: 0,
      eosTokenID: 2,
      padTokenID: 1
    },
    tags: ["feature-extraction", "mpnet"],
    referenceURL: "https://huggingface.co/sentence-transformers/multi-qa-mpnet-base-cos-v1"
  },
  {
    id: "all-miniLM-l12-v2",
    title: "all-MiniLM-L12-v2",
    description: "",
    memEstimateMB: 430,
    type: ModelType.FeatureExtraction,
    sizeMB: 122,
    modelPaths: new Map<string, string>([["encoder", "https://models.aisknet.com/all-MiniLM-L12-v2/model.onnx.gz"]]),
    outputNames: new Map<string, string>([["encoder", "last_hidden_state"]]),
    tokenizerPath: "/assets/tokenizer-minilm.json",
    tokenizerParams: {
      padTokenID: 0
    },
    tags: ["feature-extraction", "bert"],
    referenceURL: "https://huggingface.co/sentence-transformers/all-MiniLM-L12-v2"
  },
  {
    id: "all-miniLM-l12-v2-quantized",
    title: "all-MiniLM-L12-v2 (quantized)",
    description: "",
    memEstimateMB: 330,
    type: ModelType.FeatureExtraction,
    sizeMB: 24,
    modelPaths: new Map<string, string>([
      ["encoder", "https://models.aisknet.com/all-MiniLM-L12-v2/model_quantized.onnx.gz"]
    ]),
    outputNames: new Map<string, string>([["encoder", "last_hidden_state"]]),
    tokenizerPath: "/assets/tokenizer-minilm.json",
    tokenizerParams: {
      padTokenID: 0
    },
    tags: ["feature-extraction", "bert"],
    referenceURL: "https://huggingface.co/sentence-transformers/all-MiniLM-L12-v2"
  },
  {
    id: "all-miniLM-l6-v2",
    title: "all-MiniLM-L6-v2",
    description: "",
    memEstimateMB: 340,
    type: ModelType.FeatureExtraction,
    sizeMB: 83,
    modelPaths: new Map<string, string>([["encoder", "https://models.aisknet.com/all-MiniLM-L6-v2/model.onnx.gz"]]),
    outputNames: new Map<string, string>([["encoder", "last_hidden_state"]]),
    tokenizerPath: "/assets/tokenizer-minilm.json",
    tokenizerParams: {
      padTokenID: 0
    },
    tags: ["feature-extraction", "bert"],
    referenceURL: "https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2"
  },
  {
    id: "all-miniLM-l6-v2-quantized",
    title: "all-MiniLM-L6-v2 (quantized)",
    description: "",
    memEstimateMB: 170,
    type: ModelType.FeatureExtraction,
    sizeMB: 17,
    modelPaths: new Map<string, string>([
      ["encoder", "https://models.aisknet.com/all-MiniLM-L6-v2/model_quantized.onnx.gz"]
    ]),
    outputNames: new Map<string, string>([["encoder", "last_hidden_state"]]),
    tokenizerPath: "/assets/tokenizer-minilm.json",
    tokenizerParams: {
      padTokenID: 0
    },
    tags: ["feature-extraction", "bert"],
    referenceURL: "https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2"
  },
  {
    id: "multi-qa-MiniLM-L6-cos-v1",
    title: "multi-qa-MiniLM-L6-cos-v1",
    description: "",
    memEstimateMB: 340,
    type: ModelType.FeatureExtraction,
    sizeMB: 83,
    modelPaths: new Map<string, string>([
      ["encoder", "https://models.aisknet.com/multi-qa-MiniLM-L6-cos-v1/model.onnx.gz"]
    ]),
    outputNames: new Map<string, string>([["encoder", "last_hidden_state"]]),
    tokenizerPath: "/assets/tokenizer-minilm.json",
    tokenizerParams: {
      padTokenID: 0
    },
    tags: ["feature-extraction", "bert"],
    referenceURL: "https://huggingface.co/sentence-transformers/multi-qa-MiniLM-L6-cos-v1"
  },
  {
    id: "multi-qa-MiniLM-L6-cos-v1-quantized",
    title: "multi-qa-MiniLM-L6-cos-v1 (quantized)",
    description: "",
    memEstimateMB: 170,
    type: ModelType.FeatureExtraction,
    sizeMB: 17,
    modelPaths: new Map<string, string>([
      ["encoder", "https://models.aisknet.com/multi-qa-MiniLM-L6-cos-v1/model_quantized.onnx.gz"]
    ]),
    outputNames: new Map<string, string>([["encoder", "last_hidden_state"]]),
    tokenizerPath: "/assets/tokenizer-minilm.json",
    tokenizerParams: {
      padTokenID: 0
    },
    tags: ["feature-extraction", "bert"],
    referenceURL: "https://huggingface.co/sentence-transformers/multi-qa-MiniLM-L6-cos-v1"
  },
  {
    id: "gtr-t5-base-quantized",
    title: "GTR-T5 base (quantized)",
    description: "",
    memEstimateMB: 400,
    type: ModelType.FeatureExtraction,
    sizeMB: 82,
    modelPaths: new Map<string, string>([
      ["encoder", "https://models.aisknet.com/gtr-t5-base/model_quantized.onnx.gz"],
      ["dense", "https://models.aisknet.com/gtr-t5-base/model_dense_quantized.onnx.gz"]
    ]),
    outputNames: new Map<string, string>([["encoder", "hidden_states"]]),
    tokenizerPath: "https://models.aisknet.com/tokenizers/gtr-t5-tokenizer.json",
    tokenizerParams: {
      bosTokenID: 0,
      eosTokenID: 1,
      padTokenID: 0
    },
    tags: ["feature-extraction", "t5"],
    referenceURL: "https://huggingface.co/sentence-transformers/gtr-t5-base"
  }
]
