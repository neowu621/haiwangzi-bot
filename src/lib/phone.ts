/**
 * 台灣手機號碼格式化 helper
 *
 * 規則：
 *   - 只允許數字
 *   - 上限 10 碼
 *   - 4 碼後自動插入 `-` → `09xx-xxxxxx`
 *
 * 用法：
 *   <Input
 *     value={phone}
 *     onChange={(e) => setPhone(formatPhoneTW(e.target.value))}
 *   />
 */
export function formatPhoneTW(input: string): string {
  // 抓出所有數字（允許使用者貼上含 - 或空白的原始值）
  const digits = input.replace(/\D/g, "").slice(0, 10);
  if (digits.length <= 4) return digits;
  return `${digits.slice(0, 4)}-${digits.slice(4)}`;
}

/**
 * 反向：把格式化後的字串去掉 - 拿純數字（送 API 用）
 * 但其實 API 不在乎，存哪種格式都可以
 */
export function unformatPhone(formatted: string): string {
  return formatted.replace(/\D/g, "");
}

/**
 * 驗證是否為合法 TW 手機（10 碼以 09 開頭）
 */
export function isValidPhoneTW(input: string): boolean {
  const digits = unformatPhone(input);
  return /^09\d{8}$/.test(digits);
}
