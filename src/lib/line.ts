import { messagingApi, validateSignature } from "@line/bot-sdk";
import { getSocialFooter } from "./social-footer"; // v344

let _client: messagingApi.MessagingApiClient | null = null;

// v344：把社群連結 footer 接到最後一則 text 訊息結尾（Flex / 非 text 不動）
//   只動最後一則 text，避免多 bubble 重複貼。
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function appendFooterToMessages(req: any): Promise<any> {
  try {
    if (!req || !Array.isArray(req.messages) || req.messages.length === 0) return req;
    const footer = await getSocialFooter();
    if (!footer.lineText) return req;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const msgs = [...req.messages];
    for (let i = msgs.length - 1; i >= 0; i--) {
      const m = msgs[i];
      if (m && m.type === "text" && typeof m.text === "string") {
        // LINE 單則 text 上限 5000 字，避免超過
        const merged = (m.text + footer.lineText).slice(0, 4900);
        msgs[i] = { ...m, text: merged };
        break;
      }
    }
    return { ...req, messages: msgs };
  } catch {
    return req; // footer 失敗不影響主訊息
  }
}

export function getLineClient() {
  if (_client) return _client;
  const accessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!accessToken) throw new Error("LINE_CHANNEL_ACCESS_TOKEN not set");
  const real = new messagingApi.MessagingApiClient({
    channelAccessToken: accessToken,
  });
  // v344：用 Proxy 攔截 pushMessage / replyMessage / multicast / broadcast，
  //   自動在最後一則 text 附加社群連結 footer。其他方法照常代理。
  _client = new Proxy(real, {
    get(target, prop, receiver) {
      if (prop === "pushMessage" || prop === "replyMessage" || prop === "multicast" || prop === "broadcast") {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return async (req: any, ...rest: any[]) => {
          const patched = await appendFooterToMessages(req);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return (target as any)[prop](patched, ...rest);
        };
      }
      const val = Reflect.get(target, prop, receiver);
      return typeof val === "function" ? val.bind(target) : val;
    },
  });
  return _client;
}

export function verifyLineSignature(rawBody: string, signature: string | null): boolean {
  if (!signature) return false;
  const secret = process.env.LINE_CHANNEL_SECRET;
  if (!secret) return false;
  return validateSignature(rawBody, secret, signature);
}
