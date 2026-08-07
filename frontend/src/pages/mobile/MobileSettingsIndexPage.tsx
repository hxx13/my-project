/** 手机版 — 设置首页（二级菜单入口） */
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Bell, Shield, ChevronRight } from "lucide-react";

const SETTING_ITEMS = [
  {
    key: "notifications",
    label: "通知设置",
    description: "管理各渠道通知开关",
    icon: Bell,
    path: "/m/settings/notifications",
  },
  {
    key: "account-security",
    label: "账户安全",
    description: "个人PIN码管理与账号安全",
    icon: Shield,
    path: "/m/settings/account-security",
  },
];

export default function MobileSettingsIndexPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* header */}
      <div className="sticky top-0 z-[var(--z-sticky)] bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800">
        <div className="flex items-center gap-3 px-4 h-12">
          <button onClick={() => navigate(-1)} className="p-1 -ml-1">
            <ArrowLeft className="size-5 text-gray-700 dark:text-gray-300" />
          </button>
          <h1 className="text-base font-semibold text-gray-900 dark:text-gray-100">设置</h1>
        </div>
      </div>

      {/* setting items */}
      <div className="px-4 py-4">
        <div className="space-y-2">
          {SETTING_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => navigate(item.path)}
                className="w-full flex items-center gap-3 rounded-xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 px-4 py-3.5 active:bg-gray-50 dark:active:bg-gray-800 transition-colors text-left"
              >
                <div
                  className="flex items-center justify-center size-9 rounded-full shrink-0"
                  style={{ background: "var(--student-primary-soft)" }}
                >
                  <Icon
                    className="size-4"
                    style={{ color: "var(--student-primary)" }}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    {item.label}
                  </p>
                  <p className="text-[11px] text-gray-400 truncate">
                    {item.description}
                  </p>
                </div>
                <ChevronRight className="size-4 text-gray-300 dark:text-gray-600 shrink-0" />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
