import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import { fileURLToPath } from "url";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";
import { metaImagesPlugin } from "./vite-plugin-meta-images";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(async () => {
  const plugins = [
    react(),
    runtimeErrorOverlay(),
    tailwindcss(),
    metaImagesPlugin(),
  ];

  // Динамични импорти само при dev в Replit — избегваме top-level await
  if (process.env.NODE_ENV !== "production" && process.env.REPL_ID !== undefined) {
    const m1 = await import("@replit/vite-plugin-cartographer");
    const m2 = await import("@replit/vite-plugin-dev-banner");
    if (m1 && m1.cartographer) plugins.push(m1.cartographer());
    if (m2 && m2.devBanner) plugins.push(m2.devBanner());
  }

  return {
    // Важно: base трябва да е името на репото, когато хостваш в GitHub Pages на USER.github.io/REPO
    base: "/budgetflows/",
    plugins,
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "client", "src"),
        "@shared": path.resolve(__dirname, "shared"),
        "@assets": path.resolve(__dirname, "attached_assets"),
      },
    },
    css: {
      postcss: {
        plugins: [],
      },
    },
    // Работната root папка е client
    root: path.resolve(__dirname, "client"),
    build: {
      // Build-ът ще отиде в dist/public (както твоят скрипт очаква)
      outDir: path.resolve(__dirname, "dist/public"),
      emptyOutDir: true,
    },
    server: {
      host: "0.0.0.0",
      allowedHosts: true,
      fs: {
        strict: true,
        deny: ["**/.*"],
      },
    },
  };
});
