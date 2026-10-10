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
  globalToast: 1000,         // 全局 Toast/Notification（须高于 --z-modal:800）
  faceScan: 10000,           // 人脸验证 Dynamic Island + 摄像头窗口（在 dahua-issue 画廊之上）
  facePhotoGallery: 10000,   // 底库照片管理（dahua-issue 等）
  faceEnrollment: 10001,     // 现场人脸录入（高于画廊 / 失败提示 Toast）
  scannerHintBubble: 311,   // 扫码弹窗禁入帮助气泡（浮于 scannerPopup 300 / scanDelayMenu 310 之上，popupModal 320 之下）
  /**
   * 扫码弹窗底部的「当前未绑卡，点我绑定卡」入口。
   *
   * <p>**必须 portal 到 body 再用这一层**：未绑卡警示是阻断式遮罩（800，`--blocking`），而按钮原先在
   * 弹窗层（300）里 —— z 值再大也只在自己那个层叠上下文里比大小，真机上被遮罩盖住、点不动。
   * 挂到 body 才和遮罩同场竞技。低于人脸验证（10000）与助手球（9900），高于公告遮罩与 Toast。
   */
  scanUnboundBindHint: 9000,
  /**
   * 后端连不上的全局提示弹窗。
   *
   * <p>必须盖住一切 —— 含助手球（9900）与人脸窗口（10000）。服务重启时这些层里的东西
   * 全都是残缺的（点不动、报红字），不盖住用户就会一直在一个已经废掉的界面上瞎试。
   */
  serverRestartNotice: 10050,
} as const;
