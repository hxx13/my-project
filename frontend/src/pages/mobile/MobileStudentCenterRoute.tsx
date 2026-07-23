/** /m/sc/:token 入口 — 校验 token 非空，避免空后缀落入其它重定向 */
import { useParams } from "react-router-dom";
import MobileStudentCenterPage from "./MobileStudentCenterPage";
import MobileStudentCenterInvalidPage from "./MobileStudentCenterInvalidPage";

export function normalizeMobileCenterToken(raw?: string | null): string | null {
  const token = (raw ?? "").trim();
  return token.length > 0 ? token : null;
}

export default function MobileStudentCenterRoute() {
  const { token: rawToken } = useParams<{ token: string }>();
  const token = normalizeMobileCenterToken(rawToken);
  if (!token) {
    return <MobileStudentCenterInvalidPage />;
  }
  return <MobileStudentCenterPage token={token} />;
}
