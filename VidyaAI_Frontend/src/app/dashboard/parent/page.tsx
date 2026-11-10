"use client";

import { useCallback, useEffect, useState } from "react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { ParentControlPanel } from "@/components/parent/ParentControlPanel";
import { api } from "@/lib/api";
import type { MyStudentPerformanceAnalytics, User } from "@/types";

export default function ParentDashboardPage() {
  const [children, setChildren] = useState<User[]>([]);
  const [selectedChildId, setSelectedChildId] = useState<number | null>(null);
  const [performance, setPerformance] = useState<MyStudentPerformanceAnalytics | null>(null);
  const [loadingChildren, setLoadingChildren] = useState(true);
  const [loadingPerformance, setLoadingPerformance] = useState(false);
  const [error, setError] = useState("");
  const [reportsRefreshKey, setReportsRefreshKey] = useState(0);

  const loadChildren = useCallback(async () => {
    setLoadingChildren(true);
    setError("");
    try {
      const rows = await api.parentChildren();
      setChildren(rows);
      setSelectedChildId((current) => {
        if (current && rows.some((row) => row.id === current)) return current;
        return rows[0]?.id ?? null;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load children");
    } finally {
      setLoadingChildren(false);
    }
  }, []);

  useEffect(() => {
    void loadChildren();
  }, [loadChildren]);

  useEffect(() => {
    if (!selectedChildId) {
      setPerformance(null);
      return;
    }

    let cancelled = false;
    setLoadingPerformance(true);
    setError("");
    api
      .parentChildPerformance(selectedChildId)
      .then((data) => {
        if (!cancelled) setPerformance(data);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load performance");
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingPerformance(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedChildId]);

  const refresh = () => {
    void loadChildren();
    setReportsRefreshKey((n) => n + 1);
    if (selectedChildId) {
      setLoadingPerformance(true);
      api
        .parentChildPerformance(selectedChildId)
        .then(setPerformance)
        .catch((err) => setError(err instanceof Error ? err.message : "Failed to load performance"))
        .finally(() => setLoadingPerformance(false));
    }
  };

  return (
    <DashboardShell title="Parental Control">
      <ParentControlPanel
        linkedChildren={children}
        selectedChildId={selectedChildId}
        onSelectChild={setSelectedChildId}
        performance={performance}
        loadingChildren={loadingChildren}
        loadingPerformance={loadingPerformance}
        error={error}
        onRefresh={refresh}
        reportsRefreshKey={reportsRefreshKey}
      />
    </DashboardShell>
  );
}
