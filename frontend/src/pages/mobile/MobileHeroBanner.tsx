/** 手机版 — Hero Banner 轮播横幅 */
import { useEffect, useState } from "react";
import {
  pickLoginHeroUrls,
  type LoginBranding,
} from "@/api/domains/publicSite.api";

interface HeroBannerProps {
  branding: LoginBranding | null;
  wsConnected?: boolean;
}

export default function HeroBanner({
  branding,
  wsConnected = false,
}: HeroBannerProps) {
  const urls = pickLoginHeroUrls(branding, "light");
  const enabled = branding?.heroCarouselEnabled !== false && urls.length > 0;
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (!enabled || urls.length <= 1) return;
    const t = setInterval(
      () => setIdx((i) => (i + 1) % urls.length),
      (branding?.intervalSec ?? 8) * 1000,
    );
    return () => clearInterval(t);
  }, [enabled, urls.length, branding?.intervalSec]);

  const pillStyle = {
    background: "rgba(0,0,0,0.32)",
    backdropFilter: "blur(8px)",
    border: "1px solid rgba(255,255,255,0.2)",
  };

  return (
    <div
      className="relative w-full overflow-hidden"
      style={{
        height: 260,
        background:
          "linear-gradient(135deg, rgba(172,23,54,0.06), rgba(99,102,241,0.05), rgba(45,212,191,0.04))",
      }}
    >
      {/* 轮播背景 */}
      {enabled ? (
        <div className="absolute inset-0">
          {urls.map((url: string, i: number) => (
            <img
              key={i}
              src={url}
              alt=""
              className="absolute inset-0 w-full h-full object-cover transition-opacity duration-700"
              style={{ opacity: i === idx ? 1 : 0 }}
            />
          ))}
          {urls.length > 1 && (
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5 z-10">
              {urls.map((_: string, i: number) => (
                <div
                  key={i}
                  className="rounded-full transition-all duration-300"
                  style={{
                    width: i === idx ? 16 : 6,
                    height: 6,
                    background:
                      i === idx
                        ? "#fff"
                        : "rgba(255,255,255,0.45)",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                  }}
                />
              ))}
            </div>
          )}
        </div>
      ) : (
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(160deg, rgba(172,23,54,0.08), rgba(99,102,241,0.05) 60%, rgba(45,212,191,0.04))",
          }}
        />
      )}

      {/* 左上：模式 + 实时 */}
      <div
        className="absolute left-4 z-20 flex flex-col gap-2"
        style={{ top: "calc(env(safe-area-inset-top, 0px) + 12px)" }}
      >
        {/* 第一行：模式标签 + 实时状态 */}
        <div className="flex items-center gap-2">
          <div
            className="rounded-full px-2.5 py-1 text-[10px] font-semibold text-white"
            style={{
              background: "rgba(99,102,241,0.85)",
              backdropFilter: "blur(8px)",
              border: "1px solid rgba(255,255,255,0.25)",
            }}
          >
            通用模式
          </div>

          {/* WebSocket 实时状态 — 始终显示 */}
          <div
            className="flex items-center gap-1 rounded-full px-2 py-1"
            style={pillStyle}
          >
            <div
              className="w-1.5 h-1.5 rounded-full"
              style={{ background: wsConnected ? "#4ade80" : "#f87171" }}
            />
            <span className="text-[9px] font-medium text-white/80">实时</span>
          </div>
        </div>
      </div>
    </div>
  );
}
