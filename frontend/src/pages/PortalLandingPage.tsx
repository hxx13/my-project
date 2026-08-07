import { useState } from "react";
import { PortalHeader } from "@/features/portal/PortalHeader";
import { PortalHero } from "@/features/portal/PortalHero";
import { PortalStatsSection } from "@/features/portal/PortalStatsSection";
import { ModelResourceSection } from "@/features/portal/ModelResourceSection";
import { NewsSection } from "@/features/portal/NewsSection";
import { AboutSection } from "@/features/portal/AboutSection";
import { PortalFooter } from "@/features/portal/PortalFooter";
import { PortalLoginModal } from "@/features/portal/PortalLoginModal";
import { FadeInSection } from "@/components/scroll-reveal";

function Divider() {
  return (
    <div className="relative h-0">
      <div className="absolute inset-x-0 top-0 flex items-center justify-center -translate-y-1/2">
        <div className="w-full h-px bg-gradient-to-r from-transparent via-neutral-300 to-transparent" />
        <div className="absolute size-2 rounded-full bg-amber-400/60 ring-4 ring-white" />
      </div>
    </div>
  );
}

export default function PortalLandingPage() {
  const [loginOpen, setLoginOpen] = useState(false);

  return (
    <div className="min-h-screen bg-white">
      <PortalHeader onOpenLogin={() => setLoginOpen(true)} />
      <PortalHero />
      <Divider />
      <FadeInSection>
        <PortalStatsSection />
      </FadeInSection>
      <Divider />
      <FadeInSection>
        <ModelResourceSection />
      </FadeInSection>
      <Divider />
      <FadeInSection>
        <NewsSection />
      </FadeInSection>
      <Divider />
      <FadeInSection>
        <AboutSection />
      </FadeInSection>
      <PortalFooter onRequestLogin={() => setLoginOpen(true)} />
      <PortalLoginModal open={loginOpen} onClose={() => setLoginOpen(false)} />
    </div>
  );
}
