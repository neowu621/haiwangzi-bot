"use client";
import { useEffect, useState } from "react";
import { Check, X, Eye } from "lucide-react";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { LiffShell } from "@/components/shell/LiffShell";
import { useLiff } from "@/lib/liff/LiffProvider";

interface PendingProof {
  id: string;
  type: "deposit" | "final" | "refund";
  amount: number;
  uploadedAt: string;
  imageKey: string; // data:url 或 R2 key
  booking: {
    id: string;
    type: "daily" | "tour";
    userName: string;
    totalAmount: number;
    depositAmount: number;
    paidAmount: number;
  };
}

const TYPE_LABEL: Record<string, string> = {
  deposit: "訂金",
  final: "尾款",
  refund: "退款",
};

const R2_PUBLIC = process.env.NEXT_PUBLIC_R2_PUBLIC_BASE ?? "";
function srcOf(imageKey: string) {
  if (imageKey.startsWith("data:")) return imageKey;
  if (imageKey.startsWith("http")) return imageKey;
  return R2_PUBLIC ? `${R2_PUBLIC.replace(/\/$/, "")}/${imageKey}` : "";
}

export default function CoachPaymentPage() {
  const liff = useLiff();
  const [proofs, setProofs] = useState<PendingProof[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [preview, setPreview] = useState<PendingProof | null>(null);
  const [acting, setActing] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const d = await liff.fetchWithAuth<{ proofs: PendingProof[] }>(
        "/api/coach/payment-proofs",
      );
      setProofs(d.proofs);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, [liff]);

  async function decide(p: PendingProof, approve: boolean) {
    setActing(p.id);
    try {
      await liff.fetchWithAuth("/api/coach/payment-proofs", {
        method: "POST",
        body: JSON.stringify({ proofId: p.id, approve }),
      });
      setProofs((arr) => arr.filter((x) => x.id !== p.id));
      setPreview(null);
    } catch (e) {
      alert("失敗: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setActing(null);
    }
  }

  return (
    <LiffShell title="付款核對" backHref="/liff/coach/today">
      <div className="space-y-3 px-4 pt-4">
        {err && (
          <Card className="bg-[var(--color-coral)]/15 p-4 text-sm">
            {err}
          </Card>
        )}
        {loading && (
          <div className="py-8 text-center text-sm text-[var(--muted-foreground)]">
            載入中...
          </div>
        )}
        {!loading && proofs.length === 0 && !err && (
          <Card className="p-8 text-center text-sm text-[var(--muted-foreground)]">
            ✓ 目前沒有待核對的轉帳
          </Card>
        )}
        {proofs.map((p) => (
          <Card key={p.id}>
            <CardContent className="flex items-center gap-3 p-3">
              <button
                type="button"
                className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--muted)]"
                onClick={() => setPreview(p)}
              >
                {srcOf(p.imageKey) ? (
                  <img
                    src={srcOf(p.imageKey)}
                    alt="proof"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <Eye className="m-auto h-6 w-6 text-[var(--muted-foreground)]" />
                )}
              </button>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-bold">{p.booking.userName}</span>
                  <Badge variant="muted" className="text-[10px]">
                    {TYPE_LABEL[p.type]}
                  </Badge>
                  <Badge variant="muted" className="text-[10px]">
                    {p.booking.type === "daily" ? "日潛" : "旅行團"}
                  </Badge>
                </div>
                <div className="mt-0.5 text-lg font-bold tabular text-[var(--color-coral)]">
                  NT$ {p.amount.toLocaleString()}
                </div>
                <div className="text-xs text-[var(--muted-foreground)] tabular">
                  {new Date(p.uploadedAt).toLocaleString("zh-TW", {
                    month: "2-digit",
                    day: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <Button
                  size="sm"
                  variant="default"
                  disabled={acting === p.id}
                  onClick={() => decide(p, true)}
                >
                  <Check className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={acting === p.id}
                  onClick={() => decide(p, false)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog
        open={!!preview}
        onOpenChange={(o) => !o && setPreview(null)}
      >
        <DialogContent>
          {preview && (
            <>
              <DialogHeader>
                <DialogTitle>
                  {preview.booking.userName} · {TYPE_LABEL[preview.type]} NT$ {preview.amount.toLocaleString()}
                </DialogTitle>
              </DialogHeader>
              <img
                src={srcOf(preview.imageKey)}
                alt="proof"
                className="w-full rounded-lg"
              />
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => decide(preview, false)}
                >
                  <X className="h-4 w-4" />
                  拒絕
                </Button>
                <Button
                  variant="default"
                  className="flex-1"
                  onClick={() => decide(preview, true)}
                >
                  <Check className="h-4 w-4" />
                  確認入帳
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </LiffShell>
  );
}
