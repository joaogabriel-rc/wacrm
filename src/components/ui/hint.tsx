"use client";

import type { ReactElement } from "react";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * A one-line explanation of what a control does, shown on hover and on
 * keyboard focus.
 *
 * Wraps a single element rather than rendering one of its own — the
 * child keeps its layout, classes and event handlers untouched:
 *
 *     <Hint label={t('hints.send')}>
 *       <button onClick={send}><Send /></button>
 *     </Hint>
 *
 * Pass a translated string; never a hardcoded one. Labels are short
 * enough to read at a glance (a clause, not a sentence) and say what
 * the control *does*, not what it is called — the visible label or
 * icon already covers the name.
 *
 * `label` is optional so callers can compute it conditionally; an
 * empty one renders the child alone, with no tooltip wiring at all.
 */
export function Hint({
  label,
  children,
  side = "top",
  align = "center",
}: {
  label?: string | null;
  children: ReactElement;
  side?: "top" | "bottom" | "left" | "right";
  align?: "start" | "center" | "end";
}) {
  if (!label) return children;

  return (
    <Tooltip>
      <TooltipTrigger render={children} />
      <TooltipContent side={side} align={align}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
}
