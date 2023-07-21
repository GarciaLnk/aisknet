const sveltePreprocess = require("svelte-preprocess")
const path = require("path")

module.exports = {
  // Consult https://github.com/sveltejs/svelte-preprocess
  // for more information about preprocessors
  preprocess: sveltePreprocess({
    postcss: {
      configFilePath: path.resolve(__dirname, "./postcss.config.js")
    }
  })
}
