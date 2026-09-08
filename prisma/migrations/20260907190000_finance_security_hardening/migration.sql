-- الضريبة تحفظ على الفاتورة نفسها حتى لا تتغير الفواتير السابقة عند تعديل الإعدادات.
ALTER TABLE "Sale" ADD COLUMN "taxRate" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Sale" ADD COLUMN "taxAmount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Purchase" ADD COLUMN "taxRate" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Purchase" ADD COLUMN "taxAmount" INTEGER NOT NULL DEFAULT 0;

-- لا نحتفظ برمز جلسة صالح داخل قاعدة البيانات. الجلسات السابقة تُنهى عمدًا عند الترقية.
DELETE FROM "Session";
ALTER TABLE "Session" DROP COLUMN "token";
ALTER TABLE "Session" ADD COLUMN "tokenHash" TEXT NOT NULL;
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");
