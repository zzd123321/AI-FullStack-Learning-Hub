import { dispatchBridgeMessage, type NativeCapabilities } from './native-dispatcher.js';

export interface FrameLike {
  readonly origin: string;
  readonly parent: FrameLike | null;
}

export interface InvokeEventLike {
  readonly sender: { readonly id: number };
  readonly senderFrame: FrameLike | null;
}

export interface IpcMainLike {
  handle(
    channel: string,
    listener: (event: InvokeEventLike, payload: unknown) => Promise<unknown>,
  ): void;
  removeHandler(channel: string): void;
}

export function installElectronBridgeHandler(
  ipcMain: IpcMainLike,
  capabilities: NativeCapabilities,
  expected: {
    readonly webContentsId: number;
    readonly origin: string;
    readonly allowedExternalOrigins: ReadonlySet<string>;
  },
): () => void {
  const channel = 'bridge:request';

  ipcMain.handle(channel, async (event, payload) => {
    const frame = event.senderFrame;
    const authorizedSender = event.sender.id === expected.webContentsId
      && frame !== null
      && frame.parent === null // Only the top-level frame owns native capabilities.
      && expected.origin !== 'null' // Opaque origins are not an identity boundary.
      && frame.origin === expected.origin;

    return dispatchBridgeMessage(payload, capabilities, {
      authorizedSender,
      // Keep external destinations as product configuration rather than
      // accepting an arbitrary renderer-provided host.
      allowedExternalOrigins: expected.allowedExternalOrigins,
    });
  });

  // The window owner must call this when it is destroyed. Global handlers that
  // outlive their intended window are stale authority and complicate testing.
  return () => ipcMain.removeHandler(channel);
}
