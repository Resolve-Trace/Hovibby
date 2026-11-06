import { clsx } from "clsx";

interface CardProps {
  children: React.ReactNode;
  className?: string;
  padding?: boolean;
}

export function Card({ children, className, padding = false }: CardProps) {
  return (
    <div className={clsx("card bg-slate-900", padding && "p-6", className)}>
      {children}
    </div>
  );
}
