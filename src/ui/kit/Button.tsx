import type { ButtonHTMLAttributes } from 'react';

/** The one button of the haunted skin. */
export default function Button({ className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" {...rest} className={className ? `kit-button ${className}` : 'kit-button'} />;
}
