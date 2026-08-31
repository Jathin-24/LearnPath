import * as React from "react";
import { cn } from "../../utils/classNames";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-11 w-full rounded-xl border border-emerald-950/15 bg-amber-50/75 px-3 py-2 text-sm text-emerald-950 placeholder:text-emerald-950/40 shadow-inner shadow-emerald-950/5 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700/40 disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

export { Input };
