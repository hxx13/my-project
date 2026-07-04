export const Z_INDEX = {
  base: 0,
  dropdown: 100,
  modal: 200,
  scannerPopup: 300,       // UiverseProfilePopup
  scanDelayMenu: 310,      // 扫码弹窗内延迟二级菜单（须高于 scannerPopup）
  mobileDelayMenu: 850,     // H5 房间详情内延迟二级菜单（须高于 modal=800）
  popupNotice: 310,         // 扫码通行动效 overlay
  popupModal: 320,          // DisciplinaryModal
  scanAssistantDock: 9900,  // 首页 MorphOrb 智能助手（body portal；仅次于人脸验证/录入）
  repeatedSwipeWarning: 820, // 重复刷卡全屏红色脉冲警告，置于所有扫描弹窗最顶层（高于 --z-modal:800）
  bizOverlay: 400,          // BizOverlayShell
  keypad: 500,              // NumericKeypad（永远最顶层）
  globalToast: 600,         // 全局 Toast/Notification
  faceScan: 10000,           // 人脸验证 Dynamic Island + 摄像头窗口（在 dahua-issue 画廊之上）
  facePhotoGallery: 10000,   // 底库照片管理（dahua-issue 等）
  faceEnrollment: 10001,     // 现场人脸录入（高于画廊 / 失败提示 Toast）
} as const;
