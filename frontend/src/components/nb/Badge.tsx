import type { ReactNode } from "react";

type BadgeVariant = "default" | "accent" | "purple" | "pink" | "success" | "danger" | "muted";

interface BadgeProps {
  children: ReactNode;
  variant?: BadgeVariant;
  className?: string;
}

const variantClasses: Record<BadgeVariant, string> = {
  default: "bg-bg-secondary text-fg-secondary border-border",
  accent: "bg-accent text-fg border-accent-dark",
  purple: "bg-purple/10 text-purple border-purple/20",
  pink: "bg-pink/10 text-pink border-pink/20",
  success: "bg-success/10 text-success border-success/20",
  danger: "bg-danger/10 text-danger border-danger/20",
  muted: "bg-bg-secondary text-fg-muted border-border",
};

export default function Badge({
  children,
  variant = "default",
  className = "",
}: BadgeProps) {
  return (
    <span
      className={`
        inline-flex items-center
        px-2 py-0.5
        text-xs font-medium
        border rounded-md
        ${variantClasses[variant]}
        ${className}
      `}
    >
      {children}
    </span>
  );
}
