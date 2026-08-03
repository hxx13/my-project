import { useState, useEffect } from "react";

export function useAgvPickMode() {
  const [pickMode, setPickMode] = useState(false);
  const [pickTwoPoint, setPickTwoPoint] = useState(false);
  const [pickAnchor, setPickAnchor] = useState<{ x: number; y: number } | null>(null);
  const [pendingPick, setPendingPick] = useState<
    { x: number; y: number } | { x1: number; y1: number; x2: number; y2: number } | null
  >(null);

  const handleStartPick = () => {
    setPickMode(true);
    setPickTwoPoint(false);
    setPickAnchor(null);
    setPendingPick(null);
  };

  const handleStartRectPick = () => {
    setPickMode(true);
    setPickTwoPoint(true);
    setPickAnchor(null);
    setPendingPick(null);
  };

  const handlePointPicked = (x: number, y: number) => {
    if (pickTwoPoint) {
      if (!pickAnchor) {
        setPickAnchor({ x, y });
      } else {
        setPendingPick({ x1: pickAnchor.x, y1: pickAnchor.y, x2: x, y2: y });
        setPickAnchor(null);
        setPickMode(false);
        setPickTwoPoint(false);
      }
    } else {
      setPendingPick({ x, y });
      setPickMode(false);
    }
  };

  const handleCancelPick = () => {
    setPickMode(false);
    setPickTwoPoint(false);
    setPickAnchor(null);
    setPendingPick(null);
  };

  const handleRectDrawn = (x1: number, y1: number, x2: number, y2: number) => {
    setPendingPick({ x1, y1, x2, y2 });
    setPickAnchor(null);
    setPickMode(false);
    setPickTwoPoint(false);
  };

  // Esc 键取消选点
  useEffect(() => {
    if (!pickMode) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleCancelPick();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pickMode]);

  return {
    pickMode,
    pickTwoPoint,
    pickAnchor,
    pendingPick,
    handleStartPick,
    handleStartRectPick,
    handlePointPicked,
    handleCancelPick,
    handleRectDrawn,
    setPendingPick,
    setPickMode,
    setPickTwoPoint,
    setPickAnchor,
  };
}
