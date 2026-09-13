"use client";

import { payrollStorage } from "@/features/payroll/lib/workspace-store";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ProductGame, ProductGameRegion } from "@/features/payroll/types/domain";

const STORAGE_KEY = "cp-ofs-demo-product-games-v1";
const CHANGE_EVENT = "cp-ofs-demo-product-games-changed";

const seedGames: ProductGame[] = [
  { id: "game-gw2", code: "GW2", name: "Guild Wars 2", aliases: ["Guild Wars"], regions: [{ name: "NA", servers: ["NA"] }, { name: "EU", servers: ["EU"] }], active: true },
  { id: "game-wuwa", code: "WUWA", name: "Wuthering Waves", aliases: ["Wuwa"], regions: [{ name: "SEA", servers: ["SEA"] }, { name: "Asia", servers: ["Asia"] }, { name: "America", servers: ["America"] }, { name: "Europe", servers: ["Europe"] }], active: true },
  { id: "game-ror", code: "RoR", name: "RoR", regions: [{ name: "Global", servers: ["Global"] }], active: true },
  { id: "game-bdo", code: "BDO", name: "Black Desert Online", aliases: ["Black Desert"], regions: [{ name: "SEA", servers: ["SEA"] }, { name: "NA/EU", servers: ["NA", "EU"] }], active: true },
  { id: "game-wow", code: "WOW", name: "World of Warcraft", aliases: ["WoW"], regions: [{ name: "US", servers: ["US"] }, { name: "EU", servers: ["EU"] }, { name: "OC", servers: ["OC"] }], active: true },
  { id: "game-gorgon", code: "GORGON", name: "Gorgon", regions: [{ name: "Global", servers: ["Global"] }], active: true },
  { id: "game-mnm", code: "MNM", name: "MNM", regions: [{ name: "Global", servers: ["Global"] }], active: true },
  { id: "game-qf", code: "QF", name: "QF", regions: [{ name: "Global", servers: ["Global"] }], active: true },
];

function readRows(): ProductGame[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = payrollStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ProductGame[];
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function writeRows(rows: ProductGame[]) {
  payrollStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function useDemoProductGames() {
  const [rows, setRows] = useState<ProductGame[]>(seedGames);

  useEffect(() => {
    const sync = () => setRows(readRows() ?? seedGames);
    sync();
    window.addEventListener("storage", sync);
    window.addEventListener(CHANGE_EVENT, sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener(CHANGE_EVENT, sync);
    };
  }, []);

  const games = useMemo(() => rows.filter((row) => row.active), [rows]);

  const addGame = useCallback((input: { code: string; name: string; aliases?: string[]; regions: ProductGameRegion[] }) => {
    const current = readRows() ?? seedGames;
    const code = input.code.trim().toUpperCase();
    const name = input.name.trim();
    if (!code || !name) return { ok: false as const, message: "Kode dan nama game wajib diisi." };
    if (!input.regions.length || input.regions.some((region) => !region.name.trim() || !region.servers.length || region.servers.some((server) => !server.trim()))) {
      return { ok: false as const, message: "Setiap game harus memiliki minimal 1 Region dan 1 Server." };
    }
    if (current.some((row) => row.code.toUpperCase() === code || row.name.toLocaleLowerCase("id-ID") === name.toLocaleLowerCase("id-ID"))) {
      return { ok: false as const, message: "Game dengan kode atau nama tersebut sudah ada." };
    }

    const row: ProductGame = {
      id: `game-user-${Date.now()}`,
      code,
      name,
      aliases: (input.aliases ?? []).map((x) => x.trim()).filter(Boolean),
      regions: input.regions.map((region) => ({
        name: region.name.trim(),
        servers: region.servers.map((server) => server.trim()).filter(Boolean),
      })),
      active: true,
    };
    const next = [...current, row];
    writeRows(next);
    setRows(next);
    return { ok: true as const, row };
  }, []);

  const resetGames = useCallback(() => {
    payrollStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new Event(CHANGE_EVENT));
    setRows(seedGames);
  }, []);

  return { games, addGame, resetGames };
}
