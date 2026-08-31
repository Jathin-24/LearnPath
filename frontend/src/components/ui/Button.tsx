import * as React from "react";
import { cn } from "../../utils/classNames";
import { Loader2 } from "lucide-react";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline" | "ghost" | "danger";
  size?: "sm" | "md" | "lg" | "icon";
  isLoading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", isLoading, children, disabled, ...props }, ref) => {
    
    const baseStyles = "inline-flex items-center justify-center rounded-xl font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700/50 disabled:pointer-events-none disabled:opacity-50";
    
    const variants = {
      primary: "bg-emerald-800 text-amber-50 shadow-[0_10px_24px_rgba(13,89,55,0.22)] hover:-translate-y-0.5 hover:bg-emerald-900 hover:shadow-[0_14px_28px_rgba(13,89,55,0.3)]",
      secondary: "bg-emerald-100 text-emerald-950 hover:-translate-y-0.5 hover:bg-emerald-200",
      outline: "border border-emerald-900/15 bg-amber-50/60 text-emerald-950 hover:-translate-y-0.5 hover:border-emerald-700/30 hover:bg-emerald-50",
      ghost: "bg-transparent text-emerald-900 shadow-none hover:bg-emerald-900/8",
      danger: "border border-red-700/15 bg-red-50 text-red-700 shadow-none hover:bg-red-100",
    };

    const sizes = {
      sm: "h-9 px-3 text-xs",
      md: "h-10 px-4 py-2 text-sm",
      lg: "h-11 px-8 text-base",
      icon: "h-10 w-10",
    };

    return (
      <button
        ref={ref}
        disabled={isLoading || disabled}
        className={cn(baseStyles, variants[variant], sizes[size], className)}
        {...props}
      >
        {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {children}
      </button>
    );
  }
);
Button.displayName = "Button";

export { Button };
