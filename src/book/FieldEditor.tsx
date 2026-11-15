import { useState } from 'react';
import { maxLengthOf } from '../domain';
import { appStore } from '../store/appStore';
import type { PageField } from './bookPageLayout';

const INPUT_STYLE: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '6px 8px',
  background: '#dde3ee',
  color: '#141c30',
  border: '1px solid #5a6a84',
  borderRadius: '3px',
  fontFamily: 'serif',
  fontSize: '16px',
};

const DESCRIPTION_ERROR = 'The first page cannot be left empty. Your last saved words are kept.';

export type FieldSpec = Pick<PageField, 'field' | 'label' | 'multiline'>;

interface FieldEditorProps {
  projectId: string;
  spec: FieldSpec;
  saved: string;
}

/** One text field. Each change is saved at once; text the domain rejects stays on screen but unsaved. */
export default function FieldEditor({ projectId, spec, saved }: FieldEditorProps) {
  const [text, setText] = useState(saved);
  const [error, setError] = useState<string | null>(null);
  const id = `book-${projectId}-${spec.field}`;

  function change(value: string): void {
    setText(value);
    const result = appStore.getState().editProject(projectId, { [spec.field]: value });
    setError(result.ok ? null : DESCRIPTION_ERROR);
  }

  const Input = spec.multiline ? 'textarea' : 'input';
  return (
    <div style={{ marginBottom: '14px' }}>
      <label htmlFor={id} style={{ display: 'block', marginBottom: '4px' }}>
        {spec.label}
      </label>
      <Input
        id={id}
        value={text}
        maxLength={maxLengthOf(spec.field)}
        rows={spec.multiline ? 5 : undefined}
        onChange={(event) => change(event.target.value)}
        style={INPUT_STYLE}
      />
      {error !== null && spec.field === 'description' && (
        <div role="alert" style={{ fontSize: '14px', marginTop: '4px' }}>
          {error}
        </div>
      )}
    </div>
  );
}
