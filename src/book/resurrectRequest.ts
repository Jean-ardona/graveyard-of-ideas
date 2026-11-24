import type { Project, ResurrectInput } from '../domain';

export type ResurrectRequest =
  | { ok: false; error: 'invalid_next_action' }
  | { ok: true; input: ResurrectInput; encourageReduced: boolean };

/**
 * What pressing "Resurrect this project" needs: a next action is required; a smaller version is
 * encouraged when missing but never required. Pure: the saved project goes in, the verdict comes out.
 */
export function checkResurrectRequest(project: Pick<Project, 'nextAction' | 'reducedVersion'>): ResurrectRequest {
  const nextAction = (project.nextAction ?? '').trim();
  if (nextAction === '') return { ok: false, error: 'invalid_next_action' };
  const reducedVersion = (project.reducedVersion ?? '').trim();
  if (reducedVersion === '') return { ok: true, input: { nextAction }, encourageReduced: true };
  return { ok: true, input: { nextAction, reducedVersion }, encourageReduced: false };
}
