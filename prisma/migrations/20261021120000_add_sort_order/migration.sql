-- AlterTable
ALTER TABLE "Category" ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- Backfill: preserve the current alphabetical order so nothing moves on deploy.
UPDATE "Category" AS c
SET "sortOrder" = o.rn
FROM (
  SELECT "id", (ROW_NUMBER() OVER (ORDER BY "name") - 1)::INTEGER AS rn
  FROM "Category"
) AS o
WHERE c."id" = o."id";

UPDATE "Product" AS p
SET "sortOrder" = o.rn
FROM (
  SELECT "id", (ROW_NUMBER() OVER (PARTITION BY "categoryId" ORDER BY "name") - 1)::INTEGER AS rn
  FROM "Product"
) AS o
WHERE p."id" = o."id";
