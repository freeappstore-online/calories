import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import { pwaOptions } from "@freeappstore/sdk/pwa-config";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // webp added so the food illustrations work offline; public/ocr/ is the optional label-scanner download, never precached
    VitePWA(pwaOptions({ workbox: { globPatterns: ["**/*.{js,css,html,png,svg,ico,woff2,webp}"], globIgnores: ["ocr/**"] } })),
  ],
});
