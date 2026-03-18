-- Create branches table
CREATE TABLE "branches" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "branches_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "branches_name_key" ON "branches"("name");

-- Add branchId to locations and create foreign key
ALTER TABLE "Location" ADD COLUMN "branchId" TEXT;

-- Migrate existing locations: create a default branch and assign all locations to it
WITH default_branch AS (
  INSERT INTO "branches" ("id", "name", "createdAt")
  VALUES ('default-branch-id', 'Default Branch', CURRENT_TIMESTAMP)
  RETURNING "id"
)
UPDATE "Location" SET "branchId" = (SELECT "id" FROM default_branch);

-- Make branchId NOT NULL
ALTER TABLE "Location" ALTER COLUMN "branchId" SET NOT NULL;

-- Add foreign key constraint
ALTER TABLE "Location" ADD CONSTRAINT "Location_branchId_fkey" 
  FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Drop the unique constraint on name and add composite unique constraint
DROP INDEX IF EXISTS "Location_name_key";
CREATE UNIQUE INDEX "Location_name_branchId_key" ON "Location"("name", "branchId");
