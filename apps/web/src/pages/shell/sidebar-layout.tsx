import { useLingui } from "@lingui/react/macro";
import { SidebarProvider } from "@rakazo/ui-web";
import type { ComponentProps, CSSProperties, ReactNode } from "react";
import { createContext, useContext } from "react";
import { BOTS_SIDEBAR_DEFAULT_WIDTH } from "../../lib/bots-sidebar-pref";
import { useSidebarResize } from "./use-sidebar-resize";

// The width the sidebar settles at, for layout outside it. It holds still during a drag.
const SidebarWidthContext = createContext(BOTS_SIDEBAR_DEFAULT_WIDTH);
// The width the sidebar draws at, following every drag step.
const SidebarDrawWidthContext = createContext(BOTS_SIDEBAR_DEFAULT_WIDTH);

export function useBotsSidebarWidth() {
  return useContext(SidebarWidthContext);
}

/**
 * Wraps the bots sidebar and gives it its width. The width is a CSS variable, and a variable on
 * the shell would restyle every element in the app on each change, so it lives on the sidebar
 * alone. Only this wrapper re-renders as the width changes; the sidebar it wraps does not.
 */
export function BotsSidebarWidthScope({ children }: { children: ReactNode }) {
  const width = useContext(SidebarDrawWidthContext);
  return (
    <div
      className="contents"
      style={
        { "--sidebar-width": `${width}px`, "--sidebar-width-icon": `${width}px` } as CSSProperties
      }
    >
      {children}
    </div>
  );
}

export function BotsSidebarLayout({
  userId,
  collapsed,
  onCollapsedChange,
  onPreviewCollapsedChange,
  computerOpen,
  children,
  ...props
}: ComponentProps<typeof SidebarProvider> & {
  userId: string | null | undefined;
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
  onPreviewCollapsedChange: (collapsed: boolean) => void;
  computerOpen: boolean;
}) {
  const { t } = useLingui();
  const { width, settledWidth, resizing, handleProps } = useSidebarResize({
    userId,
    collapsed,
    onCollapsedChange,
    onPreviewCollapsedChange,
  });
  return (
    <SidebarWidthContext value={settledWidth}>
      <SidebarDrawWidthContext value={width}>
        <SidebarProvider
          {...props}
          open={!collapsed}
          onOpenChange={(open) => onCollapsedChange(!open)}
          data-resizing-sidebar={resizing || undefined}
        >
          {children}
          {/* The full-screen computer covers the sidebar, so its edge must not catch clicks there. */}
          {computerOpen ? null : (
            <hr
              {...handleProps}
              data-testid="bots-sidebar-edge"
              aria-label={t`Resize bots sidebar`}
              style={{ insetInlineStart: width - 4 }}
              className={`absolute inset-y-0 z-50 m-0 hidden h-full w-2 border-0 cursor-col-resize touch-none select-none hover:bg-sidebar-border focus-visible:bg-sidebar-border focus-visible:outline-none md:block ${resizing ? "" : "transition-[inset-inline-start] duration-200 ease-out motion-reduce:transition-none"}`}
            />
          )}
        </SidebarProvider>
      </SidebarDrawWidthContext>
    </SidebarWidthContext>
  );
}
