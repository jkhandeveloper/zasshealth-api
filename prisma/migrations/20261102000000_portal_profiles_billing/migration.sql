ALTER TABLE "User" ADD COLUMN "name" TEXT;
ALTER TABLE "PatientProfile" ADD COLUMN "age" INTEGER;
ALTER TABLE "PatientProfile" ADD COLUMN "gender" TEXT;
ALTER TABLE "PatientProfile" ADD COLUMN "allergies" TEXT;
CREATE TABLE "BillItem" (
  "id" UUID NOT NULL,
  "billId" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "unitPrice" DECIMAL(12,2) NOT NULL,
  CONSTRAINT "BillItem_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "BillItem_billId_idx" ON "BillItem"("billId");
ALTER TABLE "BillItem" ADD CONSTRAINT "BillItem_billId_fkey" FOREIGN KEY ("billId") REFERENCES "Bill"("id") ON DELETE CASCADE ON UPDATE CASCADE;
