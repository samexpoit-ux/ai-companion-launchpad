// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

const sandpackSsrStub = () => ({
  name: "sandpack-ssr-stub",
  enforce: "pre" as const,
  resolveId(id: string, _importer: string | undefined, options: { ssr?: boolean } = {}) {
    if (options.ssr && id === "@codesandbox/sandpack-react") {
      return "\0sandpack-ssr-stub";
    }
    return null;
  },
  load(id: string) {
    if (id !== "\0sandpack-ssr-stub") return null;
    return `
      import React from "react";
      export const SandpackProvider = ({ children }) => React.createElement(React.Fragment, null, children);
      export const SandpackCodeEditor = () => null;
      export const SandpackPreview = () => null;
      export const SandpackConsole = () => null;
      export const SandpackFileExplorer = () => null;
      export const SandpackLayout = ({ children }) => React.createElement(React.Fragment, null, children);
      export const SandpackStack = ({ children }) => React.createElement(React.Fragment, null, children);
      export const useSandpack = () => ({ sandpack: { error: null, runSandpack: () => {} }, listen: () => () => {} });
    `;
  },
});

export default defineConfig({
  vite: {
    plugins: [sandpackSsrStub()],
  },
  // Lovable sandbox always builds for its own target; on a self-hosted VPS set
  // NITRO_PRESET=node-server to get a plain Node bundle in .output/server/index.mjs
  nitro: { preset: process.env.NITRO_PRESET || "cloudflare-module" },
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});
