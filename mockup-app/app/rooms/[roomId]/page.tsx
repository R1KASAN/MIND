import { notFound } from "next/navigation";

import { RoomDetailOnboarding } from "../../_components/DemoShell";
import { getEvidenceForRoom } from "../../mock/evidence";
import { getMockRoom, mockRooms } from "../../mock/rooms";

export function generateStaticParams() {
  return mockRooms.map((room) => ({ roomId: room.id }));
}

export default async function RoomDetailPage({ params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await params;
  const room = getMockRoom(roomId);

  if (!room) {
    notFound();
  }

  return <RoomDetailOnboarding room={room} evidence={getEvidenceForRoom(room.id)} />;
}
