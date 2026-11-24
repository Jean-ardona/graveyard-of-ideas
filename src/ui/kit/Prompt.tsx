import type { HTMLAttributes } from 'react';

interface PromptProps extends HTMLAttributes<HTMLDivElement> {
  /** Where the prompt sits: below the crosshair, or in the middle of the window. */
  place?: 'below' | 'center' | 'bottom' | 'corner';
}

/** A short, non-interactive line over the scene. Hidden prompts stay in place so they can fade. */
export default function Prompt({ place = 'below', className, ...rest }: PromptProps) {
  return <div role="status" {...rest} className={`kit-prompt kit-prompt-${place}${className ? ` ${className}` : ''}`} />;
}
