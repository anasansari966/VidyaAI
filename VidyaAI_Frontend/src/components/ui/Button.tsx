import { Loader2 } from "lucide-react";
import { ButtonHTMLAttributes } from "react";

export function Button({
  className = "",
  variant = "primary",
  loading = false,
  children,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "outline";
  loading?: boolean;
}) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60";
  const styles = {
    primary: "btn-primary",
    ghost: "text-slate-300 hover:text-white hover:bg-white/5",
    outline: "border border-white/15 text-slate-200 hover:bg-white/5",
  };

  return (
    <button
      className={`${base} ${styles[variant]} ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}
