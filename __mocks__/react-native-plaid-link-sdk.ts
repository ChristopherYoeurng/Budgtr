/**
 * Jest mock of react-native-plaid-link-sdk (v13 session-based API).
 * Tests can override createPlaidLinkSession per-case.
 */
export const sdkVersion = 'mock-13';

export const createPlaidLinkSession = jest.fn(async (_config: unknown) => ({
  open: jest.fn(async () => undefined),
}));

export enum LinkEventName {
  OPEN = 'OPEN',
  EXIT = 'EXIT',
  HANDOFF = 'HANDOFF',
  LAYER_READY = 'LAYER_READY',
}

export type LinkSuccess = {
  publicToken: string;
  metadata: Record<string, unknown>;
};
export type LinkExit = { error?: unknown; metadata: Record<string, unknown> };
export type LinkEvent = { eventName: string; metadata: Record<string, unknown> };
