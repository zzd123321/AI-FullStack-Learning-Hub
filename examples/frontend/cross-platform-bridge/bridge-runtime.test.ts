import { BridgeClient, BridgeClientError, type BridgeTransport } from './bridge-client.js';
import {
  installElectronBridgeHandler,
  type IpcMainLike,
} from './electron-main-handler.js';
import { dispatchBridgeMessage, NativeCapabilityError } from './native-dispatcher.js';
import { parseBridgeResponse, type BridgeRequest } from './bridge-protocol.js';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

let receive: (value: unknown) => void = () => {};
const sent: BridgeRequest[] = [];
const transport: BridgeTransport = {
  send(request) { sent.push(request); },
  subscribe(listener) {
    receive = listener;
    return () => { receive = () => {}; };
  },
};

const client = new BridgeClient(transport);
const pending = client.request({
  version: 1,
  id: 'request-1',
  method: 'app.getCapabilities',
  params: {},
});
assert(sent.length === 1, 'client should send a valid request');

// An unrecognized error code is untrusted native input and must not settle
// the application promise. A later valid response with the same ID can settle it.
receive({
  version: 1,
  id: 'request-1',
  ok: false,
  error: { code: 'NATIVE_STACK_TRACE', message: '/Users/private/file' },
});
receive({ version: 1, id: 'request-1', ok: true, result: { protocolVersion: 1 } });
const result = await pending as { protocolVersion: number };
assert(result.protocolVersion === 1, 'client should accept a valid correlated response');

const controller = new AbortController();
const aborted = client.request({
  version: 1,
  id: 'request-2',
  method: 'app.getCapabilities',
  params: {},
}, { signal: controller.signal });
controller.abort();
await aborted.then(
  () => { throw new Error('aborted request should reject'); },
  (error: unknown) => assert(
    error instanceof BridgeClientError && error.code === 'ABORTED',
    'abort should use a stable client error code',
  ),
);

const opened: string[] = [];
const capabilities = {
  async openExternal(url: URL) { opened.push(url.href); },
  async selectFile() { return []; },
};
const policy = {
  authorizedSender: true,
  allowedExternalOrigins: new Set(['https://docs.example.com']),
};

const allowed = await dispatchBridgeMessage({
  version: 1,
  id: 'native-1',
  method: 'shell.openExternal',
  params: { url: 'https://docs.example.com/guide' },
}, capabilities, policy);
assert(allowed.ok && opened.length === 1, 'allowlisted HTTPS URL should open');

const blocked = await dispatchBridgeMessage({
  version: 1,
  id: 'native-2',
  method: 'shell.openExternal',
  params: { url: 'https://evil.example/phishing' },
}, capabilities, policy);
assert(!blocked.ok && blocked.error.code === 'INVALID_ARGUMENT', 'unknown host should be rejected');

const wrongPort = await dispatchBridgeMessage({
  version: 1,
  id: 'native-2b',
  method: 'shell.openExternal',
  params: { url: 'https://docs.example.com:8443/guide' },
}, capabilities, policy);
assert(!wrongPort.ok && wrongPort.error.code === 'INVALID_ARGUMENT', 'origin allowlist includes port');

const unauthorized = await dispatchBridgeMessage({
  version: 1,
  id: 'native-3',
  method: 'app.getCapabilities',
  params: {},
}, capabilities, { ...policy, authorizedSender: false });
assert(!unauthorized.ok && unauthorized.error.code === 'UNAUTHORIZED', 'sender policy is mandatory');

const cancelled = await dispatchBridgeMessage({
  version: 1,
  id: 'native-4',
  method: 'dialog.selectFile',
  params: { accept: ['.pdf'] },
}, {
  ...capabilities,
  async selectFile() { throw new NativeCapabilityError('USER_CANCELLED'); },
}, policy);
assert(!cancelled.ok && cancelled.error.code === 'USER_CANCELLED', 'user cancellation is not a native failure');

let handlerInstalled = false;
let mainHandler: Parameters<IpcMainLike['handle']>[1] = async () => {
  throw new Error('main handler was not installed');
};
let removed = false;
const disposeMainHandler = installElectronBridgeHandler({
  handle(_channel, listener) {
    handlerInstalled = true;
    mainHandler = listener;
  },
  removeHandler() { removed = true; },
}, capabilities, {
  webContentsId: 7,
  origin: 'app://bundle',
  allowedExternalOrigins: new Set(['https://docs.example.com']),
});
assert(handlerInstalled, 'main handler should be installed');
const topFrame = { origin: 'app://bundle', parent: null };
const mainResponse = parseBridgeResponse(await mainHandler(
  { sender: { id: 7 }, senderFrame: topFrame },
  { version: 1, id: 'main-1', method: 'app.getCapabilities', params: {} },
));
assert(mainResponse?.ok, 'expected top frame should be authorized');
const childResponse = parseBridgeResponse(await mainHandler(
  { sender: { id: 7 }, senderFrame: { origin: 'app://bundle', parent: topFrame } },
  { version: 1, id: 'main-2', method: 'app.getCapabilities', params: {} },
));
assert(childResponse && !childResponse.ok && childResponse.error.code === 'UNAUTHORIZED', 'child frame should be rejected');
disposeMainHandler();
assert(removed, 'window owner should remove the main handler');

client.dispose();
console.log('cross-platform bridge runtime examples passed');
