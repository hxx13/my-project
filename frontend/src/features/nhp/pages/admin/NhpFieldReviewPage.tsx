/**
 * 已废弃的独立「字段校对」页。
 * 校对改在字段字典详情页边看边审：`/#/content-manager/nhp-field/:dictKey?status=PENDING_REVIEW`
 * 本路由仅作书签兼容跳转。
 */
import { Navigate, useSearchParams } from "react-router-dom";

export default function NhpFieldReviewPage() {
  const [searchParams] = useSearchParams();
  const dictKey = (searchParams.get("dictKey") || "").trim();
  if (dictKey) {
    return (
      <Navigate
        to={`/content-manager/nhp-field/${encodeURIComponent(dictKey)}?status=PENDING_REVIEW`}
        replace
      />
    );
  }
  return <Navigate to="/content-manager/nhp-field" replace />;
}
