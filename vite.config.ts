import vinext from "vinext";
import { defineConfig } from "vite";

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";
const configuredBasePath = process.env.NEXT_PUBLIC_BASE_PATH?.trim().replace(/^\/+|\/+$/g, "") ?? "";

export default defineConfig({
  // Keep Next's basePath empty because vinext beta cannot prerender nested
  // routes with it. Vite still emits every asset under the Pages project path.
  base: configuredBasePath ? `/${configuredBasePath}/` : "/",
  server: isCodexSeatbeltSandbox
    ? { watch: { useFsEvents: false, usePolling: true } }
    : undefined,
  plugins: [vinext()],
});
