import type { Routine } from "@rakazo/contracts";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { SetURLSearchParams } from "react-router-dom";
import type { Panel, RightPanelState } from "../../lib/right-panel-state";
import {
  readRightPanelState,
  rightPanelStorageKey,
  writeRightPanelState,
} from "../../lib/right-panel-state";

/** The panel beside the chat. Each chat remembers its own; see `useRightPanelRestore`. */
export function useRightPanel({
  searchParams,
  setSearchParams,
}: {
  searchParams: URLSearchParams;
  setSearchParams: SetURLSearchParams;
}) {
  const [modelFocusRequest, setModelFocusRequest] = useState(0);
  const [panel, setPanelState] = useState<Panel>(null);
  const [restoredPanelKey, setRestoredPanelKey] = useState<string | null>(null);
  const panelStorageKeyRef = useRef<string | null>(null);
  const observedPanelKeyRef = useRef<string | null>(null);
  const explicitPanelTargetRef = useRef<string | null>(null);
  const pendingPanelRestoreRef = useRef<RightPanelState | null>(null);
  const pendingExplicitPanelRef = useRef(false);
  const panelSearch = useRef({ searchParams, setSearchParams });
  useLayoutEffect(() => {
    panelSearch.current = { searchParams, setSearchParams };
  }, [searchParams, setSearchParams]);
  const setPanel = useCallback((next: Panel | ((current: Panel) => Panel)) => {
    // A user navigation wins over a saved routine still waiting for its list.
    pendingPanelRestoreRef.current = null;
    pendingExplicitPanelRef.current = panelStorageKeyRef.current === null;
    setRestoredPanelKey(panelStorageKeyRef.current);
    setModelFocusRequest(0);
    setPanelState(next);
    const currentSearch = panelSearch.current;
    if (currentSearch.searchParams.has("routine")) {
      const params = new URLSearchParams(currentSearch.searchParams);
      params.delete("routine");
      currentSearch.setSearchParams(params, { replace: true });
    }
  }, []);

  /** Opens `next` in another chat, saved under that chat's `destKey` rather than this one's. */
  function openPanelInChat(destKey: string | null, next: Panel, navigateToChat: () => void) {
    explicitPanelTargetRef.current = destKey;
    pendingPanelRestoreRef.current = null;
    navigateToChat();
    // Mark the destination key restored so we do not write settings onto the source chat.
    setPanelState(next);
    setRestoredPanelKey(destKey);
  }

  return {
    panel,
    setPanel,
    setPanelState,
    openPanelInChat,
    modelFocusRequest,
    setModelFocusRequest,
    restoredPanelKey,
    setRestoredPanelKey,
    panelStorageKeyRef,
    observedPanelKeyRef,
    explicitPanelTargetRef,
    pendingPanelRestoreRef,
    pendingExplicitPanelRef,
  };
}

export type RightPanel = ReturnType<typeof useRightPanel>;

/** Restores the open chat's saved panel and saves changes to it. */
export function useRightPanelRestore({
  rightPanel,
  userId,
  spaceId,
  inGroup,
  panelTarget,
  activeId,
  routines,
  routinesBotId,
  searchParams,
  editingRoutineId,
  restoreRoutine,
  leaveRoutine,
}: {
  rightPanel: RightPanel;
  userId: string | undefined;
  spaceId: string | undefined;
  inGroup: boolean;
  panelTarget: string | undefined;
  activeId: string | undefined;
  routines: Routine[];
  routinesBotId: string | null;
  searchParams: URLSearchParams;
  editingRoutineId: string | undefined;
  restoreRoutine: (routine: Routine | null) => void;
  leaveRoutine: () => void;
}) {
  const {
    panel,
    setPanelState,
    restoredPanelKey,
    setRestoredPanelKey,
    panelStorageKeyRef,
    observedPanelKeyRef,
    explicitPanelTargetRef,
    pendingPanelRestoreRef,
    pendingExplicitPanelRef,
  } = rightPanel;
  const panelStorageKey =
    userId && spaceId && panelTarget
      ? rightPanelStorageKey(userId, spaceId, inGroup ? "group" : "bot", panelTarget)
      : null;
  useLayoutEffect(() => {
    panelStorageKeyRef.current = panelStorageKey;
  }, [panelStorageKey]);

  useEffect(() => {
    if (panel !== "routine") {
      leaveRoutine();
    }
  }, [panel]);

  useEffect(() => {
    if (!panelStorageKey) return;
    if (observedPanelKeyRef.current !== panelStorageKey) {
      observedPanelKeyRef.current = panelStorageKey;
      if (pendingExplicitPanelRef.current || explicitPanelTargetRef.current === panelStorageKey) {
        pendingExplicitPanelRef.current = false;
        explicitPanelTargetRef.current = null;
        pendingPanelRestoreRef.current = null;
        setRestoredPanelKey(panelStorageKey);
        return;
      }
      explicitPanelTargetRef.current = null;
      // Each chat opens with its own saved panel, closed unless the user left it open there.
      pendingPanelRestoreRef.current = readRightPanelState(panelStorageKey);
    }
    const saved = pendingPanelRestoreRef.current;
    if (!saved) return;
    // Explicit routine links take precedence over a local layout preference.
    if (searchParams.has("routine")) {
      pendingPanelRestoreRef.current = null;
      return;
    }
    if (saved.panel === "routine" && saved.routineId && routinesBotId !== activeId) return;
    let next = saved.panel;
    if (next === "routine") {
      const routine = saved.routineId
        ? routines.find((item) => item.id === saved.routineId)
        : undefined;
      if (saved.routineId && !routine) next = "routines";
      restoreRoutine(routine ?? null);
    }
    pendingPanelRestoreRef.current = null;
    setPanelState(next);
    setRestoredPanelKey(panelStorageKey);
  }, [panelStorageKey, activeId, routinesBotId, routines, searchParams]);

  useEffect(() => {
    // Do not gate writes on ?routine= staying in the URL — a stuck/failed routine
    // list would freeze layout prefs. Deep-link handling uses setPanelState for the
    // bot-switch close so restoredPanelKey stays unset until an intentional setPanel.
    if (
      !panelStorageKey ||
      restoredPanelKey !== panelStorageKey ||
      pendingPanelRestoreRef.current
    ) {
      return;
    }
    writeRightPanelState(panelStorageKey, panel, editingRoutineId);
  }, [panelStorageKey, restoredPanelKey, panel, editingRoutineId]);
}
