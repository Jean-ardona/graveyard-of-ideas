import { useState } from 'react';
import { maxLengthOf } from '../domain';
import type { Project } from '../domain';
import { appStore } from '../store/appStore';
import { BOOK_PARTS } from './bookParts';
import type { BookFieldSpec } from './bookParts';
import { closeBook } from './readingBook';

const PANEL_STYLE: React.CSSProperties = {
  position: 'fixed',
  top: '50%',
  left: '50%',
  transform: 'translate(-50%, -50%)',
  width: 'min(640px, 92vw)',
  maxHeight: '86vh',
  overflowY: 'auto',
  padding: '20px 24px',
  background: '#b9c3d6',
  color: '#1a2238',
  border: '6px solid #2d3f63',
  borderRadius: '4px',
  fontFamily: 'serif',
  zIndex: 200,
};

const TAB_STYLE: React.CSSProperties = {
  padding: '4px 10px',
  background: 'transparent',
  border: '1px solid #2d3f63',
  borderRadius: '3px',
  color: '#1a2238',
  fontFamily: 'serif',
  fontSize: '15px',
  cursor: 'pointer',
};

const INPUT_STYLE: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '6px 8px',
  background: '#dfe5f0',
  color: '#1a2238',
  border: '1px solid #5a6a84',
  borderRadius: '3px',
  fontFamily: 'serif',
  fontSize: '16px',
};

const DESCRIPTION_ERROR = 'The first page cannot be left empty. Your last saved words are kept.';

interface FieldEditorProps {
  projectId: string;
  spec: BookFieldSpec;
  saved: string;
}

/** One text field. Each change is saved at once; text the domain rejects stays on screen but unsaved. */
function FieldEditor({ projectId, spec, saved }: FieldEditorProps) {
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

/**
 * The open pages of a book: four parts, each with its fields, as ordinary HTML so text stays
 * crisp and editable. Edits go to the saved store; this component keeps only the text being typed.
 */
export default function BookPages({ project }: { project: Project }) {
  const [partIndex, setPartIndex] = useState(0);
  const part = BOOK_PARTS[partIndex] ?? BOOK_PARTS[0]!;

  return (
    <section role="dialog" aria-label={project.title} style={PANEL_STYLE}>
      <h2 style={{ margin: '0 0 12px', fontWeight: 'normal' }}>{project.title}</h2>
      <div role="tablist" style={{ display: 'flex', gap: '6px', marginBottom: '16px', flexWrap: 'wrap' }}>
        {BOOK_PARTS.map((candidate, index) => (
          <button
            key={candidate.id}
            role="tab"
            aria-selected={index === partIndex}
            onClick={() => setPartIndex(index)}
            style={{ ...TAB_STYLE, background: index === partIndex ? '#9db4e0' : 'transparent' }}
          >
            {candidate.title}
          </button>
        ))}
      </div>
      {part.fields.map((spec) => (
        <FieldEditor
          key={`${project.id}-${spec.field}`}
          projectId={project.id}
          spec={spec}
          saved={project[spec.field] ?? ''}
        />
      ))}
      <button onClick={closeBook} style={TAB_STYLE}>
        Close the book
      </button>
    </section>
  );
}
