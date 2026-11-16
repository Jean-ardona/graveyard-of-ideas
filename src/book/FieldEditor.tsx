import { useState } from 'react';
import { maxLengthOf } from '../domain';
import { appStore } from '../store/appStore';
import { BOOK_BODY_STACK } from './bookFonts';
import { BOOK_LOOK } from './bookLook';
import type { PageField } from './bookPageLayout';
import { PAGE_METRICS, PAGE_REFERENCE_WIDTH_PX } from './leafFaces';

const DESCRIPTION_ERROR = 'The first page cannot be left empty. Your last saved words are kept.';

export type FieldSpec = Pick<PageField, 'field' | 'label' | 'multiline'>;

interface FieldEditorProps {
  projectId: string;
  spec: FieldSpec;
  saved: string;
  /** Width of the page in CSS pixels; sizes are `PAGE_METRICS` times this. */
  pageWidth?: number;
}

/** One text field. Each change is saved at once; text the domain rejects stays on screen but unsaved. */
export default function FieldEditor({ projectId, spec, saved, pageWidth = PAGE_REFERENCE_WIDTH_PX }: FieldEditorProps) {
  const [text, setText] = useState(saved);
  const [error, setError] = useState<string | null>(null);
  const id = `book-${projectId}-${spec.field}`;
  const m = PAGE_METRICS;
  const size = (value: number): string => `${value * pageWidth}px`;

  function change(value: string): void {
    setText(value);
    const result = appStore.getState().editProject(projectId, { [spec.field]: value });
    setError(result.ok ? null : DESCRIPTION_ERROR);
  }

  const Input = spec.multiline ? 'textarea' : 'input';
  return (
    <div style={{ marginBottom: size(m.fieldGap) }}>
      <label htmlFor={id} style={{ display: 'block', marginBottom: size(m.labelGap) }}>
        {spec.label}
      </label>
      <Input
        id={id}
        value={text}
        maxLength={maxLengthOf(spec.field)}
        rows={spec.multiline ? m.multilineRows : undefined}
        onChange={(event) => change(event.target.value)}
        style={{
          width: '100%',
          boxSizing: 'border-box',
          padding: `${size(m.fieldPaddingY)} ${size(m.fieldPaddingX)}`,
          background: BOOK_LOOK.fieldFill,
          color: BOOK_LOOK.leafInk,
          border: `${size(m.fieldBorder)} solid ${BOOK_LOOK.fieldBorder}`,
          borderRadius: size(m.fieldRadius),
          fontFamily: BOOK_BODY_STACK,
          fontSize: size(m.bodySize),
        }}
      />
      {error !== null && spec.field === 'description' && (
        <div role="alert" style={{ fontSize: '14px', marginTop: '4px' }}>
          {error}
        </div>
      )}
    </div>
  );
}
