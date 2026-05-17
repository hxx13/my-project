/** 未绑卡提示 / 扫码弹窗公告：生效角色均按当前登录操作员判断 */
export const SCAN_OPERATOR_ROLE_LABEL = "生效账号角色（扫码操作员）";

export const SCAN_OPERATOR_ROLE_HINT =
  "按当前登录扫码操作员在 sys_user 中的角色判断，与被扫人员身份无关。";

export const SCAN_OPERATOR_ROLE_HINT_UNBOUND =
  `${SCAN_OPERATOR_ROLE_HINT} 未勾选的角色不会看到未绑卡提示，其扫码进入也不会因未绑卡策略被禁入。`;

export const SCAN_OPERATOR_ROLE_HINT_ANNOUNCEMENT =
  `${SCAN_OPERATOR_ROLE_HINT} 未勾选的角色不会看到公告弹窗。`;
