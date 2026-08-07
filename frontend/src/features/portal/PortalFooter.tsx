import { useState, useEffect, useMemo, useCallback } from "react";
import { authStorage } from "@/features/auth/authStorage";
import { fetchPortalFooter, type PortalFooterData } from "@/api/domains/publicSite.api";

interface FooterLink {
  label: string;
  url: string;
  requiresAuth?: boolean;
}

interface FooterGroup {
  group: string;
  items: FooterLink[];
}

interface PortalFooterProps {
  onRequestLogin: () => void;
}

const DEFAULT_COPYRIGHT = "© 2026 上海交通大学医学院 · 实验动物科学部";

/* ── Default fallback (used when API unavailable + no env var) ── */

// const DEFAULT_GROUPS: FooterGroup[] is defined inside the component via useMemo

/* ── Env var override (build-time) ── */

function tryEnvOverride(): FooterGroup[] | null {
  try {
    const raw = import.meta.env.VITE_PORTAL_FOOTER_LINKS;
    if (raw) return JSON.parse(raw) as FooterGroup[];
  } catch { /* ignore */ }
  return null;
}

/* ── Helpers ── */

function mapApiGroups(data: PortalFooterData | null): FooterGroup[] {
  if (!data?.groups?.length) return [];
  return data.groups
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((g) => ({
      group: g.group,
      items: [...g.items]
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((it) => ({ label: it.label, url: it.url, requiresAuth: it.requiresAuth })),
    }));
}

export function PortalFooter({ onRequestLogin }: PortalFooterProps) {
  const [apiData, setApiData] = useState<PortalFooterData | null>(null);
  const [apiError, setApiError] = useState(false);
  const hasToken = authStorage.hasToken();

  // Fetch from public API
  useEffect(() => {
    let cancelled = false;
    fetchPortalFooter()
      .then((data) => { if (!cancelled) setApiData(data); })
      .catch(() => { if (!cancelled) setApiError(true); });
    return () => { cancelled = true; };
  }, []);

  const groups: FooterGroup[] = useMemo(() => {
    // 1. Env var override takes absolute priority
    const envGroups = tryEnvOverride();
    if (envGroups) return envGroups;

    // 2. API data (from admin settings)
    if (apiData?.groups?.length) return mapApiGroups(apiData);

    // 3. API returned empty (no config saved yet) or failed — use hardcoded defaults
    return [
      {
        group: "学生服务",
        items: [
          { label: "学生中心", url: "/#/student/home", requiresAuth: true },
          { label: "笼架信息", url: "/#/student/cage-shelf", requiresAuth: true },
        ],
      },
      {
        group: "帮助支持",
        items: [
          { label: "帮助反馈", url: "/#/student/feedback", requiresAuth: true },
          { label: "联系我们", url: "mailto:aro@shsmu.edu.cn" },
        ],
      },
    ];
  }, [apiData]);

  const contact = apiData?.contact;
  const copyright = apiData?.copyright || DEFAULT_COPYRIGHT;
  const showContact = contact && (contact.phone || contact.email || contact.address || contact.workHours);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>, item: FooterLink) => {
      if (item.requiresAuth && !hasToken) {
        e.preventDefault();
        onRequestLogin();
      }
    },
    [hasToken, onRequestLogin],
  );

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
                      onClick={(e) => handleClick(e, item)}
                      className="text-sm text-white/50 hover:text-white/80 transition-colors"
                    >
                      {item.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {/* Contact info column (from API) */}
          {showContact && (
            <div>
              <h4 className="text-sm font-semibold text-white/80 mb-3">联系我们</h4>
              <ul className="space-y-1.5 text-sm text-white/40 whitespace-pre-line">
                {contact.phone && <li>{contact.phone}</li>}
                {contact.email && <li>{contact.email}</li>}
                {contact.address && <li>{contact.address}</li>}
                {contact.workHours && <li>{contact.workHours}</li>}
              </ul>
            </div>
          )}
        </div>

        {/* Error indicator (silent) */}
        {apiError && !apiData && (
          <div className="mt-6 text-center text-xs text-white/20">
            页脚配置加载失败，使用默认设置
          </div>
        )}

        <div className="mt-12 pt-8 border-t border-white/10 text-center text-sm text-white/30">
          {copyright}
        </div>
      </div>
    </footer>
  );
}
