import { useCallback, useState } from "react";
import { OpsScrollNav } from "./OpsScrollNav";
import { useOpsWallData } from "./useOpsWallData";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion";
import { SceneHero } from "./scenes/SceneHero";
import { SceneCampus } from "./scenes/SceneCampus";
import { SceneFlow } from "./scenes/SceneFlow";
import { SceneRooms } from "./scenes/SceneRooms";
import { SceneRankings } from "./scenes/SceneRankings";
import { ScenePresence } from "./scenes/ScenePresence";
import { SceneRules } from "./scenes/SceneRules";
import { SceneLive } from "./scenes/SceneLive";
import "./dashboardPreviewPage.css";

export function OpsWallShell() {
  const data = useOpsWallData();
  const reducedMotion = usePrefersReducedMotion();
  const [scrollRoot, setScrollRoot] = useState<HTMLElement | null>(null);
  const bindScroll = useCallback((el: HTMLDivElement | null) => {
    setScrollRoot(el);
  }, []);

  return (
    <div data-ops-wall-root data-animal-cockpit-root className="ops-narrative-root">
      <OpsScrollNav scrollRoot={scrollRoot} isConnected={data.isConnected} />

      <div ref={bindScroll} className="ops-narrative-scroll" data-ops-wall-scroll>
        <SceneHero grandTotal={data.grandTotal} isConnected={data.isConnected} reducedMotion={reducedMotion} />
        <SceneCampus
          grandTotal={data.grandTotal}
          pudongTotal={data.pudongTotal}
          puxiTotal={data.puxiTotal}
          reducedMotion={reducedMotion}
        />
        <SceneFlow lineData={data.lineData} reducedMotion={reducedMotion} />
        <SceneRooms
          pudongRooms={data.stats?.pudongPie ?? []}
          puxiRooms={data.stats?.puxiPie ?? []}
          loading={!data.stats}
          reducedMotion={reducedMotion}
        />
        <SceneRankings reducedMotion={reducedMotion} />
        <ScenePresence
          pudongCards={data.pudongCards}
          puxiCards={data.puxiCards}
          loading={data.retentionLoading}
          reducedMotion={reducedMotion}
        />
        <SceneRules
          runtimeConfig={data.runtimeConfig}
          violationItems={data.violationBoard?.items ?? []}
          reducedMotion={reducedMotion}
        />
        <SceneLive events={data.recentEnters} reducedMotion={reducedMotion} />
      </div>
    </div>
  );
}
