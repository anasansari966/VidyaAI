"use client";

import { useEffect, useState } from "react";
import { Building2 } from "lucide-react";
import { api } from "@/lib/api";
import {
  adminPathRequiresSchool,
  getSchoolContextId,
  setSchoolContextId,
} from "@/lib/schoolContext";
import type { School } from "@/types";
import { Select } from "@/components/ui/Select";

export function SuperAdminSchoolBar({ pathname }: { pathname: string }) {
  const [schools, setSchools] = useState<School[]>([]);
  const [selected, setSelected] = useState<number | "">("");

  useEffect(() => {
    api.adminSchools().then(setSchools).catch(() => setSchools([]));
    const ctx = getSchoolContextId();
    if (ctx) setSelected(ctx);
  }, []);

  if (!adminPathRequiresSchool(pathname)) return null;

  return (
    <div className="glass mb-4 flex flex-col gap-3 rounded-2xl border border-violet-500/20 bg-violet-500/5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-2 text-sm text-violet-100">
        <Building2 className="h-4 w-4 shrink-0" aria-hidden />
        <span>
          <strong className="font-semibold">God mode:</strong> pick a school to manage books,
          students, schedules & practice.
        </span>
      </div>
      <div className="w-full sm:max-w-xs">
        <Select
          value={selected ? String(selected) : ""}
          onChange={(value) => {
            const id = value ? Number(value) : null;
            setSelected(id ?? "");
            setSchoolContextId(id);
            window.dispatchEvent(new Event("vidyaai:school-context"));
          }}
          placeholder="Select school context…"
          options={schools.map((s) => ({
            value: String(s.id),
            label: s.name,
          }))}
          aria-label="School context"
        />
      </div>
    </div>
  );
}
