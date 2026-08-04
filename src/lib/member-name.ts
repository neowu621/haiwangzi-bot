// v1015：會員名稱統一顯示格式 ——「暱稱（姓名）」；沒填暱稱暫以「?」表示。
//   全站（後台/教練端）顯示會員名稱一律用這個 helper，格式要改只動這裡。
export function memberName(
  nickname: string | null | undefined,
  name: string | null | undefined,
): string {
  const nick = (nickname ?? "").trim() || "?";
  return `${nick}（${name ?? "—"}）`;
}
