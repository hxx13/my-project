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

    // 💥 新增：代理配置。只要前端请求 /api，Vite 就自动帮你转给 Spring Boot！
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
        // 🔧 使用 esbuild 压缩 CSS 替代 LightningCSS
        // LightningCSS (Vite 8 默认) 在生产构建中会错误处理 backdrop-filter /
        // color-mix() / CSS 自定义属性，导致首页 GlassCard 透明度丢失
        cssMinify: 'esbuild',
    },

})