import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"
import { cn } from "cn"

// Evergreen: Felder sind 48 px hoch mit radius-md, der Rand in border-input hat 3:1 gegen den Grund.
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "h-12 w-full min-w-0 rounded-md border border-input bg-card px-4 text-[15px] text-foreground transition-colors placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:border-border disabled:bg-muted disabled:text-muted-foreground aria-invalid:border-2 aria-invalid:border-destructive",
        className
      )}
      {...props}
    />
  )
}

export { Input }
