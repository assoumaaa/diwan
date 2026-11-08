import { useLingui } from "@lingui/react/macro";
import { SidebarProvider } from "@rakazo/ui-web";
import type { ComponentProps, CSSProperties } from "react";
import { createContext, useContext, useEffect, useLayoutEffect, useRef } from "react";
import { BOTS_SIDEBAR_DEFAULT_WIDTH } from "../../lib/bots-sidebar-pref";
import { useSidebarResize } from "./use-sidebar-resize";

const SidebarWidthContext = createContext(BOTS_SIDEBAR_DEFAULT_WIDTH);

export function useBotsSidebarWidth() {
  return useContext(SidebarWidthContext);
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
  const { width, resizing, handleProps } = useSidebarResize({
    userId,
    collapsed,
    onCollapsedChange,
    onPreviewCollapsedChange,
  });
  const shellRef = useRef<HTMLDivElement>(null);
  // The width the whole shell carries. A CSS variable on the shell restyles every element in the
  // app, chat included, so a drag moves it once, on release, and never per step.
  const settledWidth = useRef(width);
  const shellWidth = resizing ? settledWidth.current : width;
  useEffect(() => {
    if (!resizing) {
      settledWidth.current = width;
    }
  }, [width, resizing]);
  // Only the sidebar reads its width, so live drag widths go on it alone.
  useLayoutEffect(() => {
    const sidebar = shellRef.current?.querySelector<HTMLElement>('[data-slot="sidebar"]');
    if (!sidebar) {
      return;
    }
    if (resizing) {
      sidebar.style.setProperty("--sidebar-width", `${width}px`);
      sidebar.style.setProperty("--sidebar-width-icon", `${width}px`);
      return;
    }
    sidebar.style.removeProperty("--sidebar-width");
    sidebar.style.removeProperty("--sidebar-width-icon");
  }, [width, resizing]);
  return (
    <SidebarWidthContext value={width}>
      <SidebarProvider
        {...props}
        ref={shellRef}
        open={!collapsed}
        onOpenChange={(open) => onCollapsedChange(!open)}
        style={
          {
            "--sidebar-width": `${shellWidth}px`,
            "--sidebar-width-icon": `${shellWidth}px`,
          } as CSSProperties
        }
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
    </SidebarWidthContext>
  );
}
