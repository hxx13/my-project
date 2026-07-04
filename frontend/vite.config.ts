import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig, type Plugin } from "vite"
import fs from "fs"

// 仅在 dev 时提供人脸模型文件（41MB），生产构建不打包
function serveModelsPlugin(): Plugin {
    return {
        name: "serve-models-dev-only",
        configureServer(server) {
            server.middlewares.use("/models", (req, res, next) => {
                const filePath = path.resolve(__dirname, "models", (req.url || "/").replace(/^\//, ""))
                if (fs.existsSync(filePath)) {
                    const ext = path.extname(filePath)
                    const mime: Record<string, string> = {
                        ".wasm": "application/wasm", ".task": "application/octet-stream",
                        ".js": "application/javascript", ".json": "application/json",
                    }
                    res.setHeader("Content-Type", mime[ext] || "application/octet-stream")
                    fs.createReadStream(filePath).pipe(res)
                    return
                }
                next()
            })
        },
    }
}

export default defineConfig(({ mode }) => ({
    define: {
        // 前端构建版本标识：生产构建用时间戳，开发模式固定 'dev'
        // WebSocket 连接时与后端 app.frontend.expected-version 比对，不一致则自动刷新页面
        __BUILD_ID__: JSON.stringify(mode === 'production' ? `0.0.0-${Date.now()}` : 'dev'),
    },
    plugins: [react(), serveModelsPlugin()],
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
        },
        // 人脸模型不打包到生产 JAR（41MB）；dev 时 Vite 自动从 public/models 提供
        // 生产构建时 public/models/ 已删除，仅保留在 frontend/models/
    },

    build: {
        outDir: '../src/main/resources/static',
        emptyOutDir: true,
        cssMinify: 'esbuild',
        chunkSizeWarningLimit: 300,
        rollupOptions: {
            output: {
                manualChunks(id) {
                    if (id.includes('node_modules')) {
                        const m = id.match(/node_modules\/((?:@[^/]+\/)?[^/]+)/)
                        if (m) {
                            const pkg = m[1].replace('@', '').replace('/', '-')
                            if (['react','react-dom','react-router','react-router-dom','@tanstack/react-query','@tanstack/query-core','scheduler'].includes(pkg) || id.includes('/react/')) return 'react-vendor'
                            if (pkg.includes('visactor') || pkg.includes('vtable') || pkg.includes('vrender') || pkg.includes('vutils') || pkg.includes('vscale') || pkg.includes('vdataset')) return 'vtable-vendor'
                            if (pkg.includes('radix') || pkg.includes('framer') || pkg.includes('lucide')) return 'ui-vendor'
                            if (pkg.includes('tiptap') || pkg.includes('prosemirror') || pkg.includes('linkify')) return 'editor-vendor'
                            if (pkg.includes('d3') || pkg.includes('recharts')) return 'chart-vendor'
                            if (pkg.includes('face-api') || pkg.includes('mediapipe')) return 'face-vendor'
                            // 穿透/高延迟环境：合并小包，避免 50+ 串行 RTT
                            return 'vendor-misc'
                        }
                    }
                },
            },
        },
    },

}))
