import MySignatureCard from "@/components/signature/MySignatureCard";

/**
 * 电子签名独立页（教职工 `/console/admin/signature`、学生 `/student/signature` 共用）。
 *
 * <p>为什么要有这一页：签名平时是头像菜单 / 「我的」里的**弹窗**，不是页面 —— 于是
 * 「帮球球打开电子签名」这类请求没有落脚点（路由工具包只认页面）。给它一个真路由之后，
 * 它和别的入口一样可被打开、可被收藏、可直接贴地址。
 *
 * <p>页体交给 {@link MySignatureCard}：签没签它自己分得清（没有就给画板与手机直链、
 * 有就只读展示），所以这一页**无论是否已签名都能进**，不会出现「已经签过了点进去一片空白」。
 */
export default function MySignaturePage() {
  return (
    <div className="mx-auto w-full max-w-[880px] px-4 py-6">
      <div className="mb-4">
        <h1 className="text-lg font-semibold text-[var(--app-color-text-primary)]">电子签名</h1>
        <p className="mt-1 text-sm text-[var(--app-color-text-secondary)]">
          签名会印在转移单、领用单等单据的签字栏上。提交后不可更改，需要重签请联系管理员重置。
        </p>
      </div>
      <MySignatureCard />
    </div>
  );
}
