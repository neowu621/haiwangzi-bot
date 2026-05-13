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

/**
 * 訊息模板覆寫 — Admin 在 /liff/admin/templates 可改的欄位
 * 若 DB 沒寫該欄位則用預設（factory hardcoded 的字串）
 */
export interface TemplateOverride {
  title?: string | null;
  subtitle?: string | null;
  bodyText?: string | null;
  buttonLabel?: string | null;
  altText?: string | null;
}

/** 取得欄位值：override > default */
export function ovr(
  override: TemplateOverride | undefined,
  field: keyof TemplateOverride,
  defaultValue: string,
): string {
  return override?.[field] ?? defaultValue;
}

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
