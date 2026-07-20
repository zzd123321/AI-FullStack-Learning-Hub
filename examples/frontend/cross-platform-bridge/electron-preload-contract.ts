import type { BridgeRequest } from './bridge-protocol.js';

export interface ContextBridgeLike { exposeInMainWorld(name: string, api: unknown): void }
export interface IpcRendererLike { invoke(channel: string, payload: unknown): Promise<unknown> }

export function exposeDesktopApi(contextBridge: ContextBridgeLike, ipcRenderer: IpcRendererLike): void {
  // The page receives semantic functions, not invoke(channel, payload). Every
  // newly exposed function is therefore an intentional security decision.
  contextBridge.exposeInMainWorld('desktopApi', Object.freeze({
    getCapabilities: () => ipcRenderer.invoke('bridge:request', {
      version: 1, id: crypto.randomUUID(), method: 'app.getCapabilities', params: {},
    } satisfies BridgeRequest),
    openExternal: (url: string) => ipcRenderer.invoke('bridge:request', {
      // Main still performs runtime parsing and origin/host authorization.
      version: 1, id: crypto.randomUUID(), method: 'shell.openExternal', params: { url },
    } satisfies BridgeRequest),
  }));
}
