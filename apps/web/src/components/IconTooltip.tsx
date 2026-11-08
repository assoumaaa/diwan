import { Tooltip, TooltipContent, TooltipTrigger } from "@rakazo/ui-web";
import type { ComponentProps, ReactElement } from "react";

/** Shows `label` beside an icon-only control on hover and focus; the control keeps its own accessible name. */
export function IconTooltip({
  label,
  side,
  disabled,
  children,
}: {
  label: string;
  side?: ComponentProps<typeof TooltipContent>["side"];
  disabled?: boolean;
  children: ReactElement;
}) {
  return (
    <Tooltip disabled={disabled}>
      <TooltipTrigger render={children} />
      <TooltipContent side={side}>{label}</TooltipContent>
    </Tooltip>
  );
}
