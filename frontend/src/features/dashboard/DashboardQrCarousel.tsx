import { useState, useEffect, useRef, type ReactNode } from "react";
import { StudentMobileEntryQr } from "@/components/shared/StudentMobileEntryQr";

interface Props {
  children: ReactNode;
}

export default function DashboardQrCarousel({ children }: Props) {
  const [page, setPage] = useState<0 | 1>(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const resetTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setPage((prev) => (prev === 0 ? 1 : 0));
    }, 8000);
  };

  useEffect(() => {
    resetTimer();
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  const switchTo = (p: 0 | 1) => {
    setPage(p);
    resetTimer();
  };

  return (
    <div className="relative w-full h-full flex flex-col">
      <div className="flex-1 min-h-0 relative">
        <div
          className="absolute inset-0 transition-opacity duration-400"
          style={{ opacity: page === 0 ? 1 : 0, pointerEvents: page === 0 ? "auto" : "none" }}
        >
          {children}
        </div>
        <div
          className="absolute inset-0 flex flex-col items-center justify-center p-4 transition-opacity duration-400"
          style={{ opacity: page === 1 ? 1 : 0, pointerEvents: page === 1 ? "auto" : "none" }}
        >
          <StudentMobileEntryQr />
        </div>
      </div>
      <div className="flex justify-center gap-2 py-2">
        <button
          onClick={() => switchTo(0)}
          className="w-2 h-2 rounded-full transition-colors"
          style={{ background: page === 0 ? "var(--app-color-accent)" : "var(--app-color-border-default)" }}
        />
        <button
          onClick={() => switchTo(1)}
          className="w-2 h-2 rounded-full transition-colors"
          style={{ background: page === 1 ? "var(--app-color-accent)" : "var(--app-color-border-default)" }}
        />
      </div>
    </div>
  );
}
