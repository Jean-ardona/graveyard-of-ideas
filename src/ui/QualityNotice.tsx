import { Prompt } from './kit';

/** Short, calm message shown after the quality was lowered automatically. */
export default function QualityNotice({ message }: { message: string | null }) {
  return (
    <div role="status" aria-live="polite">
      {message !== null && <Prompt place="corner" role="presentation">{message}</Prompt>}
    </div>
  );
}
