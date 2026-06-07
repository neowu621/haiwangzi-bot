// v388：Email 驗證通過後發放「註冊禮金」+（若當月生日）補發「生日禮金」。
//   - 註冊禮金：金額讀 SiteConfig.signupRewardAmount（0=停用），去重靠 CreditTx reason=signup_reward。
//   - 當月生日：若會員生日落在「當月」且今年還沒發過 → 一併發生日禮金（一年一次）。
import { prisma } from "@/lib/prisma";
import { grantCredit } from "@/lib/credit";

function taipeiYearMonth(): { year: number; month: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "numeric",
  }).formatToParts(new Date());
  const year = Number(parts.find((p) => p.type === "year")?.value ?? "0");
  const month = Number(parts.find((p) => p.type === "month")?.value ?? "0");
  return { year, month };
}

export async function grantSignupAndBirthdayOnVerify(
  userId: string,
): Promise<{ signup: number; birthday: number }> {
  const out = { signup: 0, birthday: 0 };
  const user = await prisma.user.findUnique({ where: { lineUserId: userId } });
  if (!user || user.deletedAt) return out;
  const cfg = await prisma.siteConfig
    .findUnique({ where: { id: "default" } })
    .catch(() => null);

  // 1) 註冊禮金（去重：已有 signup_reward 就不重發）
  const amount =
    (cfg as unknown as { signupRewardAmount?: number } | null)?.signupRewardAmount ?? 50;
  if (amount > 0) {
    const existing = await prisma.creditTx.findFirst({
      where: { userId, reason: "signup_reward" },
      select: { id: true },
    });
    if (!existing) {
      const days =
        (cfg as unknown as { signupRewardExpiryDays?: number } | null)
          ?.signupRewardExpiryDays ?? 0;
      const expiresAt = days > 0 ? new Date(Date.now() + days * 86400000) : null;
      try {
        await grantCredit({
          userId,
          amount,
          reason: "signup_reward",
          refType: "signup",
          note: "註冊禮金（Email 驗證通過）",
          expiresAt,
        });
        out.signup = amount;
      } catch (e) {
        console.error("[signup reward grant]", e);
      }
    }
  }

  // 2) 當月生日 → 一併補發生日禮金（一年一次）
  if (user.birthday) {
    const { year, month } = taipeiYearMonth();
    const bMonth = user.birthday.getUTCMonth() + 1; // @db.Date 存 UTC 午夜
    const bAmount = cfg?.birthdayCreditAmount ?? 100;
    if (bMonth === month && bAmount > 0 && user.birthdayCreditYear !== year) {
      const bDays = cfg?.birthdayCreditExpiryDays ?? 360;
      const bExp = bDays > 0 ? new Date(Date.now() + bDays * 86400000) : null;
      try {
        await grantCredit({
          userId,
          amount: bAmount,
          reason: "birthday",
          refType: "birthday",
          note: `生日禮金（${month} 月，註冊當月補發）`,
          expiresAt: bExp,
        });
        await prisma.user.update({
          where: { lineUserId: userId },
          data: { birthdayCreditYear: year },
        });
        out.birthday = bAmount;
      } catch (e) {
        console.error("[birthday-on-verify grant]", e);
      }
    }
  }
  return out;
}
