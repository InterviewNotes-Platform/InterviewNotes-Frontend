import type { TargetLevel } from "./types";

/** The four Behavioral Lessons' levels with the names a reader sees, in the order they are listed (contract §3.4). */
export const TARGET_LEVELS: readonly { value: TargetLevel; label: string }[] = [
   { value: "sde-1", label: "SDE-1" },
   { value: "sde-2", label: "SDE-2" },
   { value: "sde-3", label: "SDE-3" },
   { value: "engineering-manager", label: "Engineering manager" },
];

/** Narrows a stored preference: anything but one of the four levels is treated as no preference. */
export function asTargetLevel(value: string | null | undefined): TargetLevel | null {
   return TARGET_LEVELS.find((level) => level.value === value)?.value ?? null;
}

export function levelLabel(level: TargetLevel): string {
   return TARGET_LEVELS.find((entry) => entry.value === level)?.label ?? level;
}
