export const Z_INDEX = {
  base: 0,
  dropdown: 100,
  modal: 200,
  scannerPopup: 300,       // UiverseProfilePopup
  popupNotice: 310,         // ScanAccessNoticeOverlay
  popupModal: 320,          // DisciplinaryModal
  bizOverlay: 400,          // BizOverlayShell
  keypad: 500,              // NumericKeypad（永远最顶层）
  globalToast: 600,         // 全局 Toast/Notification
} as const;
