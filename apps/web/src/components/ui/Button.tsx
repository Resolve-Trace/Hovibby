import { clsx } from "clsx";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md";
  loading?: boolean;
}

export function Button({
  variant = "secondary",
  size = "md",
  loading,
  disabled,
  children,
  className,
  ...props
}: ButtonProps) {
  const base = "btn";
  const variants = {
    primary: "btn-primary",
    secondary: "btn-secondary",
    ghost: "btn-ghost",
  };
  const sizes = {
    sm: "text-xs px-3 py-1.5",
    md: "text-sm px-4 py-2",
  };

  return (
    <button
      {...props}
      disabled={disabled ?? loading}
      className={clsx(base, variants[variant], sizes[size], className)}
    >
      {loading ? <span className="opacity-60">…</span> : children}
    </button>
  );
}
