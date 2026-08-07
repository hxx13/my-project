import { useState, useEffect, useRef } from "react";

export function useAgvUndo() {
  const undoStackRef = useRef<{ label: string; undo: () => void }[]>([]);
  const [undoLabel, setUndoLabel] = useState<string | null>(null);

  const pushUndo = (label: string, undo: () => void) => {
    undoStackRef.current.push({ label, undo });
    if (undoStackRef.current.length > 30) undoStackRef.current.shift();
    setUndoLabel(label);
  };

  const handleUndoRef = useRef(() => {});
  handleUndoRef.current = () => {
    const entry = undoStackRef.current.pop();
    if (entry) {
      entry.undo();
      setUndoLabel(
        undoStackRef.current.length > 0
          ? undoStackRef.current[undoStackRef.current.length - 1].label
          : null,
      );
    }
  };
  const handleUndo = () => handleUndoRef.current();

  // Ctrl+Z 监听
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        (e.ctrlKey || e.metaKey) &&
        e.key === "z" &&
        !e.shiftKey &&
        undoStackRef.current.length > 0
      ) {
        e.preventDefault();
        handleUndoRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return { undoLabel, pushUndo, handleUndo };
}
