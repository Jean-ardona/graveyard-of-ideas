# Requirements: Graveyard of Ideas core

## Introduction
A first-person 3D night graveyard where each resting project is a small book inside a tomb, plus a central grimoire. Requirements below use EARS notation.

## Requirement 1: Night world and navigation
**User story:** As a user, I want to walk around a small night graveyard, so that my projects feel like places I can visit.
1. WHEN the app starts for the first time THE SYSTEM SHALL show a navigable night scene with a partial, slightly blue moon, mist, a gate, paths, and exactly three tombs.
2. WHEN the user clicks the scene or presses Enter THE SYSTEM SHALL request Pointer Lock, and WHILE the pointer is locked THE SYSTEM SHALL turn the view instantly by the mouse movement times a sensitivity (default 0.0022 rad/pixel, saved in the browser), with no smoothing, acceleration or dead zone, pitch limited to about 75 degrees up and down, any single mouse event larger than 200 pixels on an axis ignored, and a small dot shown at the center of the screen.
   1. WHEN the lock is lost (Escape or focus loss) THE SYSTEM SHALL stop walking, release held keys and show a centered "Click to resume" prompt; a click or Enter locks again.
   2. WHEN a menu, book or the grimoire needs the cursor THE SYSTEM SHALL be able to free the pointer and lock it again without showing the resume prompt while it is freed.
   3. IF Pointer Lock is unavailable or rejected THEN THE SYSTEM SHALL turn the view by click and drag with the same response, keep walking enabled and show no resume prompt.
3. WHEN the user presses ZQSD, WASD or arrow keys THE SYSTEM SHALL move the player within the terrain bounds at 2.0 units per second, or 3.2 units per second while Shift is held.
4. THE SYSTEM SHALL prevent walking through tombs, the gate or the hut and SHALL prevent leaving the terrain.
5. WHEN the player is near an interactive object THE SYSTEM SHALL show a discreet prompt for the available action.

## Requirement 2: Open a tomb and read its book
**User story:** As a user, I want to take a project's book out of its tomb, so that I can reread and edit its story.
1. WHEN the user activates a nearby resting tomb THE SYSTEM SHALL slide the slab open, reveal the cavity and raise the book from it to a reading position, then open the book.
2. WHILE a book is open THE SYSTEM SHALL suspend walking, keep camera and book stable, and make the cursor available for typing and page turning.
3. THE SYSTEM SHALL display four book parts: Ambition, Abandonment, Remains, Second chance.
4. WHEN the user edits a field THE SYSTEM SHALL save the change automatically.
5. WHEN the user closes the book without resurrecting THE SYSTEM SHALL lower it into the cavity, close the slab and restore walking.
6. WHEN the user presses Escape while reading THE SYSTEM SHALL close the book or open the menu without losing saved edits.

## Requirement 3: Central grimoire
**User story:** As a user, I want a central register, so that I can create and find all my projects.
1. THE SYSTEM SHALL provide a grimoire on a lectern in the keeper's hut.
2. THE SYSTEM SHALL let the user create a project with a required name and description and optional goal, abandonment reason, epitaph, notes and links.
3. THE SYSTEM SHALL list all projects and distinguish Resting, Resurrected and Accomplished.
4. WHEN the user selects a resting project THE SYSTEM SHALL offer to guide the player to its tomb through a short transition to a safe point.
5. IF the abandonment reason is unknown THEN THE SYSTEM SHALL still allow saving the project.

## Requirement 4: Burial
**User story:** As a user, I want to entrust a project to the graveyard, so that it gets a place.
1. WHEN the user confirms "Entrust this project to the graveyard" THE SYSTEM SHALL save the project with status Resting and reserve a free grave slot before any animation starts.
2. THE SYSTEM SHALL play a skippable burial sequence: grimoire closes, a book appears, a new tomb appears, the slab opens, the book descends, the slab closes, the name is engraved on the stone.
3. IF no grave slot is free THEN THE SYSTEM SHALL keep the form content, explain the limit, and SHALL NOT overlap tombs.
4. WHEN the burial is skipped THE SYSTEM SHALL show the final state immediately.
5. THE SYSTEM SHALL prevent double clicks from creating duplicate projects.

## Requirement 5: Resurrection
**User story:** As a user, I want to resurrect a project with a realistic first step, so that restarting feels achievable.
1. WHEN the user presses "Resurrect this project" THE SYSTEM SHALL require a next action and SHALL encourage, but not require, a reduced version.
2. WHEN resurrection is confirmed THE SYSTEM SHALL save status Resurrected immediately, keeping content and history.
3. THE SYSTEM SHALL play the book dissolving into amber embers (never blue) until the book has completely disappeared, and only then transform the tomb.
4. WHEN the book has disappeared THE SYSTEM SHALL wrap the tomb in black smoke, form a dark spectral silhouette, let it rise, fly away, fade and vanish.
5. THE SYSTEM SHALL remove the tomb, its collider and all temporary objects after the sequence, and SHALL NOT leave any marker, monument or lantern.
6. THE SYSTEM SHALL keep the specter harmless: it does not chase, attack or remain in the world.
7. WHEN the user skips or reloads during the sequence THE SYSTEM SHALL show the correct final state without replaying it.

## Requirement 6: Managing resurrected and accomplished projects
1. WHEN a project is Resurrected THE SYSTEM SHALL let the user read it, edit the new plan, mark the action done, set a new action, and add notes and links, all in the grimoire.
2. WHEN the user chooses "Let it rest again" THE SYSTEM SHALL set status Resting, assign a free slot, keep identity and notes, and play a short burial variant. A new reason may be proposed but not imposed.
3. WHEN the user chooses "Honor this project" THE SYSTEM SHALL set status Accomplished, allow a final result and link, and create no monument.
4. WHEN the user deletes a project THE SYSTEM SHALL ask for explicit confirmation, treating deletion as separate from burial, resurrection or any visual disappearance.

## Requirement 7: Persistence and portability
1. THE SYSTEM SHALL save automatically to the browser with a versioned schema.
2. THE SYSTEM SHALL export all data to JSON and import JSON with validation and a confirmation before replacing data.
3. IF storage fails THEN THE SYSTEM SHALL show a clear error without losing the in-memory data.
4. THE SYSTEM SHALL state clearly that data is local and can be lost if browser data is cleared.
5. THE SYSTEM SHALL create the three demo projects only on first launch and SHALL NOT refill a collection the user emptied.

## Requirement 8: Quality and comfort
1. THE SYSTEM SHALL offer Low, Medium and High quality, default Low, remembered between sessions.
2. THE SYSTEM SHALL keep reading, editing, burial and resurrection available in every quality level by simplifying effects, not removing functions.
3. THE SYSTEM SHALL provide reduced animations and a menu with: resume, grimoire, quality, reduced animations, export/import, controls.
4. THE SYSTEM SHALL provide a simple non-3D mode giving access to all project data if the 3D scene cannot run.

## Requirement 9: Consistency of animation and data
1. THE SYSTEM SHALL allow only one major cinematic at a time.
2. THE SYSTEM SHALL treat every animation as a representation of already saved state.
3. THE SYSTEM SHALL clean up particles, specters and temporary objects after use.
