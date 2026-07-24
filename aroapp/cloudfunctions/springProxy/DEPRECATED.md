# DEPRECATED — springProxy

**废弃日期**: 2026-07-24
**原因**: 小程序已改为 wx.request 直连后端 (aroultra.shsmu.edu.cn)，不再经云函数转发。
**替代方案**: aroapp/miniprogram/utils/springAuth.js 中的 callSpringDirect()
**回滚**: 如需回滚，在小程序 app.js 中恢复 wx.cloud.init 并将 springAuth 中的 callSpringDirect 改回 callSpringProxy。
