import { useRef } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { motion } from "framer-motion";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps
  extends Omit<
    ButtonHTMLAttributes<HTMLButtonElement>,
    | "onAnimationStart"
    | "onAnimationEnd"
    | "onAnimationIteration"
    | "onDrag"
    | "onDragStart"
    | "onDragEnd"
    | "onDragEnter"
    | "onDragLeave"
    | "onDragOver"
    | "onDrop"
  > {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: ReactNode;
  icon?: ReactNode;
  iconRight?: ReactNode;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary: "bg-fg text-white dark:bg-accent dark:text-[#0A0A0A] hover:bg-fg/90 dark:hover:bg-accent-dark border-2 border-fg dark:border-accent shadow-[2px_2px_0_#171717] dark:shadow-[2px_2px_0_#8B7CF6] active:shadow-none active:translate-x-[2px] active:translate-y-[2px]",
  secondary: "bg-surface text-fg border border-border hover:bg-bg-secondary dark:border-accent/30 dark:hover:bg-accent/10",
  ghost: "bg-bg-secondary/70 text-fg-secondary hover:text-fg hover:bg-bg-secondary dark:bg-surface-hover dark:hover:bg-accent/15 dark:hover:text-accent",
  danger: "bg-danger text-white dark:bg-danger dark:text-[#0A0A0A] hover:bg-danger/90 dark:hover:bg-danger/80 border-2 border-danger shadow-[2px_2px_0_#DC2626] dark:shadow-[2px_2px_0_#991B1B] active:shadow-none active:translate-x-[2px] active:translate-y-[2px]",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "px-3.5 py-1.5 text-xs",
  md: "px-5 py-2 text-sm",
  lg: "px-7 py-2.5 text-base",
};

export default function Button({
  variant = "primary",
  size = "md",
  children,
  icon,
  iconRight,
  className = "",
  disabled,
  ...props
}: ButtonProps) {
  const btnRef = useRef<HTMLButtonElement>(null);

  const createRipple = (e: React.MouseEvent<HTMLButtonElement>) => {
    const btn = btnRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const ripple = document.createElement("span");
    ripple.className = "ripple-effect";
    ripple.style.left = `${e.clientX - rect.left}px`;
    ripple.style.top = `${e.clientY - rect.top}px`;
    btn.appendChild(ripple);
    setTimeout(() => ripple.remove(), 600);
  };

  return (
    <motion.button
      ref={btnRef}
      whileHover={{ scale: disabled ? 1 : 1.02 }}
      whileTap={{ scale: disabled ? 1 : 0.98 }}
      className={`
        inline-flex items-center justify-center gap-2
        font-medium rounded-lg relative overflow-hidden
        transition-all duration-150 ease-in-out
        disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none
        ${variantClasses[variant]}
        ${sizeClasses[size]}
        ${className}
      `}
      disabled={disabled}
      onClick={createRipple}
      {...props}
    >
      {icon && <span className="flex-shrink-0">{icon}</span>}
      {children}
      {iconRight && <span className="flex-shrink-0">{iconRight}</span>}
    </motion.button>
  );
}
