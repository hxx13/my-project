import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { buildToolbarActions } from "../../event-assignment/eventAssignment.config";

gsap.registerPlugin(useGSAP);

interface AssignmentToolbarProps {
  isSaving: boolean;
  isDirty: boolean;
  onReset: () => void;
  onSave: () => void;
  lastSavedAt?: number;
}

export function AssignmentToolbar({ isSaving, isDirty, onReset, onSave, lastSavedAt }: AssignmentToolbarProps) {
  const toolbarRef = useRef<HTMLDivElement>(null);
  const saveBtnRef = useRef<HTMLButtonElement>(null);
  const actions = buildToolbarActions({ isSaving, isDirty });

  useGSAP(
    () => {
      if (!toolbarRef.current) return;
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reduced) return;
      gsap.fromTo(
        toolbarRef.current,
        { opacity: 0, y: 10 },
        { opacity: 1, y: 0, duration: 0.35, ease: "power2.out", clearProps: "transform,opacity" },
      );
    },
    { scope: toolbarRef },
  );

  useGSAP(
    () => {
      if (!lastSavedAt || !saveBtnRef.current) return;
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reduced) return;
      gsap.fromTo(
        saveBtnRef.current,
        { scale: 1 },
        { scale: 1.04, duration: 0.12, yoyo: true, repeat: 1, ease: "power1.inOut", clearProps: "transform" },
      );
    },
    { dependencies: [lastSavedAt ?? 0] },
  );

  return (
    <div className="nhp-assign-toolbar" ref={toolbarRef}>
      {actions.map((action) => {
        const isSave = action.id === "save";
        const onClick = action.id === "reset" ? onReset : onSave;
        const label = isSave && isSaving ? (action.pendingLabel ?? action.label) : action.label;
        return (
          <button
            key={action.id}
            ref={isSave ? saveBtnRef : undefined}
            type="button"
            className={`btn ${action.variant === "primary" ? "primary" : "ghost"} small`}
            disabled={action.disabled}
            onClick={onClick}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
