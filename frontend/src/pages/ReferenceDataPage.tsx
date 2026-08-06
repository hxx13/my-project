import { useMemo } from "react";
import { useLocation } from "react-router-dom";
import ReferenceDataManager from "@/features/reference-data/ReferenceDataManager";

export default function ReferenceDataPage() {
  const { pathname } = useLocation();

  const mode = useMemo<"admin" | "console" | "student">(() => {
    if (pathname.includes("/admin/animal-order")) return "admin";
    if (pathname.includes("/console/animal-order")) return "console";
    return "student";
  }, [pathname]);

  return <ReferenceDataManager mode={mode} />;
}
