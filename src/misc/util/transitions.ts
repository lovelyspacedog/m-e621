import transitions from "../data/transitions.json";

type TransitionEntry = { enter?: string; leave?: string };
type TransitionsData = Record<string, Record<string, TransitionEntry>>;

export const getTransitionName = (type: string, direction: string) => {
  // direction = "none" | "right" | "left"
  // type = "none" | "zoom" | "fade" | ...
  const transition = (transitions as TransitionsData)?.[type]?.[direction];
  return {
    enterTransitionName: transition?.["enter"] || "",
    leaveTransitionName: transition?.["leave"] || "",
  };
};
