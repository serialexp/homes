/*
  Warnings:

  - You are about to alter the column `insert_date` on the `building` table. The data in that column could be lost. The data in that column will be cast from `VarChar(20)` to `DateTime(3)`.
  - You are about to alter the column `insert_date` on the `rental_unit` table. The data in that column could be lost. The data in that column will be cast from `VarChar(20)` to `DateTime(3)`.

*/
-- AlterTable
ALTER TABLE `building` MODIFY `insert_date` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);

-- AlterTable
ALTER TABLE `rental_unit` MODIFY `insert_date` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);
