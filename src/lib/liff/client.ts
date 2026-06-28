"use client";

type LiffClient = typeof import("@line/liff").default;

let liffClientPromise: Promise<LiffClient> | null = null;

export function loadLiffClient(): Promise<LiffClient> {
  liffClientPromise ??= import("@line/liff").then((m) => m.default);
  return liffClientPromise;
}
