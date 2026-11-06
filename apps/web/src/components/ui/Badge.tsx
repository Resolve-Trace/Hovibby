import { clsx } from "clsx";

const STATUS_CLASSES: Record<string, string> = {
  submitted: "badge-yellow",
  assigned: "badge-blue",
  under_investigation: "badge-blue",
  awaiting_info: "badge-slate",
  awaiting_confirmation: "badge-slate",
  resolution_proposed: "badge-slate",
  resolved: "badge-green",
  disputed: "badge-red",
  under_appeal: "badge-yellow",
  escalated: "badge-red",
  closed: "badge-green",
};

interface BadgeProps {
  children: React.ReactNode;
  variant?: "blue" | "green" | "yellow" | "red" | "slate" | "demo";
  className?: string;
}

export function Badge({ children, variant = "slate", className }: BadgeProps) {
  return (
    <span className={clsx(`badge badge-${variant}`, className)}>
      {children}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_CLASSES[status] ?? "badge-slate";
  return (
    <span className={clsx("badge", cls)}>
      {status.replace(/_/g, " ")}
    </span>
  );
}
