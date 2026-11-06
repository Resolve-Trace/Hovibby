"use client";

import { useState, useEffect, useCallback } from "react";
import type { WalletState } from "../types/index.js";

// Type the Freighter extension API
interface FreighterAPI {
  isConnected(): Promise<boolean>;
  getPublicKey(): Promise<string>;
  getNetwork(): Promise<string>;
  signTransaction(xdr: string, opts?: { networkPassphrase?: string }): Promise<string>;
}

function getFreighter(): FreighterAPI | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as Record<string, unknown>;
  return (w["freighter"] as FreighterAPI | undefined) ?? null;
}

/**
 * React hook for Freighter wallet integration.
 *
 * SECURITY: Private keys never leave the Freighter extension.
 * This hook only requests the public key and transaction signing.
 * Never pass private keys to this hook.
 */
export function useWallet() {
  const [wallet, setWallet] = useState<WalletState>({ connected: false });
  const [loading, setLoading] = useState(false);

  // Check existing connection on mount
  useEffect(() => {
    const freighter = getFreighter();
    if (!freighter) return;
    freighter.isConnected().then((connected) => {
      if (connected) {
        Promise.all([freighter.getPublicKey(), freighter.getNetwork()])
          .then(([publicKey, network]) => {
            setWallet({ connected: true, publicKey, network });
          })
          .catch(() => {/* not connected */});
      }
    }).catch(() => {/* extension not responding */});
  }, []);

  const connect = useCallback(async () => {
    setLoading(true);
    const freighter = getFreighter();

    if (!freighter) {
      setWallet({
        connected: false,
        error: "Freighter is not installed. Visit freighter.app to install it.",
      });
      setLoading(false);
      return;
    }

    try {
      const [publicKey, network] = await Promise.all([
        freighter.getPublicKey(),
        freighter.getNetwork(),
      ]);

      if (!network.toLowerCase().includes("testnet")) {
        setWallet({
          connected: false,
          error: `Connected to ${network}. ResolveTrace requires Stellar Testnet — switch networks in Freighter.`,
        });
        setLoading(false);
        return;
      }

      setWallet({ connected: true, publicKey, network });
    } catch (e) {
      setWallet({ connected: false, error: `Connection failed: ${String(e)}` });
    }
    setLoading(false);
  }, []);

  const disconnect = useCallback(() => {
    setWallet({ connected: false });
  }, []);

  /**
   * Sign a transaction XDR string via Freighter.
   * Returns the signed XDR.
   * Throws if the user rejects or Freighter is unavailable.
   */
  const signTransaction = useCallback(async (xdr: string): Promise<string> => {
    const freighter = getFreighter();
    if (!freighter) throw new Error("Freighter is not available");
    return freighter.signTransaction(xdr, {
      networkPassphrase: "Test SDF Network ; September 2015",
    });
  }, []);

  return { wallet, loading, connect, disconnect, signTransaction };
}
