import { PortalHeader } from "@/features/portal/PortalHeader";
import { PortalHero } from "@/features/portal/PortalHero";
import { ModelResourceSection } from "@/features/portal/ModelResourceSection";
import { NewsSection } from "@/features/portal/NewsSection";
import { AboutSection } from "@/features/portal/AboutSection";
import { PortalFooter } from "@/features/portal/PortalFooter";

export default function PortalLandingPage() {
  return (
    <div className="min-h-screen bg-[var(--app-color-surface-page)]">
      <PortalHeader />
      <PortalHero />
      <ModelResourceSection />
      <NewsSection />
      <AboutSection />
      <PortalFooter />
    </div>
  );
}
