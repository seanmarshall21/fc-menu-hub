import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

// shadcn/ui's class combiner: clsx for conditional classes, tailwind-merge to
// resolve conflicting Tailwind utilities (last one wins).
export function cn(...inputs) {
  return twMerge(clsx(inputs))
}
