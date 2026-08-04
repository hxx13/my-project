import { useMemo } from "react";

interface FooterLink {
  label: string;
  url: string;
}

interface FooterGroup {
  group: string;
  items: FooterLink[];
}

const DEFAULT_LINKS: FooterGroup[] = [
  {
    group: "学生服务",
    items: [
      { label: "学生中心", url: "/#/student/home" },
      { label: "笼架信息", url: "/#/student/cage-shelf" },
    ],
  },
  {
    group: "管理入口",
    items: [
      { label: "管理后台", url: "/#/console/admin" },
    ],
  },
  {
    group: "帮助支持",
    items: [
      { label: "帮助反馈", url: "/#/student/feedback" },
      { label: "联系我们", url: "mailto:aro@shsmu.edu.cn" },
    ],
  },
];

function parseFooterLinks(): FooterGroup[] {
  try {
    const raw = import.meta.env.VITE_PORTAL_FOOTER_LINKS;
    if (raw) return JSON.parse(raw) as FooterGroup[];
  } catch { /* ignore */ }
  return DEFAULT_LINKS;
}

export function PortalFooter() {
  const groups = useMemo(() => parseFooterLinks(), []);

  return (
    <footer className="bg-[#1e293b] py-16 px-6">
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-8">
          {groups.map((g) => (
            <div key={g.group}>
              <h4 className="text-sm font-semibold text-white/80 mb-3">{g.group}</h4>
              <ul className="space-y-2">
                {g.items.map((item) => (
                  <li key={item.label}>
                    <a
                      href={item.url}
                      className="text-sm text-white/50 hover:text-white/80 transition-colors"
                    >
                      {item.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-12 pt-8 border-t border-white/10 text-center text-sm text-white/30">
          © 2026 上海交通大学医学院 · 实验动物科学部
        </div>
      </div>
    </footer>
  );
}
