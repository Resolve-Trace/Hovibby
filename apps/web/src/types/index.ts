/**
 * Application-level types for the ResolveTrace web app.
 * Protocol types are imported directly from @resolvetrace/protocol.
 */

/** Wallet connection state */
export interface WalletState {
  connected: boolean;
  publicKey?: string;
  network?: string;
  error?: string;
}

/** Transaction progress state — mirrors the protocol TransactionStatus */
export type TxStatus =
  | "idle"
  | "building"
  | "awaiting_wallet"
  | "signed"
  | "submitted"
  | "confirmed"
  | "failed"
  | "timeout";

/** API response envelope */
export interface ApiResponse<T> {
  data?: T;
  error?: string;
  details?: string | string[];
}
