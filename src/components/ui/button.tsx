import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-lg font-medium tracking-[-0.005em] cursor-pointer transition-[background-color,border-color,color,box-shadow,transform] duration-200 ease-out active:translate-y-px focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring/80 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-[var(--shadow-ds-sm)] hover:bg-primary/90 hover:shadow-[var(--shadow-ds-md)]",
        premium:
          "relative overflow-hidden border border-transparent text-[color:var(--color-iris-fg)] shadow-[var(--shadow-ds-md)] [background:var(--iris-gradient)] hover:brightness-105 hover:shadow-[var(--shadow-ds-lg)]",
        soft: "bg-primary/10 text-[color:var(--color-iris-ink)] hover:bg-primary/15",
        destructive:
          "bg-destructive text-destructive-foreground shadow-[var(--shadow-ds-xs)] hover:bg-destructive/90",
        outline:
          "border border-border bg-card text-foreground shadow-[var(--shadow-ds-xs)] hover:border-primary/40 hover:bg-secondary",
        secondary:
          "bg-secondary text-secondary-foreground shadow-[var(--shadow-ds-xs)] hover:bg-secondary/80",
        ghost: "text-muted-foreground hover:bg-secondary hover:text-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        xs: "h-7 rounded-md px-2.5 text-xs [&_svg]:size-3.5",
        sm: "h-8 rounded-md px-3 text-xs",
        default: "h-9 px-4 text-sm",
        lg: "h-11 rounded-xl px-6 text-base",
        icon: "h-9 w-9",
        "icon-sm": "h-8 w-8 rounded-md [&_svg]:size-3.5",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);


export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
