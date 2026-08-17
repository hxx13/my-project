import { MapPin, Phone, Mail, Clock } from "lucide-react";
import { usePublicContents } from "@/api/hooks/usePortalContent";

const ICON_MAP: Record<string, typeof MapPin> = { MapPin, Phone, Mail, Clock };

const FALLBACK_CONTACTS = [
  { label: "地址", icon: "MapPin", value: "上海市浦东新区 · 上海交通大学医学院实验动物大楼" },
  { label: "电话", icon: "Phone", value: "021-XXXX-XXXX（工作日 8:30-17:00）" },
  { label: "邮箱", icon: "Mail", value: "aro@shsmu.edu.cn" },
  { label: "办公时间", icon: "Clock", value: "周一至周五 8:30—17:00" },
];

function parseExtensionJson(page: { extensionJson?: unknown } | undefined): Record<string, unknown> {
  const raw = page?.extensionJson;
  if (!raw) return {};
  // 后端返回的 extension_json 是 JSON 字符串，需先解析；兼容已是对象的情况
  if (typeof raw === "string") {
    try { return JSON.parse(raw) as Record<string, unknown>; } catch { return {}; }
  }
  return raw as Record<string, unknown>;
}

function parseContacts(page: { extensionJson?: unknown; summary?: string | null } | undefined): { label: string; icon: string; value: string }[] {
  // 优先 extension_json.contacts
  const ext = parseExtensionJson(page);
  if (Array.isArray(ext.contacts) && ext.contacts.length > 0) {
    return ext.contacts as typeof FALLBACK_CONTACTS;
  }
  // fallback: summary | 分割
  if (page?.summary) {
    const labels = ["地址", "电话", "邮箱", "办公时间"];
    const icons = ["MapPin", "Phone", "Mail", "Clock"];
    return page.summary.split("|").map((s, i) => ({
      label: labels[i] || `项目${i + 1}`,
      icon: icons[i] || "MapPin",
      value: s.trim(),
    })).filter((c) => c.value);
  }
  return FALLBACK_CONTACTS;
}

function parsePhotos(page: { extensionJson?: unknown } | undefined): string[] {
  const ext = parseExtensionJson(page);
  if (Array.isArray(ext.photos)) {
    return (ext.photos as unknown[]).filter((p): p is string => typeof p === "string" && p.length > 0);
  }
  return [];
}

export default function ContactPage() {
  const { data } = usePublicContents({ type: "PAGE", search: "联系我们", size: 1 });
  const page = data?.data?.[0];
  const contacts = parseContacts(page);
  const photos = parsePhotos(page);

  return (
    <div className="min-h-screen bg-[#f7f5f2]">
      <div className="max-w-3xl mx-auto px-5 md:px-12 py-20">
        <div className="text-center mb-14">
          <p className="text-xs font-semibold tracking-[0.2em] text-amber-600 uppercase mb-3">Contact</p>
          <h1 className="text-3xl font-extrabold text-neutral-900">{page?.title || "联系我们"}</h1>
          <p className="mt-4 text-[15px] text-neutral-600">地址与联系方式</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-14">
          {contacts.map((item, i) => {
            const Icon = ICON_MAP[item.icon] || MapPin;
            return (
              <div key={i} className="bg-white border border-neutral-200 rounded-2xl p-6 flex items-start gap-4 shadow-sm">
                <div className="w-11 h-11 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
                  <Icon className="size-5 text-amber-600" />
                </div>
                <div>
                  <div className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider mb-1">{item.label}</div>
                  <div className="text-sm text-neutral-700 leading-relaxed">{item.value}</div>
                </div>
              </div>
            );
          })}
        </div>

        {photos.length > 0 && (
          <div className="mt-8">
            <h2 className="text-sm font-semibold text-neutral-700 mb-4">地图指引</h2>
            <div className="space-y-5">
              {photos.map((url, i) => (
                <div key={i} className="bg-white border border-neutral-200 rounded-2xl overflow-hidden shadow-sm">
                  <img src={url} alt={`地图指引 ${i + 1}`} className="w-full h-auto" loading="lazy" />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
