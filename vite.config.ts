import { defineConfig } from "vite";

export default defineConfig({
  base: "./", // relative asset paths so it works in a subfolder (e.g. /kaleidoscope/)
  server: {
    port: 6410,
  },
});
