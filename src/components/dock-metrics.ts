/** Shared sizes for the floating tab dock, so screens can reserve exactly the room it needs. */
export const DOCK_PAD = 6;
export const DOCK_ITEM_FULL = 52;
export const DOCK_ITEM_MIN = 44;
export const DOCK_FULL = DOCK_ITEM_FULL + DOCK_PAD * 2; // 64
export const DOCK_MIN = DOCK_ITEM_MIN + DOCK_PAD * 2; // 56
/** the "workout in progress" pill and the gap it keeps above the dock */
export const WORKOUT_PILL = 48 + 10;

/** Distance from the screen bottom the dock sits at (safe-area aware). */
export const dockBottom = (insetBottom: number) => Math.max(insetBottom, 12);

/** Bottom padding that keeps content clear of the dock (and the workout pill when shown). */
export const contentBottomPad = (insetBottom: number, workoutPill: boolean) => dockBottom(insetBottom) + DOCK_FULL + 28 + (workoutPill ? WORKOUT_PILL : 0);
