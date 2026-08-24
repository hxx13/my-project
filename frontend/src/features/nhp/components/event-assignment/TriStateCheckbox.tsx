import { useEffect, useRef } from "react";
import type { AssignmentTriState } from "../../event-assignment/eventAssignment.types";

interface TriStateCheckboxProps {
  state: AssignmentTriState;
  onChange: () => void;
  title?: string;
  className?: string;
}

/** Indeterminate-aware checkbox for row/column bulk toggles */
export function TriStateCheckbox({ state, onChange, title, className }: TriStateCheckboxProps) {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (ref.current) ref.current.indeterminate = state === "some";
  }, [state]);

  return (
    <input
      ref={ref}
      type="checkbox"
      className={className ?? "nhp-assign-check"}
      checked={state === "all"}
      onChange={onChange}
      title={title}
      aria-checked={state === "some" ? "mixed" : state === "all"}
    />
  );
}
