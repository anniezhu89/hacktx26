import { useCallback, useEffect, useState } from "react";
import type { Account } from "@labelbridge/contracts";
import { toApiError, type ApiError } from "../api/client";
import type { WorkspaceClient } from "../api/workspace";

export type AccountState = {
  account: Account | null;
  loading: boolean;
  pending: boolean;
  error: ApiError | null;
};

/** The signed-in demo account (null for guests), loaded from the server. */
export function useAccount(client: WorkspaceClient) {
  const [state, setState] = useState<AccountState>({
    account: null,
    loading: true,
    pending: false,
    error: null,
  });

  useEffect(() => {
    const controller = new AbortController();
    client
      .me(controller.signal)
      .then((r) =>
        setState((s) => ({ ...s, account: r.data.account, loading: false })),
      )
      .catch((e) => {
        if ((e as Error)?.name === "AbortError") return;
        setState((s) => ({ ...s, loading: false }));
      });
    return () => controller.abort();
  }, [client]);

  /** Runs one account change; returns true on success. */
  const run = useCallback(
    async (
      work: () => Promise<{ data: { account: Account | null } } | unknown>,
      next?: (r: unknown) => Account | null | undefined,
    ) => {
      setState((s) => ({ ...s, pending: true, error: null }));
      try {
        const r = await work();
        const account = next
          ? next(r)
          : (r as { data: { account: Account | null } }).data.account;
        setState((s) => ({
          ...s,
          pending: false,
          account: account === undefined ? s.account : account,
        }));
        return true;
      } catch (e) {
        setState((s) => ({ ...s, pending: false, error: toApiError(e) }));
        return false;
      }
    },
    [],
  );

  return {
    ...state,
    signin: (email: string, password: string) =>
      run(() => client.signin({ email, password })),
    signup: (body: Parameters<WorkspaceClient["signup"]>[0]) =>
      run(() => client.signup(body)),
    signout: () => run(() => client.signout()),
    recover: (email: string) =>
      run(
        () => client.recover(email),
        () => undefined,
      ),
    update: (body: Parameters<WorkspaceClient["updatePreferences"]>[0]) =>
      run(() => client.updatePreferences(body)),
    remove: (password: string) =>
      run(
        () => client.deleteAccount(password),
        () => null,
      ),
    refresh: () => run(() => client.me()),
    clearError: () => setState((s) => ({ ...s, error: null })),
  };
}

export type AccountSession = ReturnType<typeof useAccount>;
