import type { ReactNode } from "react";
import { Portal } from "@/components/Portal";
import "../cage-form.css";

type CageFormModalPortalProps = {
  children: ReactNode;
};

/**
 * Portals AUP workbench modals to document.body so they escape AdminLayout main's
 * z-[1] stacking context and render above the sticky header (z-20).
 */
export function CageFormModalPortal({ children }: CageFormModalPortalProps) {
  return (
    <Portal>
      <div className="aup-app cage-form-modal-portal">{children}</div>
    </Portal>
  );
}
