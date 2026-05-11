import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-[var(--color-phosphor)] text-[var(--color-ocean-deep)]",
        ocean:
          "border-transparent bg-[var(--color-ocean-deep)] text-white",
        coral:
          "border-transparent bg-[var(--color-coral)] text-white",
        gold:
          "border-transparent bg-[var(--color-gold)] text-[var(--color-ocean-deep)]",
        outline:
          "border-[var(--border)] text-[var(--foreground)]",
        muted:
          "border-transparent bg-[var(--muted)] text-[var(--muted-foreground)]",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
