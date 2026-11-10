import { AuthForm } from "@/components/auth/AuthForm";
import type { UserRole } from "@/types";
import { notFound } from "next/navigation";

const roleMap: Record<string, UserRole> = {
  "super-admin": "super_admin",
  admin: "admin",
  student: "student",
};

export default async function SignupPage({ params }: { params: Promise<{ role: string }> }) {
  const { role: roleSlug } = await params;
  const role = roleMap[roleSlug];
  if (!role) notFound();
  return <AuthForm mode="signup" role={role} />;
}
