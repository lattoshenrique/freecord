/**
 * A tool's own view on the room's stage, wired to the contract.
 *
 * Everything a tool is allowed to know arrives through these props and
 * nothing else — which is what keeps "a tool" a thing somebody outside
 * this repository can write (web/src/tools/contract.ts, docs/tools.md).
 * The state is passed through the tool's own `parseState` first: what
 * came off the wire is another peer's word, and only the tool knows what
 * its own state should look like.
 */
import type { PeerInfo } from '../lib/protocol';
import type { ToolRoomState } from '../lib/use-room';
import { useToolText, type RegisteredTool } from '../tools/contract';

export default function ToolStage({
  tool,
  room,
  self,
  peers,
  speakerOn,
  onSetState,
}: {
  tool: RegisteredTool;
  room: ToolRoomState;
  self: PeerInfo | null;
  peers: readonly PeerInfo[];
  speakerOn: boolean;
  onSetState: (state: unknown) => void;
}) {
  const t = useToolText(tool);
  const Stage = tool.Stage;
  if (!Stage) {
    return null;
  }
  return (
    <Stage
      state={tool.parseState(room.state)}
      at={room.at}
      mine={room.mine}
      by={room.by}
      setState={onSetState}
      self={self}
      peers={peers}
      speakerOn={speakerOn}
      t={t}
    />
  );
}
