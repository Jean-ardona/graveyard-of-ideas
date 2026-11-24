import type { HTMLAttributes } from 'react';

/** A night-blue surface for grouped content. */
export default function Panel({ className, ...rest }: HTMLAttributes<HTMLElement>) {
  return <section {...rest} className={className ? `kit-panel ${className}` : 'kit-panel'} />;
}
