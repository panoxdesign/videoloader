import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

// Evergreen: alle Varianten sind Pillen und mindestens 44 px groß, gefüllt ist nur die
// eine primäre Aktion pro Bereich.
const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center gap-2 rounded-full border border-transparent font-semibold whitespace-nowrap transition-colors duration-[120ms] ease-[cubic-bezier(0.2,0.8,0.2,1)] select-none disabled:pointer-events-none disabled:border-transparent disabled:bg-muted disabled:text-muted-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-[18px]",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary-hover",
        outline: "border-primary bg-transparent text-primary hover:bg-muted",
        quiet: "border-input bg-card text-foreground hover:bg-muted",
        ghost: "bg-transparent text-foreground-secondary hover:bg-muted",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive-hover",
      },
      size: {
        default: "h-11 px-[18px] text-sm",
        lg: "h-12 px-8 text-[15px]",
        icon: "size-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
