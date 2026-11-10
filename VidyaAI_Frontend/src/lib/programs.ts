export type Program = "school" | "jee" | "neet" | "govt";

export const PROGRAMS: Program[] = ["school", "jee", "neet", "govt"];

export const PROGRAM_LABELS: Record<Program, string> = {
  school: "School (Class 1–12)",
  jee: "JEE",
  neet: "NEET",
  govt: "Govt Exams",
};

export const PROGRAM_SHORT: Record<Program, string> = {
  school: "School",
  jee: "JEE",
  neet: "NEET",
  govt: "Govt Exams",
};

export function normalizeProgram(value: string | undefined | null): Program {
  if (!value) return "school";
  const v = value.toLowerCase();
  if (v === "competitive") return "jee";
  if (PROGRAMS.includes(v as Program)) return v as Program;
  return "school";
}

export function isSchoolProgram(program: string | undefined | null): boolean {
  return normalizeProgram(program) === "school";
}

export function hasSchedule(program: string | undefined | null): boolean {
  return isSchoolProgram(program);
}

export function programNav(program: string | undefined | null) {
  const p = normalizeProgram(program);
  const base = [
    { href: "/dashboard/student", label: "Dashboard" },
    { href: "/dashboard/student/lectures", label: "Live Class" },
    { href: "/dashboard/student/recordings", label: "Recordings" },
    { href: "/dashboard/student/notes", label: "Notes" },
    { href: "/dashboard/student/practice", label: "Practice" },
    { href: "/dashboard/student/support", label: "Support" },
  ];
  if (hasSchedule(p)) {
    return [
      base[0],
      { href: "/dashboard/student/schedule", label: "My Schedule" },
      ...base.slice(1),
    ];
  }
  return base;
}

/** Demo International School — rotated with backend seed. */
export const DEMO_SCHOOL_CREDENTIALS = {
  school: "Demo International School",
  superAdmin: { email: "superadmin@edu.com", password: "SuperAdmin@2026" },
  schoolAdmin: { email: "school-admin@demo.edu", password: "SchoolAdmin@2026" },
  children: [
    { email: "student@demo.edu", password: "ChildRahul@2026", label: "Rahul Verma (Class 9)" },
    { email: "ananya@demo.edu", password: "ChildAnanya@2026", label: "Ananya Verma (Class 10)" },
  ],
  parent: {
    phone: "9876543210",
    password: "ParentVerma@2026",
    label: "Mr. Rajesh Verma (both children)",
  },
} as const;
