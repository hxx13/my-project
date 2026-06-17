export const Z_INDEX = {
  base: 0,
  dropdown: 100,
  modal: 200,
  scannerPopup: 300,       // UiverseProfilePopup
  scanDelayMenu: 310,      // 扫码弹窗内延迟二级菜单（须高于 scannerPopup）
  popupNotice: 310,         // 扫码通行动效 overlay
  popupModal: 320,          // DisciplinaryModal
  bizOverlay: 400,          // BizOverlayShell
  keypad: 500,              // NumericKeypad（永远最顶层）
  globalToast: 600,         // 全局 Toast/Notification
  faceScan: 10000,           // 人脸验证 Dynamic Island + 摄像头窗口（在 dahua-issue 画廊之上）
  facePhotoGallery: 10000,   // 底库照片管理（dahua-issue 等）
  faceEnrollment: 10001,     // 现场人脸录入（高于画廊 / 失败提示 Toast）
} as const;
