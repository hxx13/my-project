/** 与后端 app.personnel-avatar-proxy 白名单一致；正式文件域名（证书 CN 须匹配） */
const PROXY_BASE = "/api/v1/twin/dashboard/proxy/personnel-avatar";
const CANONICAL_ARO_FILE_HOST =
    (typeof import.meta !== "undefined" && import.meta.env?.VITE_ARO_FILE_CANONICAL_HOST) ||
    "aro.shsmu.edu.cn";

function isProxyableHost(hostname: string): boolean {
    const h = hostname.toLowerCase();
    return h === "aro.shsmu.edu.cn" || h.endsWith(".shsmu.edu.cn");
}

/** UTF-8 → URL-safe Base64（无 padding），与后端 /proxy/personnel-avatar/h/{encoded} 一致 */
function toUrlSafeBase64(str: string): string {
    const utf8 = new TextEncoder().encode(str);
    let binary = "";
    utf8.forEach((b) => {
        binary += String.fromCharCode(b);
    });
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * ARO 静态文件路径常配错域名/IP，导致浏览器 ERR_CERT_COMMON_NAME_INVALID。
 * 凡路径含 /jtu_files/ 的，统一改为证书上的正式主机再走后端代理。
 */
function normalizeAroPersonnelImageUrl(raw: string): string {
    const u = new URL(raw.trim());
    if (u.pathname.includes("/jtu_files/")) {
        return `https://${CANONICAL_ARO_FILE_HOST}${u.pathname}${u.search}`;
    }
    return u.href;
}

/** 将人员头像 URL 转为同源代理地址，避免公网 http 页直连校内 https 被浏览器拦截 */
export function resolvePersonnelAvatarUrl(raw: string | null | undefined): string | undefined {
    if (!raw?.trim()) return undefined;
    const u = raw.trim();
    if (u.startsWith("/") || u.startsWith("data:")) return u;
    try {
        const normalized = normalizeAroPersonnelImageUrl(u);
        const parsed = new URL(normalized);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return u;
        if (!isProxyableHost(parsed.hostname)) {
            return u;
        }
        const enc = toUrlSafeBase64(parsed.href);
        return `${PROXY_BASE}/h/${enc}`;
    } catch {
        return u;
    }
}
