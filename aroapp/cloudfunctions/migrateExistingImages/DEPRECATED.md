# DEPRECATED — migrateExistingImages

**废弃日期**: 2026-07-24
**原因**: 存量 cloud:// URL 迁移工具。待 DB 中 cloud:// URL 全部替换为 /api/upload/files/... 后，此云函数无存在意义。
**替代方案**: 后端 API: POST /api/upload/sync/auto-replace (存量迁移仍可用此端点)
