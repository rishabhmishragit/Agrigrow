import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Network from "expo-network";
import * as SecureStore from "expo-secure-store";
import { createContext, ReactNode, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Platform } from "react-native";
import { config } from "../config";
import { clearState, loadState, saveState } from "../database/localDb";
import { createSeed } from "../domain/seed";
import { normalizePhone } from "../domain/phone";
import type { CommandResult, Ports } from "../domain/support";
import type { AppDatabase, User } from "../domain/types";
import { createProviders, MockEscrowProvider } from "../providers";

const SESSION_KEY = "cryochain_session";

async function readSession(): Promise<string | null> {
  if (Platform.OS === "web") return AsyncStorage.getItem(SESSION_KEY);
  if (await SecureStore.isAvailableAsync()) return SecureStore.getItemAsync(SESSION_KEY);
  return AsyncStorage.getItem(SESSION_KEY);
}

async function writeSession(userId: string | null): Promise<void> {
  if (userId === null) {
    if (Platform.OS === "web") await AsyncStorage.removeItem(SESSION_KEY);
    else if (await SecureStore.isAvailableAsync()) await SecureStore.deleteItemAsync(SESSION_KEY);
    else await AsyncStorage.removeItem(SESSION_KEY);
    return;
  }
  if (Platform.OS === "web") await AsyncStorage.setItem(SESSION_KEY, userId);
  else if (await SecureStore.isAvailableAsync()) await SecureStore.setItemAsync(SESSION_KEY, userId);
  else await AsyncStorage.setItem(SESSION_KEY, userId);
}

function createPorts(): Ports & { escrow: MockEscrowProvider | Ports["escrow"] } {
  const providers = createProviders({
    paymentProvider: config.paymentProvider,
    paymentApiKey: config.paymentApiKey,
    escrowProvider: config.escrowProvider,
    escrowApiUrl: config.escrowApiUrl,
    escrowBankLabel: config.escrowBankLabel,
    smsProvider: config.smsProvider,
    smsApiKey: config.smsApiKey,
    trackingProvider: "phone",
  });
  return {
    now: () => new Date().toISOString(),
    id: (prefix) => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    ...providers,
    escrowBankLabel: config.escrowBankLabel,
  };
}

interface CryoContextValue {
  ready: boolean;
  db: AppDatabase;
  user: User | null;
  offline: boolean;
  forceOffline: boolean;
  setForceOffline: (value: boolean) => void;
  busy: boolean;
  error: string | null;
  notice: string | null;
  clearMessages: () => void;
  signIn: (email: string, password: string) => Promise<void>;
  requestOtp: (phone: string) => Promise<void>;
  signInPhone: (phone: string, code: string) => Promise<void>;
  signOut: () => Promise<void>;
  resetDemo: () => Promise<void>;
  simulateFunding: (externalReference: string) => void;
  run: <T>(work: (db: AppDatabase, ports: Ports, user: User) => Promise<CommandResult<T>> | CommandResult<T>) => Promise<T | undefined>;
}

const CryoContext = createContext<CryoContextValue | null>(null);

export function CryoProvider({ children }: { children: ReactNode }) {
  const ports = useRef(createPorts()).current;
  const [db, setDb] = useState<AppDatabase>(createSeed());
  const dbRef = useRef(db);
  const [user, setUser] = useState<User | null>(null);
  const userRef = useRef<User | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [forceOffline, setForceOffline] = useState(false);
  const [connected, setConnected] = useState(true);
  const hydrated = useRef(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const stored = await loadState();
        const initial = stored ?? createSeed();
        if (!active) return;
        setDb(initial);
        const sessionId = await readSession();
        const sessionUser = initial.users.find((item) => item.id === sessionId && item.active) ?? null;
        setUser(sessionUser);
      } catch {
        setError("Saved data could not be read. Demo data has been loaded.");
        setDb(createSeed());
      } finally {
        hydrated.current = true;
        if (active) setReady(true);
      }
    })();
    const subscription = Network.addNetworkStateListener((state) => {
      setConnected(state.isConnected !== false && state.isInternetReachable !== false);
    });
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (!hydrated.current) return;
    void saveState(db).catch(() => {
      setError("Changes are still on this screen, but local save failed. Stay in the app and retry.");
    });
  }, [db]);

  const offline = forceOffline || !connected;
  dbRef.current = db;
  userRef.current = user;

  const value = useMemo<CryoContextValue>(() => {
    const commitDb = (next: AppDatabase) => {
      dbRef.current = next;
      setDb(next);
    };
    const apply = async <T,>(result: CommandResult<T>, nextUser?: User) => {
      commitDb(result.db);
      if (nextUser) {
        const refreshed = result.db.users.find((item) => item.id === nextUser.id) ?? nextUser;
        userRef.current = refreshed;
        setUser(refreshed);
        await writeSession(refreshed.id);
      }
      setNotice(result.message ?? null);
      setError(null);
      return result.data;
    };

    return {
      ready,
      db,
      user,
      offline,
      forceOffline,
      setForceOffline,
      busy,
      error,
      notice,
      clearMessages: () => {
        setError(null);
        setNotice(null);
      },
      signIn: async (email, password) => {
        const { authenticateDemo } = await import("../domain/trade");
        try {
          const result = await Promise.resolve(
            authenticateDemo(dbRef.current, ports, email, password, config.demoPassword, config.demoAuth),
          );
          await apply(result, result.data);
        } catch (caught) {
          setError(caught instanceof Error ? caught.message : "Sign-in failed.");
        }
      },
      requestOtp: async (phone) => {
        const { requestPhoneOtp } = await import("../domain/trade");
        try {
          const result = await requestPhoneOtp(
            dbRef.current,
            ports,
            normalizePhone(phone),
            config.demoAuth ? config.demoOtp : String(Math.floor(100000 + Math.random() * 900000)),
          );
          await apply(result);
          setNotice(config.demoAuth ? "Development code 123456 was sent to the SMS log." : "A code was sent by SMS.");
        } catch (caught) {
          setError(caught instanceof Error ? caught.message : "The code could not be sent.");
        }
      },
      signInPhone: async (phone, code) => {
        const { verifyPhoneOtp } = await import("../domain/trade");
        try {
          const result = verifyPhoneOtp(dbRef.current, ports, normalizePhone(phone), code.trim());
          await apply(result, result.data);
        } catch (caught) {
          setError(caught instanceof Error ? caught.message : "That code was not accepted.");
        }
      },
      signOut: async () => {
        userRef.current = null;
        setUser(null);
        await writeSession(null);
      },
      resetDemo: async () => {
        const next = createSeed();
        dbRef.current = next;
        userRef.current = null;
        await clearState();
        setDb(next);
        setUser(null);
        await writeSession(null);
        setNotice("Demo data has been reset.");
      },
      simulateFunding: (externalReference) => {
        if (ports.escrow instanceof MockEscrowProvider) {
          ports.escrow.simulateBankFunding(externalReference);
          setNotice("Development mock: the external bank confirmation was simulated. Check funding to record it.");
        } else {
          setError("Funding can only be simulated while the mock escrow provider is selected.");
        }
      },
      run: async (work) => {
        const currentUser = userRef.current;
        if (!currentUser) {
          setError("Sign in again.");
          return undefined;
        }
        setBusy(true);
        try {
          const result = await work(dbRef.current, ports, currentUser);
          return await apply(result, currentUser);
        } catch (caught) {
          setError(caught instanceof Error ? caught.message : "The action could not be completed.");
          return undefined;
        } finally {
          setBusy(false);
        }
      },
    };
  }, [busy, db, error, forceOffline, notice, offline, ports, ready, user]);
  // db and user are read through refs inside actions so sequential commands see the latest write.

  return <CryoContext.Provider value={value}>{children}</CryoContext.Provider>;
}

export function useCryo(): CryoContextValue {
  const value = useContext(CryoContext);
  if (!value) throw new Error("useCryo must be used inside CryoProvider.");
  return value;
}
