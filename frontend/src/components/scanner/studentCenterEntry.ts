import type { NavigateFunction } from "react-router-dom";
import type { AuthData } from "@/api/domains/auth.api";
import { authStorage } from "@/features/auth/authStorage";

/** 扫码弹窗 PIN / 人脸验证成功后进入学生中心（与 handleKeypadSuccess 一致） */
export function commitStudentCenterEntryFromScan(
  authData: AuthData,
  onClosePopup: () => void,
  navigate: NavigateFunction,
) {
  authStorage.savePreviousSession();
  authStorage.markStudentEntryFromScan();
  authStorage.setAuth(authData.token, authData.role, authData.userInfo);
  onClosePopup();
  navigate("/student/home");
}
