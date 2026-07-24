# DEPRECATED — syncToBackend

**废弃日期**: 2026-07-24
**原因**: 小程序改为 wx.uploadFile 直连 POST /api/upload，不再经云存储中转。
**替代方案**: aroapp/miniprogram/utils/springAuth.js 中的 uploadFileDirect()
