import { messagingApi, validateSignature } from "@line/bot-sdk";

let _client: messagingApi.MessagingApiClient | null = null;

export function getLineClient() {
  if (_client) return _client;
  const accessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!accessToken) throw new Error("LINE_CHANNEL_ACCESS_TOKEN not set");
  _client = new messagingApi.MessagingApiClient({
    channelAccessToken: accessToken,
  });
  return _client;
}

export function verifyLineSignature(rawBody: string, signature: string | null): boolean {
  if (!signature) return false;
  const secret = process.env.LINE_CHANNEL_SECRET;
  if (!secret) return false;
  return validateSignature(rawBody, secret, signature);
}
