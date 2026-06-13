import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig({
    plugins: [react()],
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "./src"),
        },
    },

    // VTable 等大依赖预构建；避免 dev 时出现 504 Outdated Optimize Dep
    optimizeDeps: {
        include: [
            "@visactor/vtable",
            "@visactor/vtable-editors",
            "@visactor/vtable-export",
            "@visactor/vtable-search",
        ],
    },

  server: {
        proxy: {
            '/api': {
                target: 'http://localhost:8081',
                changeOrigin: true,
            }
        }
    },

    build: {
        outDir: '../src/main/resources/static',
        emptyOutDir: true,
        cssMinify: 'esbuild',
    },

})
