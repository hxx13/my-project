import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";

export const OPS_WALL_SCENES = [
  { id: "hero", label: "进出" },
  { id: "campus", label: "分区" },
  { id: "flow", label: "流量" },
  { id: "rooms", label: "房间" },
  { id: "ranking", label: "排行" },
  { id: "presence", label: "在室" },
  { id: "rules", label: "公告" },
  { id: "live", label: "动态" },
] as const;

export type OpsWallSceneId = (typeof OPS_WALL_SCENES)[number]["id"];

type OpsScrollNavProps = {
  scrollRoot: HTMLElement | null;
  isConnected: boolean;
};

export function OpsScrollNav({ scrollRoot, isConnected }: OpsScrollNavProps) {
  const navigate = useNavigate();
  const [active, setActive] = useState<OpsWallSceneId>("hero");

  useEffect(() => {
    if (!scrollRoot) return;

    const sections = OPS_WALL_SCENES.map((s) =>
      scrollRoot.querySelector<HTMLElement>(`[data-ops-scene="${s.id}"]`),
    ).filter(Boolean) as HTMLElement[];

    const onScroll = () => {
      const mid = scrollRoot.scrollTop + scrollRoot.clientHeight * 0.42;
      let current: OpsWallSceneId = "hero";
      for (const el of sections) {
        const id = el.getAttribute("data-ops-scene") as OpsWallSceneId;
        if (el.offsetTop <= mid) current = id;
      }
      setActive(current);
    };

    onScroll();
    scrollRoot.addEventListener("scroll", onScroll, { passive: true });
    return () => scrollRoot.removeEventListener("scroll", onScroll);
  }, [scrollRoot]);

  const jump = (id: OpsWallSceneId) => {
    const el = scrollRoot?.querySelector<HTMLElement>(`[data-ops-scene="${id}"]`);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <nav
      className="ops-narrative-nav"
      aria-label="场景导航"
    >
      <button
        type="button"
        className="ops-narrative-nav__back"
        onClick={() => navigate(-1)}
        aria-label="返回"
      >
        ←
      </button>

      <div className="ops-narrative-nav__rail" role="tablist" aria-label="滚动章节">
        {OPS_WALL_SCENES.map((scene) => (
          <button
            key={scene.id}
            type="button"
            role="tab"
            aria-selected={active === scene.id}
            className={cn("ops-narrative-nav__dot", active === scene.id && "ops-narrative-nav__dot--active")}
            onClick={() => jump(scene.id)}
            aria-label={scene.label}
          >
            <span className="ops-narrative-nav__dot-mark" aria-hidden />
            <span className="ops-narrative-nav__dot-label">{scene.label}</span>
          </button>
        ))}
      </div>

      <div className="ops-narrative-nav__status" aria-live="polite">
        <span
          className="ops-narrative-nav__pulse"
          data-online={isConnected ? "true" : "false"}
          aria-hidden
        />
        <span className="sr-only">{isConnected ? "数据已连接" : "数据未连接"}</span>
      </div>
    </nav>
  );
}
