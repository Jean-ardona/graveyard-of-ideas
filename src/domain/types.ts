export type Status = 'resting' | 'resurrected' | 'accomplished';

export interface HistoryEntry {
  at: string; // ISO timestamp
  kind: 'created' | 'buried' | 'resurrected' | 'rested' | 'honored' | 'action-done' | 'note';
  text?: string;
}

export interface Project {
  id: string;
  title: string;
  description: string;
  goal?: string;
  abandonReason?: string;
  epitaph?: string;
  notes: string;
  links: string[];
  status: Status;
  slot?: number; // only when resting
  reducedVersion?: string;
  nextAction?: string;
  result?: string;
  resultLink?: string;
  history: HistoryEntry[];
  createdAt: string;
  updatedAt: string;
  buriedAt?: string;
  resurrectedAt?: string;
}

export interface AppData {
  schemaVersion: number;
  projects: Project[];
  seeded: boolean;
  prefs: { quality: 'low' | 'medium' | 'high'; reducedMotion: boolean };
}

export const MAX_SLOTS = 12;
