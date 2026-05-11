import type { FlexMessage } from "./index";

export const COLORS = {
  oceanDeep: "#0A2342",
  oceanSurface: "#1B3A5C",
  phosphor: "#00D9CB",
  coral: "#FF7B5A",
  gold: "#FFB800",
  midnight: "#0F1B2D",
  mute: "#5A6B7D",
};

export function asString(v: unknown, fallback = ""): string {
  if (v == null) return fallback;
  return String(v);
}

export function asNumber(v: unknown, fallback = 0): number {
  if (v == null || v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function flex(
  altText: string,
  contents: object,
): FlexMessage {
  return {
    type: "flex",
    altText,
    contents: contents as never,
  };
}
