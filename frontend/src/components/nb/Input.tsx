import { forwardRef } from "react";
import type { InputHTMLAttributes, TextareaHTMLAttributes } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, className = "", ...props }, ref) => {
    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label className="text-xs font-medium text-fg-secondary">
            {label}
          </label>
        )}
        <input
          ref={ref}
          className={`
            w-full px-3.5 py-2.5
            border border-border rounded-lg
            bg-surface text-fg text-sm
            outline-none
            transition-all duration-150
            focus:border-fg/30 focus:ring-1 focus:ring-fg/10
            placeholder:text-fg-muted
            ${error ? "border-danger" : ""}
            ${className}
          `}
          {...props}
        />
        {error && (
          <span className="text-xs text-danger">{error}</span>
        )}
      </div>
    );
  }
);

Input.displayName = "Input";

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, className = "", ...props }, ref) => {
    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label className="text-xs font-medium text-fg-secondary">
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          className={`
            w-full px-3.5 py-2.5
            border border-border rounded-lg
            bg-surface text-fg text-sm
            outline-none resize-y min-h-[100px]
            transition-all duration-150
            focus:border-fg/30 focus:ring-1 focus:ring-fg/10
            placeholder:text-fg-muted
            ${error ? "border-danger" : ""}
            ${className}
          `}
          {...props}
        />
        {error && (
          <span className="text-xs text-danger">{error}</span>
        )}
      </div>
    );
  }
);

Textarea.displayName = "Textarea";
