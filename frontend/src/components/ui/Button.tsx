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
    
    const baseStyles = "inline-flex items-center justify-center rounded-xl font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 disabled:pointer-events-none disabled:opacity-50 shadow-sm";
    
    const variants = {
      primary: "bg-slate-100 text-slate-900 hover:bg-slate-200 shadow-slate-950/50",
      secondary: "bg-slate-800 text-slate-100 hover:bg-slate-800",
      outline: "border border-slate-700 bg-transparent text-slate-100 hover:bg-slate-800",
      ghost: "shadow-none bg-transparent hover:bg-white/10 text-slate-100",
      danger: "bg-red-500/10 text-red-500 hover:bg-red-500/20 border border-red-500/20 shadow-none",
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
