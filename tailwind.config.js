/** @type {import('tailwindcss').Config} */
export const content = ["./src/**/*.{html,js,svelte,ts}"]
export const theme = {
  extend: {}
}
export const plugins = [require("@tailwindcss/typography"), require("daisyui")]
