# Runbook：根治 `prisma db push` 一直 data-loss 失敗（4 個 code 唯一約束）

> 狀態：**草稿，待老闆排時段執行**。這是動到 **prod DB schema** 的維運操作，務必照步驟、先備份、先在複本演練。
> 目標：讓 `prisma db push`（或改用 `migrate deploy`）對 prod 乾淨通過，未來 schema 變更能自動套用，不必再人工顧 `migrate-safety.js`。

---

## 0. 背景（現況）
- 專案一直用 `prisma db push`（沒有 `prisma/migrations/` 歷史）。
- prod DB 有 drift：`db push` 想加 7 個 `@unique` 約束，被「怕有重複值」擋（需 `--accept-data-loss`）。
- v381 已用 `migrate-safety` 補了 7 個 `CREATE UNIQUE INDEX ..._key`，**全部建成功（=資料無重複）**。
- 但 `db push` 仍認不得其中 **4 個**：`bookings.code` / `credit_txs.code` / `diving_trips.code` / `tour_packages.code`。
  （users.code、dive_wishes.code、bookings.pay_link_token 已被認可）
- **功能完全正常**；這 4 個只是 log 噪音 + 「未來新 schema 不會自動套用」。

---

## 1. 前置（必做，不可跳過）
1. **完整備份 prod DB**（除了每日排程，手動再來一次）：
   - 從 Zeabur DB 服務匯出，或 `pg_dump`：
     ```
     pg_dump "$PROD_DATABASE_URL" -Fc -f haiwangzi_$(date +%Y%m%d_%H%M).dump
     ```
2. **建一份 prod DB 的複本**（同版本 Postgres）做演練：
   ```
   createdb haiwangzi_copy
   pg_restore -d haiwangzi_copy haiwangzi_YYYYMMDD_HHMM.dump
   ```
3. 選 **低流量時段**（潛水活動少、無人正在下單/付款）。

---

## 2. 在複本上「診斷」Prisma 到底想要什麼（關鍵）
目的：拿到 Prisma 期望的**精確 DDL**，不用猜。

```
# 用複本當 target，schema 當期望，產出「要把 DB 變成 schema」需要的 SQL
DATABASE_URL="postgres://.../haiwangzi_copy" \
npx prisma migrate diff \
  --from-url "postgres://.../haiwangzi_copy" \
  --to-schema-datamodel prisma/schema.prisma \
  --script > reconcile.sql

cat reconcile.sql
```
- **預期**：`reconcile.sql` 只有「ADD CONSTRAINT/INDEX UNIQUE」之類（針對那 4 個 code），**不應有任何 `DROP TABLE` / `DROP COLUMN` / 改型別**。
- ⚠️ 若出現 DROP / 改型別 → **停手**，回報，先釐清（代表 schema 與 DB 還有別的落差）。

---

## 3. 在複本上演練套用 + 驗證
```
# 在複本上跑那段 SQL
psql "postgres://.../haiwangzi_copy" -f reconcile.sql

# 再 diff 一次，應該「無差異」
npx prisma migrate diff \
  --from-url "postgres://.../haiwangzi_copy" \
  --to-schema-datamodel prisma/schema.prisma --script
# → 預期輸出：-- This is an empty migration.（代表已對齊）
```
- 確認複本資料**筆數不變、無錯誤**。

---

## 4. 套用到 prod（確認複本 OK 後）
> 只跑「第 2 步驗證過、確定只 ADD 不 DROP」的那段 `reconcile.sql`。
```
psql "$PROD_DATABASE_URL" -f reconcile.sql
```
- 因為已知無重複值（v381 索引建得起來），ADD UNIQUE 會成功。
- 跑完再 diff 一次 prod → 應為 empty。

---

## 5. 收尾：讓 entrypoint 之後乾淨
兩條路擇一（之後另開 PR）：
- **A（最小改動）**：維持 `db push`。對齊後它就不再 data-loss，正常通過。
- **B（正規化，建議長期）**：改用 Migrate
  1. `npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script > prisma/migrations/0_init/migration.sql`
  2. `npx prisma migrate resolve --applied 0_init`（標記 baseline 已套用，不重跑）
  3. `docker-entrypoint.sh` 把 `prisma db push` 換成 `prisma migrate deploy`
  4. 之後 schema 變更走 `prisma migrate dev` 產 migration

---

## 6. 回滾
- 本操作只 **ADD** 約束、不刪資料 → 風險低。
- 若 prod 套用後出現非預期錯誤：
  - 移除剛加的約束：`ALTER TABLE <t> DROP CONSTRAINT IF EXISTS <name>;`
  - 或從第 1 步的 dump 還原（最壞情況）。

---

## 7. 驗收標準
- [ ] 複本 diff = empty
- [ ] prod 套用後 diff = empty
- [ ] 下次 deploy 的 log **沒有** `db push failed` / `data loss`
- [ ] 所有功能（下單、付款、付款紀錄、Dump）正常

---

### 風險摘要
| 風險 | 緩解 |
|---|---|
| 套用時掉資料 | 只 ADD UNIQUE、不 DROP；先備份 + 複本演練 |
| 有重複 code 導致 ADD 失敗 | v381 已證實索引建得起來 = 無重複；複本會先抓到 |
| 連錯 DB | 指令明確指定 URL，prod 操作前再次確認 |
| 執行中有人下單 | 選低流量時段、操作僅數秒 |
