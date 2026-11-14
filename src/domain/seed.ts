import type { AppData } from './types';
import { buryNewProject } from './projects';
import type { ProjectInput } from './projects';

/**
 * Demo projects. Book parts map to fields: Ambition = description + goal,
 * Abandonment = abandonReason, Remains = notes, Second chance = reducedVersion.
 */
export const DEMO_PROJECTS: readonly ProjectInput[] = [
  {
    title: 'The Lighthouse Radio',
    description: 'A tiny radio station that plays only the sounds of the coast at night.',
    goal: 'Stream one hour of tides and gulls, every evening.',
    abandonReason: 'The microphone broke and I lost the thread of why it mattered.',
    notes: 'Wiring sketches, a list of quiet bays, one good recording of rain on tin.',
    reducedVersion: 'Publish a single ten minute recording and call it done.',
    epitaph: 'It listened to the sea, then fell silent.',
  },
  {
    title: 'Garden of Small Machines',
    description: 'A kit of paper automata that move when a hand turns a crank.',
    goal: 'Ship a box with five folding patterns.',
    abandonReason: 'Too many ideas at once. Every pattern asked for a new tool.',
    notes: 'Two finished prototypes, a drawer of templates, a page of cutting mistakes.',
    reducedVersion: 'Finish one automaton and share its pattern for free.',
    epitaph: 'Gears turned once, then rested.',
  },
  {
    title: 'Letters to the Next Tenant',
    description: 'A small book of notes about the quirks of an old apartment.',
    goal: 'Collect twenty short entries, each one a tiny story.',
    abandonReason: 'I moved away and the place stopped feeling like mine to describe.',
    notes: 'Seven drafted entries and a photo of the broken stair.',
    reducedVersion: 'Polish the seven entries and print them as a leaflet.',
    epitaph: 'Seven pages, one open door.',
  },
];

/**
 * Adds the demo projects through buryNewProject and sets seeded = true.
 * Returns the data unchanged when it is already seeded, so seeding runs once only.
 */
export function seedDemoProjects(data: AppData, now?: string): AppData {
  if (data.seeded) return data;

  let projects = data.projects;
  for (const input of DEMO_PROJECTS) {
    const result = buryNewProject(input, projects, { now });
    if (result.ok) projects = result.projects;
  }
  return { ...data, projects, seeded: true };
}
