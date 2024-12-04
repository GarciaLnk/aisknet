<!--
  Svelte component for the extension popup.
  The component interfaces with background processes using messaging ports, and uses local storage for persistence.
-->

<script lang="ts">
  import { getPort } from "@plasmohq/messaging/port"
  import { onDestroy, onMount } from "svelte"
  import "~style.css"
  import { Storage } from "@plasmohq/storage"
  import {
    createStore,
    embeddingIndexDB,
    error,
    heartbeat,
    output,
    progress,
    prompt,
    question,
    status,
    stop,
    validateCache
  } from "~store"
  import { ModelTypes, type ModelList, type PageStatus } from "~types"
  import type { Unsubscriber } from "svelte/store"
  import extractScript from "url:~scripts/extract.ts"
  import highlightScript from "url:~scripts/highlight.ts"

  interface MainWindow extends Window {
    question_input: HTMLInputElement
  }

  interface SettingsWindow extends Window {
    settings_modal: HTMLDialogElement
  }

  // Create ports for messaging background processes
  const answerPort = getPort("answer")
  const embeddingPort = getPort("embedding")

  // Extract the content scripts file names from their URL
  const extract = extractFileName(extractScript)
  const highlight = extractFileName(highlightScript)

  // Initialize storage
  const storage = new Storage()

  let unsubPageStore: Unsubscriber = () => {}
  let context = [""]
  let storageSiteKey = ""
  let isParsing = true
  let hasEmbedded = false
  let isProtected = false
  let hoverPrompt = false
  let theme = "dark"
  let pageStore: any
  let embeddingsModel: string
  let mainGenerativeModel: string
  let secondaryGenerativeModel: string
  let chunkSize: number
  let topK: number
  let modelList: ModelList
  let initStores: Promise<any>
  let answerTimeout: any
  let embeddingsTimeout: any

  // Initialize settings values from the storage.
  const initSettings = async () => {
    modelList = await storage.get("modelList")
    chunkSize = Number(await storage.get("chunkSize"))
    topK = Number(await storage.get("topK"))
    embeddingsModel = await storage.get(ModelTypes.Embeddings)
    mainGenerativeModel = await storage.get(ModelTypes.Answer)
    secondaryGenerativeModel = await storage.get(ModelTypes.Hyde)
  }

  // Open the settings dialog.
  const openSettings = async () => {
    const settingsWindow = window as unknown as SettingsWindow
    settingsWindow.settings_modal.showModal()
    document.activeElement instanceof HTMLElement && document.activeElement.blur()
  }

  // Save the settings to the storage.
  const saveSettings = async () => {
    const currChunkSize = Number(await storage.get("chunkSize"))
    const currEmbeddingsModel = await storage.get(ModelTypes.Embeddings)

    await storage.set("chunkSize", chunkSize)
    await storage.set("topK", topK)
    await storage.set(ModelTypes.Embeddings, embeddingsModel)
    await storage.set(ModelTypes.Answer, mainGenerativeModel)
    await storage.set(ModelTypes.Hyde, secondaryGenerativeModel)

    if (chunkSize !== currChunkSize) {
      await embeddingIndexDB.clear()
      unsubPageStore()
      await pageStore.destroy()
      window.location.reload()
    } else if (embeddingsModel !== currEmbeddingsModel) {
      await embeddingIndexDB.clear()
      hasEmbedded = false
    }
  }

  // Handle answer process, sending the question to the background process.
  async function handleAnswer() {
    if ($status.isAnswering) return
    clearTimeout(answerTimeout)
    $status.isAnswering = true
    $output = ""
    answerPort.postMessage({
      body: {
        question: $question,
        site: storageSiteKey
      }
    })

    answerTimeout = setTimeout(() => {
      if ($status.isAnswering) {
        $status.hasTimeout = true
      }
    }, 120000)
  }

  // Handle embedding process, sending the context to the background process.
  async function handleEmbeddings() {
    hasEmbedded = true
    const embedKeys = await embeddingIndexDB.keys()
    if (embedKeys && embedKeys.includes(storageSiteKey)) return
    clearTimeout(embeddingsTimeout)
    $progress.processed = 0
    $progress.total = context.length
    $status.isEmbedding = true
    embeddingPort.postMessage({
      body: {
        kb: context,
        site: storageSiteKey
      }
    })

    embeddingsTimeout = setTimeout(() => {
      if ($status.isEmbedding) {
        $status.hasTimeout = true
      }
    }, 120000)
  }

  // Reload the extension.
  function reloadExtension() {
    chrome.runtime.reload()
  }

  // Extracts the file name from a given URL.
  function extractFileName(url: string): string {
    return url.split("/").pop()?.split("?")[0] ?? ""
  }

  // Initialize the store for the current page.
  async function initPageStore(tabUrl: string) {
    await validateCache()
    storageSiteKey = Buffer.from(tabUrl ?? "").toString("base64")

    if (storageSiteKey) {
      pageStore = createStore(storageSiteKey, {
        chunks: [""],
        isParsing: true
      })
      unsubPageStore = pageStore.subscribe((value: PageStatus) => {
        context = value.chunks
        isParsing = value.isParsing
      })
      await pageStore.init()
    } else {
      isParsing = false
    }
  }

  // Check if the bgsw is alive, and reset the status if not.
  function checkHeartbeat() {
    if ($heartbeat) {
      const timeDifference = Date.now() - $heartbeat

      if (timeDifference > 10000) {
        status.reset()
      }
    }
  }

  heartbeat.init().then(() => {
    checkHeartbeat()
    setInterval(checkHeartbeat, 5000)
  })

  // Perform operations after the popup component is mounted.
  onMount(() => {
    const mainWindow = window as unknown as MainWindow

    initStores = Promise.all([
      status.init(),
      prompt.init(),
      question.init(),
      output.init(),
      error.init(),
      progress.init()
    ])

    mainWindow.matchMedia("(prefers-color-scheme: dark)").matches ? (theme = "dark") : (theme = "light")
    mainWindow.question_input.focus()

    chrome.tabs.query({ active: true, lastFocusedWindow: true }, async (tabs) => {
      if (!tabs[0] || !tabs[0].id || tabs[0].url === "") {
        isProtected = true
        return
      }

      chrome.scripting
        .executeScript({
          target: { tabId: tabs[0].id },
          files: [extract, highlight]
        })
        .catch((e) => {
          console.log(e)
          isProtected = true
          return
        })

      await initPageStore(tabs[0].url ?? "")
    })
  })

  // Perform operations before the popup component is destroyed.
  onDestroy(() => {
    if (unsubPageStore) {
      unsubPageStore()
    }
  })

  // Reactive statements.
  $: isReady = !$status.isDownloading && !$status.isAnswering && !$status.isEmbedding && (!isParsing || isProtected)
  $: if (!$status.isDownloading && !isParsing && !hasEmbedded) handleEmbeddings()
  $: promptLines = $prompt.split("\n")
</script>

<div data-theme={theme} class="relative p-6">
  {#await initStores}
    <div class="flex items-center justify-center">
      <span class="loading loading-dots loading-lg" />
    </div>
  {:then}
    <form on:submit|preventDefault={$question ? handleAnswer : () => {}} autocomplete="off">
      <div class="mb-2 flex items-center justify-between">
        <div class="text-lg font-bold">Question</div>
        <button
          id="settings_button"
          type="button"
          class="btn btn-circle btn-sm uppercase"
          disabled={$status.isAnswering ? true : false}
          on:click={openSettings}>
          <!-- src: https://www.svgrepo.com/svg/511122/settings -->
          <svg class="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path
              d="M20.3499 8.92293L19.9837 8.7192C19.9269 8.68756 19.8989 8.67169 19.8714 8.65524C19.5983 8.49165 19.3682 8.26564 19.2002 7.99523C19.1833 7.96802 19.1674 7.93949 19.1348 7.8831C19.1023 7.82677 19.0858 7.79823 19.0706 7.76998C18.92 7.48866 18.8385 7.17515 18.8336 6.85606C18.8331 6.82398 18.8332 6.79121 18.8343 6.72604L18.8415 6.30078C18.8529 5.62025 18.8587 5.27894 18.763 4.97262C18.6781 4.70053 18.536 4.44993 18.3462 4.23725C18.1317 3.99685 17.8347 3.82534 17.2402 3.48276L16.7464 3.1982C16.1536 2.85658 15.8571 2.68571 15.5423 2.62057C15.2639 2.56294 14.9765 2.56561 14.6991 2.62789C14.3859 2.69819 14.0931 2.87351 13.5079 3.22396L13.5045 3.22555L13.1507 3.43741C13.0948 3.47091 13.0665 3.48779 13.0384 3.50338C12.7601 3.6581 12.4495 3.74365 12.1312 3.75387C12.0992 3.7549 12.0665 3.7549 12.0013 3.7549C11.9365 3.7549 11.9024 3.7549 11.8704 3.75387C11.5515 3.74361 11.2402 3.65759 10.9615 3.50224C10.9334 3.48658 10.9056 3.46956 10.8496 3.4359L10.4935 3.22213C9.90422 2.86836 9.60915 2.69121 9.29427 2.62057C9.0157 2.55807 8.72737 2.55634 8.44791 2.61471C8.13236 2.68062 7.83577 2.85276 7.24258 3.19703L7.23994 3.1982L6.75228 3.48124L6.74688 3.48454C6.15904 3.82572 5.86441 3.99672 5.6517 4.23614C5.46294 4.4486 5.32185 4.69881 5.2374 4.97018C5.14194 5.27691 5.14703 5.61896 5.15853 6.3027L5.16568 6.72736C5.16676 6.79166 5.16864 6.82362 5.16817 6.85525C5.16343 7.17499 5.08086 7.48914 4.92974 7.77096C4.9148 7.79883 4.8987 7.8267 4.86654 7.88237C4.83436 7.93809 4.81877 7.96579 4.80209 7.99268C4.63336 8.26452 4.40214 8.49186 4.12733 8.65572C4.10015 8.67193 4.0715 8.68752 4.01521 8.71871L3.65365 8.91908C3.05208 9.25245 2.75137 9.41928 2.53256 9.65669C2.33898 9.86672 2.19275 10.1158 2.10349 10.3872C2.00259 10.6939 2.00267 11.0378 2.00424 11.7255L2.00551 12.2877C2.00706 12.9708 2.00919 13.3122 2.11032 13.6168C2.19979 13.8863 2.34495 14.134 2.53744 14.3427C2.75502 14.5787 3.05274 14.7445 3.64974 15.0766L4.00808 15.276C4.06907 15.3099 4.09976 15.3266 4.12917 15.3444C4.40148 15.5083 4.63089 15.735 4.79818 16.0053C4.81625 16.0345 4.8336 16.0648 4.8683 16.1255C4.90256 16.1853 4.92009 16.2152 4.93594 16.2452C5.08261 16.5229 5.16114 16.8315 5.16649 17.1455C5.16707 17.1794 5.16658 17.2137 5.16541 17.2827L5.15853 17.6902C5.14695 18.3763 5.1419 18.7197 5.23792 19.0273C5.32287 19.2994 5.46484 19.55 5.65463 19.7627C5.86915 20.0031 6.16655 20.1745 6.76107 20.5171L7.25478 20.8015C7.84763 21.1432 8.14395 21.3138 8.45869 21.379C8.73714 21.4366 9.02464 21.4344 9.30209 21.3721C9.61567 21.3017 9.90948 21.1258 10.4964 20.7743L10.8502 20.5625C10.9062 20.5289 10.9346 20.5121 10.9626 20.4965C11.2409 20.3418 11.5512 20.2558 11.8695 20.2456C11.9015 20.2446 11.9342 20.2446 11.9994 20.2446C12.0648 20.2446 12.0974 20.2446 12.1295 20.2456C12.4484 20.2559 12.7607 20.3422 13.0394 20.4975C13.0639 20.5112 13.0885 20.526 13.1316 20.5519L13.5078 20.7777C14.0971 21.1315 14.3916 21.3081 14.7065 21.3788C14.985 21.4413 15.2736 21.4438 15.5531 21.3855C15.8685 21.3196 16.1657 21.1471 16.7586 20.803L17.2536 20.5157C17.8418 20.1743 18.1367 20.0031 18.3495 19.7636C18.5383 19.5512 18.6796 19.3011 18.764 19.0297C18.8588 18.7252 18.8531 18.3858 18.8417 17.7119L18.8343 17.2724C18.8332 17.2081 18.8331 17.1761 18.8336 17.1445C18.8383 16.8247 18.9195 16.5104 19.0706 16.2286C19.0856 16.2007 19.1018 16.1726 19.1338 16.1171C19.166 16.0615 19.1827 16.0337 19.1994 16.0068C19.3681 15.7349 19.5995 15.5074 19.8744 15.3435C19.9012 15.3275 19.9289 15.3122 19.9838 15.2818L19.9857 15.2809L20.3472 15.0805C20.9488 14.7472 21.2501 14.5801 21.4689 14.3427C21.6625 14.1327 21.8085 13.8839 21.8978 13.6126C21.9981 13.3077 21.9973 12.9658 21.9958 12.2861L21.9945 11.7119C21.9929 11.0287 21.9921 10.6874 21.891 10.3828C21.8015 10.1133 21.6555 9.86561 21.463 9.65685C21.2457 9.42111 20.9475 9.25526 20.3517 8.92378L20.3499 8.92293Z"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round" />
            <path
              d="M8.00033 12C8.00033 14.2091 9.79119 16 12.0003 16C14.2095 16 16.0003 14.2091 16.0003 12C16.0003 9.79082 14.2095 7.99996 12.0003 7.99996C9.79119 7.99996 8.00033 9.79082 8.00033 12Z"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round" />
          </svg>
        </button>
      </div>
      <input
        id="question_input"
        type="search"
        class="input input-bordered mb-5 w-full text-sm"
        bind:value={$question}
        placeholder="Enter question..."
        enterkeyhint="go" />

      <div class="flex items-center justify-center">
        <button
          class="btn btn-primary btn-block flex-1 uppercase {isReady ? '' : 'pointer-events-none'}"
          disabled={$question ? false : true}
          tabindex={isReady ? 0 : -1}
          type="submit">
          <span class={isReady ? "" : "loading loading-spinner pointer-events-none"} />
          {#if isReady}
            Submit
          {:else if $status.isAnswering && !$status.showStop}
            Loading...
          {:else if $status.isAnswering}
            Answering...
          {/if}
        </button>
        {#if $status.showStop}
          <button class="btn-icon btn btn-secondary ml-2 uppercase" on:click|preventDefault={() => ($stop = true)}>
            <!-- src: https://www.svgrepo.com/svg/511151/stop -->
            <svg class="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path
                d="M5 8.2002V15.8002C5 16.9203 5 17.4796 5.21799 17.9074C5.40973 18.2837 5.71547 18.5905 6.0918 18.7822C6.5192 19 7.07899 19 8.19691 19H15.8036C16.9215 19 17.4805 19 17.9079 18.7822C18.2842 18.5905 18.5905 18.2837 18.7822 17.9074C19 17.48 19 16.921 19 15.8031V8.19691C19 7.07899 19 6.5192 18.7822 6.0918C18.5905 5.71547 18.2842 5.40973 17.9079 5.21799C17.4801 5 16.9203 5 15.8002 5H8.2002C7.08009 5 6.51962 5 6.0918 5.21799C5.71547 5.40973 5.40973 5.71547 5.21799 6.0918C5 6.51962 5 7.08009 5 8.2002Z"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round" />
            </svg>
          </button>
        {/if}
      </div>
    </form>

    <div class="mb-2 mt-5 inline-flex items-center text-lg font-bold">
      <span>Answer</span>
      {#if $prompt}
        <span
          class="relative p-2"
          role="tooltip"
          on:mouseenter={() => (hoverPrompt = true)}
          on:mouseleave={() => (hoverPrompt = false)}>
          <!-- src: https://www.svgrepo.com/svg/510918/circle-help -->
          <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path
              d="M9.14648 9.07361C9.31728 8.54732 9.63015 8.07896 10.0508 7.71948C10.4714 7.36001 10.9838 7.12378 11.5303 7.03708C12.0768 6.95038 12.6362 7.0164 13.1475 7.22803C13.6587 7.43966 14.1014 7.78875 14.4268 8.23633C14.7521 8.68391 14.9469 9.21256 14.9904 9.76416C15.0339 10.3158 14.9238 10.8688 14.6727 11.3618C14.4215 11.8548 14.0394 12.2685 13.5676 12.5576C13.0958 12.8467 12.5533 12.9998 12 12.9998V14.0002M12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12C21 16.9706 16.9706 21 12 21ZM12.0498 17V17.1L11.9502 17.1002V17H12.0498Z"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round" />
          </svg>
          {#if hoverPrompt}
            <div class="absolute -top-20 z-10 p-6">
              <div class="card w-64 bg-base-200 shadow-md">
                <div class="card-body p-4">
                  <h2 class="card-title text-sm"><b>Prompt</b></h2>
                  <div class="card-actions text-xs">
                    {#each promptLines as line}
                      {line}<br />
                    {/each}
                  </div>
                </div>
              </div>
            </div>
          {/if}
        </span>
      {/if}
    </div>
    <textarea class="textarea textarea-bordered h-52 w-full text-sm" bind:value={$output} readonly />

    {#await initSettings() then}
      <dialog id="settings_modal" class="modal">
        <form on:submit={saveSettings} method="dialog" class="modal-box h-full pb-5 pt-5" autocomplete="off">
          <div class="space-y-4">
            <div>
              <div class="text-sm font-bold">Embeddings model</div>
              <select
                bind:value={embeddingsModel}
                class="select select-bordered select-accent select-sm mt-2 w-full max-w-xs text-xs font-normal">
                <option disabled selected>Choose model</option>
                {#each modelList.embeddingModels as embedModel}
                  <option value={embedModel.id}>{embedModel.id} ({embedModel.sizeMB} MB)</option>
                {/each}
              </select>
            </div>
            <div>
              <div class="text-sm font-bold">Main generative model</div>
              <select
                bind:value={mainGenerativeModel}
                class="select select-bordered select-accent select-sm mt-2 w-full max-w-xs text-xs font-normal">
                <option disabled selected>Choose model</option>
                {#each modelList.answerModels as answerModel}
                  <option value={answerModel.id}>{answerModel.id} ({answerModel.sizeMB} MB)</option>
                {/each}
              </select>
            </div>
            <div>
              <div class="text-sm font-bold">Secondary generative model</div>
              <select
                bind:value={secondaryGenerativeModel}
                class="select select-bordered select-accent select-sm mt-2 w-full max-w-xs text-xs font-normal">
                <option disabled selected>Choose model</option>
                {#each modelList.answerModels as answerModel}
                  <option value={answerModel.id}>{answerModel.id} ({answerModel.sizeMB} MB)</option>
                {/each}
              </select>
            </div>

            <div class="flex justify-between space-x-4">
              <div>
                <div class="text-sm font-bold">Chunk size</div>
                <input
                  class="input input-sm input-bordered input-accent mt-2 w-32 text-xs font-normal"
                  type="number"
                  min="40"
                  max="1000"
                  bind:value={chunkSize} />
              </div>

              <div>
                <div class="text-sm font-bold">Results number</div>
                <input
                  class="input input-sm input-bordered input-accent mt-2 w-32 text-xs font-normal"
                  type="number"
                  min="1"
                  max="10"
                  bind:value={topK} />
              </div>
            </div>
          </div>

          <div class="modal-action">
            <button class="btn btn-primary btn-sm btn-block uppercase" type="submit">Save</button>
          </div>
        </form>
        <form method="dialog" class="modal-backdrop">
          <button>close</button>
        </form>
      </dialog>
    {/await}

    {#if $error != ""}
      <div class="alert alert-error mt-3 flex items-center justify-center text-sm">
        <svg class="h-6 w-6 stroke-current" fill="none" viewBox="0 0 24 24"
          ><path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
        <div class="flex-auto text-left">Error! {$error}</div>
      </div>
    {:else if $status.isDownloading || $status.isEmbedding}
      <div class="alert alert-info mt-3 flex items-center justify-center text-sm">
        <svg fill="none" viewBox="0 0 24 24" class="h-6 w-6 stroke-current"
          ><path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
        {#if $status.isDownloading}
          <div class="flex-auto text-left">Downloading models...</div>
        {:else if $status.isEmbedding}
          <div class="flex-auto text-left">Retrieving embeddings... ({$progress.processed}/{$progress.total})</div>
        {/if}
      </div>
    {/if}

    {#if $status.hasTimeout}
      <div class="alert alert-warning mt-3 flex items-center justify-center text-sm">
        <svg class="h-6 w-6 shrink-0 stroke-current" fill="none" viewBox="0 0 24 24"
          ><path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
        <div class="flex items-center justify-between">
          <div class="flex-auto text-left">Warning: Timeout reached, you may reload the extension</div>
          <button class="btn btn-circle btn-sm bg-warning uppercase" on:click={reloadExtension}>
            <!-- src: https://www.svgrepo.com/svg/510837/arrows-reload-01 -->
            <svg class="h-6 w-6 stroke-gray-500" viewBox="0 0 24 24" fill="none">
              <path
                d="M10 16H5V21M14 8H19V3M4.58301 9.0034C5.14369 7.61566 6.08244 6.41304 7.29255 5.53223C8.50266 4.65141 9.93686 4.12752 11.4298 4.02051C12.9227 3.9135 14.4147 4.2274 15.7381 4.92661C17.0615 5.62582 18.1612 6.68254 18.9141 7.97612M19.4176 14.9971C18.8569 16.3848 17.9181 17.5874 16.708 18.4682C15.4979 19.3491 14.0652 19.8723 12.5723 19.9793C11.0794 20.0863 9.58606 19.7725 8.2627 19.0732C6.93933 18.374 5.83882 17.3175 5.08594 16.0239"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round" />
            </svg>
          </button>
        </div>
      </div>
    {/if}
  {:catch}
    <div class="alert alert-error mt-3 flex items-center justify-center text-sm">
      <svg class="h-6 w-6 stroke-current" fill="none" viewBox="0 0 24 24"
        ><path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
      <div class="flex-auto text-left">Fatal error! Please reload the extension</div>
    </div>
  {/await}
</div>

<style lang="postcss">
</style>
