import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  listTelemetryMetricKinds,
  listTelemetryWatchlistZonesWithTags,
} from "@/api/domains/telemetryWatchlistAdmin.api";
import {
  buildWatchlistVariableCatalog,
  type WatchlistVariableCatalog,
} from "@/features/telemetry-insights/buildWatchlistVariableCatalog";

const CATALOG_KEY = ["telemetry", "watchlists", "variable-catalog"] as const;

export function useWatchlistVariableCatalog() {
  const zonesQ = useQuery({
    queryKey: [...CATALOG_KEY, "zones"],
    queryFn: listTelemetryWatchlistZonesWithTags,
    staleTime: 60_000,
  });
  const kindsQ = useQuery({
    queryKey: [...CATALOG_KEY, "metric-kinds"],
    queryFn: listTelemetryMetricKinds,
    staleTime: 120_000,
  });

  const catalog = useMemo((): WatchlistVariableCatalog => {
    if (!zonesQ.data || !kindsQ.data) {
      return { entries: [], floors: [], bundleCodes: [], metricKindCodes: [] };
    }
    return buildWatchlistVariableCatalog(zonesQ.data, kindsQ.data);
  }, [zonesQ.data, kindsQ.data]);

  return {
    catalog,
    isLoading: zonesQ.isLoading || kindsQ.isLoading,
    isError: zonesQ.isError || kindsQ.isError,
    error: (zonesQ.error ?? kindsQ.error) as Error | null,
    refetch: () => {
      void zonesQ.refetch();
      void kindsQ.refetch();
    },
  };
}
