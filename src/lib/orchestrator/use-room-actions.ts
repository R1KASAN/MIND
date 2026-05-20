import { useEffect } from 'react';
import { reportClientAsyncError } from '@/lib/orchestrator/async-error';

import type { AiSynthesisResponse } from '@/lib/ai/schema';
import { hasResumableTask } from '@/lib/orchestrator/task-machine';
import {
  activateRoom,
  createRoom,
  normalizeSession,
  renameRoom,
  restoreRoom,
  trashRoom,
  type Action,
  type AppSession,
  type RoomRecord,
  type RoomScenarioType,
  type UIRoute,
} from '@/lib/store/idb';

interface TaskController {
  resumeFromSuggestedReentry: () => Promise<void>;
  resumeTaskFromRoute: (route: UIRoute) => Promise<void>;
  deriveResumeRoute: () => UIRoute;
  handleMakeSmaller: () => Promise<void>;
  handleAcceptAction: () => Promise<void>;
}

export function getAdjacentRoom(rooms: RoomRecord[], activeRoomId: string | null, direction: 'next' | 'previous') {
  const visibleRooms = rooms.filter((room) => typeof room.trashedAt !== 'number');
  if (visibleRooms.length === 0) return null;
  const currentIndex = visibleRooms.findIndex((room) => room.id === activeRoomId);
  const safeIndex = currentIndex >= 0 ? currentIndex : 0;
  const delta = direction === 'next' ? 1 : -1;
  const nextIndex = (safeIndex + delta + visibleRooms.length) % visibleRooms.length;
  return visibleRooms[nextIndex] ?? null;
}

export function canContinueFromRoomCard(
  session: AppSession,
  currentPayload: AiSynthesisResponse | null,
  currentActionState: Action | null,
) {
  return Boolean(
    session.task &&
      (
        session.task.reentryBrief?.topActions[0] ||
        (
          hasResumableTask(session.task) &&
          (session.task.reentryBrief || session.task.lastSynthesis || currentPayload || currentActionState)
        )
      ),
  );
}

export function canMakeSmallerFromRoomCard(
  session: AppSession,
  currentPayload: AiSynthesisResponse | null,
  currentActionState: Action | null,
) {
  return Boolean(
    session.task &&
      hasResumableTask(session.task) &&
      (session.task.lastSynthesis || currentPayload || currentActionState || session.task.currentPlan),
  );
}

interface UseRoomActionsOptions {
  rooms: RoomRecord[];
  activeRoomId: string | null;
  session: AppSession | null;
  currentPayload: AiSynthesisResponse | null;
  currentActionState: Action | null;
  demoScenarioId: RoomScenarioType;
  controller: TaskController;
  hydrateSessionState: (nextSession: AppSession) => Promise<void>;
  refreshRooms: () => Promise<unknown>;
  resetRoomInteractionState: () => void;
  readOnly?: boolean;
  onReadOnlyBlocked?: () => void;
}

export function useRoomActions({
  rooms,
  activeRoomId,
  session,
  currentPayload,
  currentActionState,
  demoScenarioId,
  controller,
  hydrateSessionState,
  refreshRooms,
  resetRoomInteractionState,
  readOnly = false,
  onReadOnlyBlocked,
}: UseRoomActionsOptions) {
  useEffect(() => {
    const handleRoomSwitchHotkeys = (event: KeyboardEvent) => {
      if (!(event.altKey || (event.metaKey && event.shiftKey))) return;
      if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
      if (readOnly) {
        event.preventDefault();
        onReadOnlyBlocked?.();
        return;
      }

      const nextRoom = getAdjacentRoom(
        rooms,
        activeRoomId,
        event.key === 'ArrowDown' ? 'next' : 'previous',
      );
      if (!nextRoom) return;

      event.preventDefault();
      void (async () => {
        const nextSession = await activateRoom(nextRoom.id);
        resetRoomInteractionState();
        await hydrateSessionState(normalizeSession(nextSession));
        await refreshRooms();
      })().catch((error) => reportClientAsyncError("[MIND] Hotkey room switch", error));
    };

    window.addEventListener('keydown', handleRoomSwitchHotkeys);
    return () => window.removeEventListener('keydown', handleRoomSwitchHotkeys);
  }, [activeRoomId, hydrateSessionState, onReadOnlyBlocked, readOnly, refreshRooms, resetRoomInteractionState, rooms]);

  const activeRoom = rooms.find((room) => room.id === activeRoomId) ?? null;
  const visibleRoom = activeRoom && typeof activeRoom.trashedAt !== 'number' ? activeRoom : null;

  const handleCreateRoom = async () => {
    if (readOnly) {
      onReadOnlyBlocked?.();
      return;
    }
    const created = await createRoom({
      title: `ห้องงานใหม่ ${rooms.length + 1}`,
      scenarioType: demoScenarioId,
      makeActive: true,
    });
    const nextSession = await activateRoom(created.id);
    resetRoomInteractionState();
    await hydrateSessionState(nextSession);
    await refreshRooms();
  };

  const handleSelectRoom = async (roomId: string) => {
    if (roomId === activeRoomId) return;
    if (readOnly) {
      onReadOnlyBlocked?.();
      return;
    }
    const selectedRoom = rooms.find((room) => room.id === roomId);
    if (!selectedRoom || typeof selectedRoom.trashedAt === 'number') return;
    const nextSession = await activateRoom(roomId);
    resetRoomInteractionState();
    await hydrateSessionState(normalizeSession(nextSession));
    await refreshRooms();
  };

  const handleRenameRoom = async (roomId: string, nextTitle: string) => {
    if (readOnly) {
      onReadOnlyBlocked?.();
      return;
    }
    const result = await renameRoom(roomId, nextTitle);
    resetRoomInteractionState();
    if (result.session) {
      await hydrateSessionState(normalizeSession(result.session));
    }
    await refreshRooms();
  };

  const handleTrashRoom = async (roomId: string) => {
    if (readOnly) {
      onReadOnlyBlocked?.();
      return;
    }
    const result = await trashRoom(roomId);
    resetRoomInteractionState();
    if (result.session) {
      await hydrateSessionState(normalizeSession(result.session));
    }
    await refreshRooms();
  };

  const handleRestoreRoom = async (roomId: string) => {
    if (readOnly) {
      onReadOnlyBlocked?.();
      return;
    }
    await restoreRoom(roomId);
    await refreshRooms();
  };

  const handleContinueFromRoomCard = async () => {
    if (readOnly) {
      onReadOnlyBlocked?.();
      return;
    }
    if (!session) return;
    if (!session.task) return;

    if (session.task.reentryBrief?.topActions[0]) {
      await controller.resumeFromSuggestedReentry();
      return;
    }

    if (!hasResumableTask(session.task)) return;

    if (
      (session.uiRoute === 'BOUNCE_BACK' || session.uiRoute === 'MORNING_RITUAL') &&
      session.task.reentryBrief
    ) {
      await controller.resumeFromSuggestedReentry();
      return;
    }

    await controller.resumeTaskFromRoute(controller.deriveResumeRoute());
  };

  const handleMakeSmallerFromRoomCard = async () => {
    if (readOnly) {
      onReadOnlyBlocked?.();
      return;
    }
    if (!session) return;
    if (!session.task || !hasResumableTask(session.task)) return;

    if (session.uiRoute === 'SCAFFOLD' && currentPayload) {
      await controller.handleMakeSmaller();
      return;
    }

    if (session.uiRoute === 'ONE_ACTION' && currentPayload) {
      await controller.handleAcceptAction();
      await controller.handleMakeSmaller();
      return;
    }

    await controller.resumeTaskFromRoute('SCAFFOLD');
  };

  return {
    activeRoom: visibleRoom,
    roomCardCanContinue: session ? canContinueFromRoomCard(session, currentPayload, currentActionState) : false,
    roomCardCanMakeSmaller: session ? canMakeSmallerFromRoomCard(session, currentPayload, currentActionState) : false,
    handleCreateRoom,
    handleSelectRoom,
    handleRenameRoom,
    handleTrashRoom,
    handleRestoreRoom,
    handleContinueFromRoomCard,
    handleMakeSmallerFromRoomCard,
  };
}
