/*
  Warnings:

  - A unique constraint covering the columns `[suumo_id]` on the table `property` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE `property` ADD COLUMN `last_updated` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);

-- CreateTable
CREATE TABLE `price_history` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `property_id` INTEGER NOT NULL,
    `price` INTEGER NOT NULL,
    `price_text` VARCHAR(100) NULL,
    `recorded_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `price_history_property_id_idx`(`property_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `property_suumo_id_key` ON `property`(`suumo_id`);

-- AddForeignKey
ALTER TABLE `price_history` ADD CONSTRAINT `price_history_property_id_fkey` FOREIGN KEY (`property_id`) REFERENCES `property`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
