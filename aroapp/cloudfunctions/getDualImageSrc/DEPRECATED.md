# DEPRECATED — getDualImageSrc

**废弃日期**: 2026-07-24
**原因**: 小程序和 Web 前端改为直接使用 publicUrl (相对路径 /api/upload/files/...)，不再需要查 wechatFileId。
**替代方案**: 前端 mediaUrl.ts 中的 dualImageSrc() 已简化为直接返回 publicUrl。
