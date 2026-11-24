/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render } from '@testing-library/react';

vi.mock('@react-three/fiber', () => ({ useFrame: () => undefined }));
vi.mock('../interaction/pointerLock', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../interaction/pointerLock')>();
  return { ...actual, getPointerMode: () => 'fallback' as const, releasePointer: () => undefined, requestPointer: () => undefined };
});

import InteractionController from '../interaction/InteractionController';
import { registerActionHandler, registerInteractable, setFocused } from '../interaction/interactionState';
import type { Interactable } from '../interaction/interactables';
import { createRitualMachine } from '../interaction/ritualMachine';
import type { RitualMachine } from '../interaction/ritualMachine';
import { startRitual } from '../interaction/ritualSession';
import { isStartTurn } from '../interaction/startKeyGuard';
import RitualOverlay from '../ui/ritual/RitualOverlay';

const ACTION = 'test-start-ritual';
const LECTERN: Interactable = {
  id: 'test-lectern',
  position: { x: 0, y: 1, z: 0 },
  radius: 2,
  label: 'Write',
  action: ACTION,
  enabled: true,
};

const field = (): HTMLInputElement | null => document.getElementById('ritual-field') as HTMLInputElement | null;
const nextTurn = (): Promise<void> => act(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));

/**
 * One key press as a browser runs it: keydown first, then, unless the keydown was prevented, the letter is
 * typed into whatever has focus at that moment (here, the field the keydown may have just focused).
 */
function pressE(repeat = false): boolean {
  const typed = fireEvent.keyDown(window, { key: 'e', repeat });
  const target = document.activeElement;
  if (typed && target instanceof HTMLInputElement) fireEvent.change(target, { target: { value: `${target.value}e` } });
  return typed;
}

let machine: RitualMachine;
const removers: (() => void)[] = [];

beforeEach(() => {
  machine = createRitualMachine();
  removers.push(registerInteractable(LECTERN));
  removers.push(registerActionHandler(ACTION, () => startRitual(machine)));
  render(
    <>
      <InteractionController />
      <RitualOverlay machine={machine} />
    </>,
  );
  setFocused(LECTERN);
});

afterEach(() => {
  cleanup();
  while (removers.length > 0) removers.pop()?.();
  setFocused(null);
});

describe('the E that starts the ritual', () => {
  it('starts the ritual, focuses the first field and types nothing into it', () => {
    expect(pressE()).toBe(false);
    expect(machine.phase()).toBe('writing');
    expect(document.activeElement).toBe(field());
    expect(field()?.value).toBe('');
    expect(machine.state.draft.title).toBe('');
  });

  it('drops an input that still reaches the first field in the same event turn', () => {
    pressE();
    expect(isStartTurn()).toBe(true);
    fireEvent.change(field() as HTMLInputElement, { target: { value: 'e' } });
    expect(machine.state.draft.title).toBe('');
    expect(field()?.value).toBe('');
  });

  it('does nothing more while E is held (key repeat)', () => {
    pressE();
    const version = machine.version();
    for (let i = 0; i < 5; i++) pressE(true);
    expect(machine.version()).toBe(version);
    expect(machine.state.draft.title).toBe('');
    expect(field()?.value).toBe('');
  });

  it('lets typing work normally after the start turn, the letter e included', async () => {
    pressE();
    await nextTurn();
    expect(isStartTurn()).toBe(false);
    fireEvent.change(field() as HTMLInputElement, { target: { value: 'Tide' } });
    expect(machine.state.draft.title).toBe('Tide');
    // A real E typed in the field is text: the interaction key ignores typing targets.
    const typed = fireEvent.keyDown(field() as HTMLInputElement, { key: 'e' });
    expect(typed).toBe(true);
    fireEvent.change(field() as HTMLInputElement, { target: { value: 'Tide e' } });
    expect(machine.state.draft.title).toBe('Tide e');
    expect(machine.phase()).toBe('writing');
  });

  it('does not prevent E when there is nothing to activate', () => {
    setFocused(null);
    expect(fireEvent.keyDown(window, { key: 'e' })).toBe(true);
    expect(machine.phase()).toBe('idle');
    expect(isStartTurn()).toBe(false);
  });
});
