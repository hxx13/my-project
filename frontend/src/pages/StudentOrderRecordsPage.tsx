import AdminOrderReviewPage from "@/pages/AdminOrderReviewPage";

/**
 * 学生端订单记录：与后台审核页同款展示（页签/卡片/表格/筛选/导出），
 * 差别是只读，且范围由服务端圈定为本人课题组（同组互见）。
 */
export default function StudentOrderRecordsPage() {
  return <AdminOrderReviewPage scope="student" />;
}
