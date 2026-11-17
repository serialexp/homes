-- AlterTable
ALTER TABLE `property` ADD COLUMN `detail_fetched_at` DATETIME(3) NULL;

-- CreateTable
CREATE TABLE `property_detail_fact` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `property_id` INTEGER NOT NULL,
    `sort_order` INTEGER NOT NULL,
    `label` VARCHAR(255) NOT NULL,
    `value` TEXT NOT NULL,

    INDEX `property_detail_fact_property_id_idx`(`property_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `property_photo` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `property_id` INTEGER NOT NULL,
    `sort_order` INTEGER NOT NULL,
    `url` VARCHAR(512) NOT NULL,
    `caption` VARCHAR(255) NOT NULL,

    INDEX `property_photo_property_id_idx`(`property_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `property_detail_request` (
    `property_id` INTEGER NOT NULL,
    `status` VARCHAR(20) NOT NULL,
    `requested_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `last_error` TEXT NULL,

    INDEX `property_detail_request_status_requested_at_idx`(`status`, `requested_at`),
    PRIMARY KEY (`property_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `property_detail_fact` ADD CONSTRAINT `property_detail_fact_property_id_fkey` FOREIGN KEY (`property_id`) REFERENCES `property`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `property_photo` ADD CONSTRAINT `property_photo_property_id_fkey` FOREIGN KEY (`property_id`) REFERENCES `property`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `property_detail_request` ADD CONSTRAINT `property_detail_request_property_id_fkey` FOREIGN KEY (`property_id`) REFERENCES `property`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

