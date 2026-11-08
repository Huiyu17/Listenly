import type { Exercise } from "../types";

/** Where "continue" should take the user for an exercise in a given state. */
export function continueHref(ex: Pick<Exercise, "id" | "status">): string {
  switch (ex.status) {
    case "transcribed":
      return `/exercises/${ex.id}/review`;
    case "ready":
    case "in-progress":
      return `/exercises/${ex.id}/practice`;
    case "completed":
      return `/exercises/${ex.id}/results`;
  }
}

export const STATUS_LABEL: Record<Exercise["status"], string> = {
  transcribed: "Transcript ready",
  ready: "Not started",
  "in-progress": "In progress",
  completed: "Completed",
};
