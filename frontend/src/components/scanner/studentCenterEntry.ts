import type { NavigateFunction } from "react-router-dom";
import type { AuthData } from "@/api/domains/auth.api";
import { authStorage } from "@/features/auth/authStorage";

/** 扫码弹窗 PIN / 人脸验证成功后进入学生中心（镜像模式：教职工视角查看，不替换登录态） */
export function commitStudentCenterEntryFromScan(
  authData: AuthData,
  onClosePopup: () => void,
  navigate: NavigateFunction,
) {
  // Mirror mode: keep staff auth intact, store student token in parallel channel
  authStorage.enterMirrorMode(authData.token, authData.userInfo, "scan");
  authStorage.markStudentEntryFromScan();
  onClosePopup();
  navigate("/student/home");
}
