"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

// ── Button ───────────────────────────────────────────────────
const buttonVariants = cva(
  // appearance-none + border-transparent neutralise the native button chrome
  // (Preflight is off during the migration), cursor-pointer for affordance.
  "inline-flex cursor-pointer appearance-none items-center justify-center gap-2 whitespace-nowrap rounded-md border border-transparent font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 disabled:opacity-50 disabled:pointer-events-none",
  {
    variants: {
      variant: {
        default: "bg-brand text-white hover:bg-brand-700",
        secondary: "border border-border bg-card text-fg hover:bg-brand-soft hover:text-brand-700",
        success: "bg-success text-white hover:opacity-90",
        danger: "bg-danger text-white hover:opacity-90",
        ghost: "text-fg hover:bg-brand-soft",
      },
      size: {
        default: "h-10 px-4 text-sm",
        sm: "h-8 px-3 text-[13px]",
        lg: "h-11 px-6 text-[15px]",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  )
);
Button.displayName = "Button";

// ── Card ─────────────────────────────────────────────────────
export function Card({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-lg border border-border bg-card shadow-soft", className)} {...p} />;
}
export function CardHeader({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col gap-1 p-5 pb-0", className)} {...p} />;
}
export function CardTitle({ className, ...p }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn("text-base font-bold tracking-tight text-fg", className)} {...p} />;
}
export function CardContent({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-5", className)} {...p} />;
}

// ── Input / Label ────────────────────────────────────────────
export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "w-full rounded-md border border-border bg-card-2 px-3 py-2.5 text-base text-fg",
        "placeholder:text-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30",
        className
      )}
      {...props}
    />
  )
);
Input.displayName = "Input";

export function Label({ className, ...p }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("mb-1.5 block text-[13px] font-semibold text-fg", className)} {...p} />;
}

// ── Badge ────────────────────────────────────────────────────
const badgeVariants = cva("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold", {
  variants: {
    tone: {
      brand: "bg-brand-soft text-brand-700",
      neutral: "bg-card-2 text-muted",
      success: "bg-success/15 text-success",
      danger: "bg-danger/15 text-danger",
      warning: "bg-gold/15 text-gold",
    },
  },
  defaultVariants: { tone: "neutral" },
});
export function Badge({
  className,
  tone,
  ...p
}: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...p} />;
}
