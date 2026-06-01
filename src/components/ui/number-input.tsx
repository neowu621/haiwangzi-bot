import * as React from "react";
import { Input, type InputProps } from "./input";

/**
 * v205：純數字輸入元件
 *
 * 取代 `<Input type="number" value={n} onChange={e => setN(parseInt(e.target.value))} />`
 * 解決：
 *  - 瀏覽器 type=number 接受 "0111" / "1e3" / "-" 等怪字串
 *  - parseInt("0111") 變 111，但 React value=111 顯示對，瞬間之內輸入端會卡住「0111」
 *  - 負數、小數等 admin 不需要的輸入
 *
 * 用法：
 *   <NumberInput value={amount} onChange={setAmount} min={0} max={100} />
 *   <NumberInput value={amount} onChange={setAmount} allowDecimal />  // 允許小數
 */
export interface NumberInputProps extends Omit<InputProps, "type" | "value" | "onChange"> {
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  /** 允許小數（預設只整數）*/
  allowDecimal?: boolean;
  /** 允許負數（預設不允許）*/
  allowNegative?: boolean;
}

export const NumberInput = React.forwardRef<HTMLInputElement, NumberInputProps>(
  ({ value, onChange, min, max, allowDecimal, allowNegative, ...rest }, ref) => {
    function handle(e: React.ChangeEvent<HTMLInputElement>) {
      let raw = e.target.value;
      // 1. 取允許字元（數字 + 可選負號/小數點）
      const allowedChars = `\\d${allowDecimal ? "." : ""}${allowNegative ? "-" : ""}`;
      const stripRegex = new RegExp(`[^${allowedChars}]`, "g");
      raw = raw.replace(stripRegex, "");
      // 2. 負號只在開頭
      if (allowNegative) {
        raw = raw.replace(/(?!^)-/g, "");
      }
      // 3. 小數點只能一個
      if (allowDecimal) {
        const firstDotAt = raw.indexOf(".");
        if (firstDotAt >= 0) {
          raw = raw.slice(0, firstDotAt + 1) + raw.slice(firstDotAt + 1).replace(/\./g, "");
        }
      }
      // 4. 去除 leading 0（但 "0." 保留 / 單一 "0" 保留）
      if (!allowDecimal || !raw.includes(".")) {
        if (raw.length > 1 && raw.startsWith("0")) raw = raw.replace(/^0+/, "") || "0";
        if (raw.length > 1 && raw.startsWith("-0") && raw[2] !== ".") raw = "-" + (raw.slice(2).replace(/^0+/, "") || "0");
      }
      // 5. 空字串 / 單 "-" → 0
      if (raw === "" || raw === "-") {
        onChange(0);
        return;
      }
      // 6. parse + clamp
      let n = allowDecimal ? parseFloat(raw) : parseInt(raw, 10);
      if (Number.isNaN(n)) n = 0;
      if (min !== undefined && n < min) n = min;
      if (max !== undefined && n > max) n = max;
      onChange(n);
    }

    return (
      <Input
        ref={ref}
        type="text"
        inputMode={allowDecimal ? "decimal" : "numeric"}
        value={String(value)}
        onChange={handle}
        {...rest}
      />
    );
  },
);
NumberInput.displayName = "NumberInput";
