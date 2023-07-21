/**
 * @type {import('prettier').Options}
 */
module.exports = {
  printWidth: 120,
  tabWidth: 2,
  useTabs: false,
  semi: false,
  singleQuote: false,
  trailingComma: "none",
  bracketSpacing: true,
  bracketSameLine: true,
  plugins: [
    require.resolve("@plasmohq/prettier-plugin-sort-imports"),
    require.resolve("prettier-plugin-svelte"),
    require.resolve("prettier-plugin-tailwindcss")
  ],
  overrides: [{ files: "*.svelte", options: { parser: "svelte" } }]
}
