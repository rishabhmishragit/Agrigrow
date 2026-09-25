import AsyncStorage from "@react-native-async-storage/async-storage";
import { hydrateDatabase } from "../domain/db";
import type { AppDatabase } from "../domain/types";

const KEY = "cryochain.db.v1";

export async function loadState(): Promise<AppDatabase | null> {
  const json = await AsyncStorage.getItem(KEY);
  if (!json) return null;
  const parsed = JSON.parse(json) as AppDatabase;
  if (parsed.version !== 1) return null;
  return hydrateDatabase(parsed);
}

export async function saveState(state: AppDatabase): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(state));
}

export async function clearState(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
}
