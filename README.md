# AIskNet

This project aims to develop a browser extension that runs AI models locally on the browser to answer questions about the content of the page the user is visiting.

## Installation

The extension is available for Chrome, Firefox and Edge. You can install it from the following links:

- [Google Chrome](https://chrome.google.com/webstore/detail/aisknet/liibjfofhopeoojijndnphmgkgfpcfbm)
- [Mozilla Firefox](https://addons.mozilla.org/en-US/firefox/addon/aisknet/)
- [Microsoft Edge](https://microsoftedge.microsoft.com/addons/detail/aisknet/ljpkncjbemlcgopfnaijpdfnkcdcnlpj)

## Usage

Upon installation, the extension downloads the models, after its done you can start using it by clicking on the extension icon or by pressing `Alt+A`. A popup will appear with a text input where you can write your question. After writing your question, press `Enter` or click on the `Sumbmit` button to get the answer.

A few settings can be changed after pressing the `Settings` button. These are the following:

- Embeddings model: the embeddings model to use to embed the text extracted from the websites into vector embeddings. The default is `multi-qa-MiniLM-L6-cos-v1-quantized`.
- Main generative model: the generative model used to generate an answer given a context. The default is `LaMini-Flan-T5-248M-quantized`.
- Secondary generative model: the generative model used to generate a temporary answer without context, useful to find more relevant embeddings. The default is `LaMini-Flan-T5-77M-quantized`.
- Chunk size: the number of characters to use when splitting up the text extracted from the websites to be saved into embeddings. The default is `280`.
- Results number: the number of embeddings to return from the similarity search to be used as a context to answer the question. The default is `5`.

## Environment Setup

Install Node.js through [fnm](https://github.com/Schniz/fnm#installation) and [pnpm](https://pnpm.io/installation#using-a-standalone-script).

```bash
curl -fsSL https://fnm.vercel.app/install | bash
curl -fsSL https://get.pnpm.io/install.sh | sh -
fnm use
```

Install the project dependencies:

```bash
pnpm install
```

## Developing

Start a development server:

```bash
pnpm dev
```

Open your browser and load the appropriate development build. For example, if you are developing for the chrome browser, using manifest v3, use: `build/chrome-mv3-dev`.

## Building

To create a production version of the extension, run the following:

```bash
pnpm build
```

This should create a production bundle for the extension, ready to be zipped and published to the stores. The builds can be packaged into zip files with `pnpm package`.

## Authors

- Alberto García (<alberto@garcialnk.com>)
