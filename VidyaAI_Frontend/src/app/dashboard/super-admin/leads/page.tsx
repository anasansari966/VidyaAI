"use client";

import { useEffect, useState } from "react";
import { GraduationCap, Mail } from "lucide-react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { api } from "@/lib/api";
import type { DemoLead, DemoLeadStatus, StudentLead, StudentLeadStatus } from "@/types";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";

const demoStatuses: { value: DemoLeadStatus; label: string }[] = [
  { value: "new", label: "New" },
  { value: "contacted", label: "Contacted" },
  { value: "qualified", label: "Qualified" },
  { value: "closed", label: "Closed" },
];

const studentStatuses: { value: StudentLeadStatus; label: string }[] = [
  { value: "registered", label: "Registered" },
  { value: "verified", label: "OTP verified" },
  { value: "paid", label: "Paid" },
  { value: "contacted", label: "Contacted" },
  { value: "closed", label: "Closed" },
];

type LeadTab = "demo" | "students";

export default function SuperAdminLeadsPage() {
  const [tab, setTab] = useState<LeadTab>("students");
  const [demoLeads, setDemoLeads] = useState<DemoLead[]>([]);
  const [studentLeads, setStudentLeads] = useState<StudentLead[]>([]);
  const [demoFilter, setDemoFilter] = useState<DemoLeadStatus | "">("");
  const [studentFilter, setStudentFilter] = useState<StudentLeadStatus | "">("");

  async function loadDemo() {
    const data = await api.demoLeads();
    setDemoLeads(demoFilter ? data.filter((l) => l.status === demoFilter) : data);
  }

  async function loadStudents() {
    const data = await api.studentLeads();
    setStudentLeads(studentFilter ? data.filter((l) => l.status === studentFilter) : data);
  }

  useEffect(() => {
    loadDemo().catch(console.error);
  }, [demoFilter]);

  useEffect(() => {
    loadStudents().catch(console.error);
  }, [studentFilter]);

  return (
    <DashboardShell title="Leads">
      <div className="mb-6 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setTab("students")}
          className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm ${
            tab === "students"
              ? "bg-teal-500/20 text-teal-100 ring-1 ring-teal-400/40"
              : "bg-white/5 text-slate-300 hover:bg-white/10"
          }`}
        >
          <GraduationCap className="h-4 w-4" />
          Student leads
          <span className="rounded-full bg-black/20 px-2 py-0.5 text-xs">{studentLeads.length}</span>
        </button>
        <button
          type="button"
          onClick={() => setTab("demo")}
          className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm ${
            tab === "demo"
              ? "bg-indigo-500/20 text-indigo-100 ring-1 ring-indigo-400/40"
              : "bg-white/5 text-slate-300 hover:bg-white/10"
          }`}
        >
          <Mail className="h-4 w-4" />
          Demo leads
          <span className="rounded-full bg-black/20 px-2 py-0.5 text-xs">{demoLeads.length}</span>
        </button>
      </div>

      {tab === "students" ? (
        <>
          <div className="glass mb-6 max-w-xs rounded-2xl p-4">
            <Select
              value={studentFilter}
              onChange={(v) => setStudentFilter((v as StudentLeadStatus) || "")}
              placeholder="All statuses"
              options={studentStatuses.map((s) => ({ value: s.value, label: s.label }))}
              aria-label="Filter student leads"
            />
          </div>
          <div className="space-y-4">
            {studentLeads.map((lead) => (
              <div key={lead.id} className="glass rounded-2xl p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold text-white">{lead.full_name}</h3>
                      <span className="rounded-full bg-teal-500/15 px-2 py-0.5 text-xs capitalize text-teal-200">
                        {lead.status.replace("_", " ")}
                      </span>
                      {lead.email_verified ? (
                        <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-200">
                          Email verified
                        </span>
                      ) : (
                        <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs text-amber-200">
                          OTP pending
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-slate-400">
                      Individual student
                      {lead.class_grade ? ` · Class ${lead.class_grade}` : ""}
                      {lead.plan_id ? ` · ${lead.plan_id}` : ""}
                      {lead.billing_cycle ? ` · ${lead.billing_cycle.replace("_", " ")}` : ""}
                      {lead.board ? ` · ${lead.board}` : ""}
                      {lead.city ? ` · ${lead.city}` : ""}
                    </p>
                    {(lead.school_name || lead.parent_name) && (
                      <p className="mt-1 text-sm text-slate-500">
                        {lead.school_name || "School not set"}
                        {lead.parent_name ? ` · Parent: ${lead.parent_name}` : ""}
                        {lead.parent_phone ? ` · ${lead.parent_phone}` : ""}
                      </p>
                    )}
                    <p className="mt-2 text-sm">
                      <a href={`mailto:${lead.email}`} className="text-indigo-300 hover:underline">
                        {lead.email}
                      </a>
                      {" · "}
                      <a href={`tel:${lead.phone}`} className="text-indigo-300 hover:underline">
                        {lead.phone}
                      </a>
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {new Date(lead.created_at).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {studentStatuses
                      .filter((s) => s.value !== lead.status)
                      .map((s) => (
                        <Button
                          key={s.value}
                          variant="outline"
                          className="text-xs"
                          onClick={async () => {
                            await api.updateStudentLead(lead.id, { status: s.value });
                            loadStudents();
                          }}
                        >
                          Mark {s.label}
                        </Button>
                      ))}
                  </div>
                </div>
                <textarea
                  className="input-field mt-4 min-h-20 text-sm"
                  placeholder="Internal notes…"
                  defaultValue={lead.admin_notes ?? ""}
                  onBlur={async (e) => {
                    const notes = e.target.value;
                    if (notes === (lead.admin_notes ?? "")) return;
                    await api.updateStudentLead(lead.id, { admin_notes: notes });
                    loadStudents();
                  }}
                />
              </div>
            ))}
            {studentLeads.length === 0 && (
              <div className="glass rounded-2xl p-8 text-center text-slate-400">
                No student leads yet. Individual signups on /pricing appear here before payment.
              </div>
            )}
          </div>
        </>
      ) : (
        <>
          <div className="glass mb-6 max-w-xs rounded-2xl p-4">
            <Select
              value={demoFilter}
              onChange={(v) => setDemoFilter((v as DemoLeadStatus) || "")}
              placeholder="All statuses"
              options={demoStatuses.map((s) => ({ value: s.value, label: s.label }))}
              aria-label="Filter demo leads"
            />
          </div>
          <div className="space-y-4">
            {demoLeads.map((lead) => (
              <div key={lead.id} className="glass rounded-2xl p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold text-white">{lead.full_name}</h3>
                      <span className="rounded-full bg-indigo-500/15 px-2 py-0.5 text-xs capitalize text-indigo-200">
                        {lead.status}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-slate-400">
                      {lead.organization} · {lead.role} · {lead.program}
                      {lead.student_count ? ` · ${lead.student_count} students` : ""}
                    </p>
                    <p className="mt-2 text-sm">
                      <a href={`mailto:${lead.email}`} className="text-indigo-300 hover:underline">
                        {lead.email}
                      </a>
                      {" · "}
                      <a href={`tel:${lead.phone}`} className="text-indigo-300 hover:underline">
                        {lead.phone}
                      </a>
                    </p>
                    {lead.message && <p className="mt-2 text-sm text-slate-300">{lead.message}</p>}
                    <p className="mt-1 text-xs text-slate-500">
                      {new Date(lead.created_at).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {demoStatuses
                      .filter((s) => s.value !== lead.status)
                      .map((s) => (
                        <Button
                          key={s.value}
                          variant="outline"
                          className="text-xs"
                          onClick={async () => {
                            await api.updateDemoLead(lead.id, { status: s.value });
                            loadDemo();
                          }}
                        >
                          Mark {s.label}
                        </Button>
                      ))}
                  </div>
                </div>
                <textarea
                  className="input-field mt-4 min-h-20 text-sm"
                  placeholder="Internal notes…"
                  defaultValue={lead.admin_notes ?? ""}
                  onBlur={async (e) => {
                    const notes = e.target.value;
                    if (notes === (lead.admin_notes ?? "")) return;
                    await api.updateDemoLead(lead.id, { admin_notes: notes });
                    loadDemo();
                  }}
                />
              </div>
            ))}
            {demoLeads.length === 0 && (
              <div className="glass rounded-2xl p-8 text-center text-slate-400">
                No demo leads yet. School book-a-demo requests appear here.
              </div>
            )}
          </div>
        </>
      )}
    </DashboardShell>
  );
}
