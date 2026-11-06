import Link from "next/link";

interface EmptyStateProps {
  icon?: string;
  title: string;
  description: string;
  action?: { label: string; href: string };
}

export function EmptyState({ icon = "📋", title, description, action }: EmptyStateProps) {
  return (
    <div className="p-12 text-center">
      <div className="text-4xl mb-4">{icon}</div>
      <p className="text-slate-300 font-medium text-lg mb-2">{title}</p>
      <p className="text-sm text-slate-500 mb-6 max-w-sm mx-auto">{description}</p>
      {action && (
        <Link href={action.href} className="btn-primary">
          {action.label}
        </Link>
      )}
    </div>
  );
}
