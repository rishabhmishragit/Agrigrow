import * as SQLite from "expo-sqlite";
import { hydrateDatabase } from "../domain/db";
import type { AppDatabase } from "../domain/types";

let databasePromise: ReturnType<typeof SQLite.openDatabaseAsync> | undefined;

function database() {
  databasePromise ??= SQLite.openDatabaseAsync("cryochain.db");
  return databasePromise;
}

export async function loadState(): Promise<AppDatabase | null> {
  const db = await database();
  await db.execAsync(
    "CREATE TABLE IF NOT EXISTS app_state (id INTEGER PRIMARY KEY NOT NULL, json TEXT NOT NULL);",
  );
  const row = await db.getFirstAsync<{ json: string }>("SELECT json FROM app_state WHERE id = 1");
  if (!row?.json) return null;
  const parsed = JSON.parse(row.json) as AppDatabase;
  if (parsed.version !== 1) return null;
  return hydrateDatabase(parsed);
}

export async function saveState(state: AppDatabase): Promise<void> {
  const db = await database();
  await db.execAsync(
    "CREATE TABLE IF NOT EXISTS app_state (id INTEGER PRIMARY KEY NOT NULL, json TEXT NOT NULL);",
  );
  await db.runAsync(
    "INSERT INTO app_state (id, json) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET json = excluded.json",
    JSON.stringify(state),
  );
}

export async function clearState(): Promise<void> {
  const db = await database();
  await db.runAsync("DELETE FROM app_state WHERE id = 1");
}
