/**
 * UI state for the timeline
 * For core logic, use EditorCore instead.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

interface TimelineStore {
	snappingEnabled: boolean;
	toggleSnapping: () => void;
	rippleEditingEnabled: boolean;
	toggleRippleEditing: () => void;
	magneticMainTrackEnabled: boolean;
	toggleMagneticMainTrack: () => void;
	expandedElementIds: Set<string>;
	toggleElementExpanded: (elementId: string) => void;
	/** Elements currently being trimmed; not persisted. */
	resizingElementIds: Set<string>;
	setResizingElementIds: (elementIds: string[]) => void;
}

export const useTimelineStore = create<TimelineStore>()(
	persist(
		(set) => ({
			snappingEnabled: true,

			toggleSnapping: () => {
				set((state) => ({ snappingEnabled: !state.snappingEnabled }));
			},

			rippleEditingEnabled: false,

			toggleRippleEditing: () => {
				set((state) => ({
					rippleEditingEnabled: !state.rippleEditingEnabled,
				}));
			},

			magneticMainTrackEnabled: true,

			toggleMagneticMainTrack: () => {
				set((state) => ({
					magneticMainTrackEnabled: !state.magneticMainTrackEnabled,
				}));
			},

			expandedElementIds: new Set<string>(),

			toggleElementExpanded: (elementId) => {
				set((state) => {
					const next = new Set(state.expandedElementIds);
					if (next.has(elementId)) {
						next.delete(elementId);
					} else {
						next.add(elementId);
					}
					return { expandedElementIds: next };
				});
			},

			resizingElementIds: new Set<string>(),

			setResizingElementIds: (elementIds) => {
				set({ resizingElementIds: new Set(elementIds) });
			},
		}),
		{
			name: "timeline-store",
			partialize: (state) => ({
				snappingEnabled: state.snappingEnabled,
				rippleEditingEnabled: state.rippleEditingEnabled,
				magneticMainTrackEnabled: state.magneticMainTrackEnabled,
			}),
		},
	),
);
