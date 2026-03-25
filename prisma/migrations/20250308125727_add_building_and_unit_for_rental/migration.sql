-- CreateTable
CREATE TABLE `building` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `region` VARCHAR(100) NOT NULL,
    `province` VARCHAR(100) NOT NULL,
    `suumo_id` VARCHAR(50) NOT NULL,
    `url` VARCHAR(255) NOT NULL,
    `building_type` VARCHAR(100) NOT NULL,
    `title` VARCHAR(255) NULL,
    `address` VARCHAR(255) NOT NULL,
    `age` VARCHAR(50) NULL,
    `floors` VARCHAR(50) NULL,
    `main_image_url` VARCHAR(255) NULL,
    `stations` TEXT NOT NULL,
    `postal_code` VARCHAR(20) NOT NULL,
    `state` VARCHAR(100) NOT NULL,
    `city` VARCHAR(100) NOT NULL,
    `district` VARCHAR(255) NULL,
    `insert_date` VARCHAR(20) NOT NULL,
    `last_updated` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `building_suumo_id_key`(`suumo_id`),
    INDEX `building_suumo_id_idx`(`suumo_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `rental_unit` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `suumo_id` VARCHAR(50) NOT NULL,
    `suumo_js_id` VARCHAR(50) NOT NULL,
    `url` VARCHAR(255) NOT NULL,
    `floor` VARCHAR(20) NULL,
    `rent` INTEGER NOT NULL,
    `rent_text` VARCHAR(100) NULL,
    `management_fee` INTEGER NOT NULL DEFAULT 0,
    `management_fee_text` VARCHAR(100) NULL,
    `deposit` VARCHAR(100) NULL,
    `gratuity` VARCHAR(100) NULL,
    `layout` VARCHAR(50) NULL,
    `size` DOUBLE NOT NULL DEFAULT 0,
    `size_text` VARCHAR(50) NULL,
    `thumbnail_url` VARCHAR(255) NULL,
    `image_urls` TEXT NULL,
    `tags` TEXT NULL,
    `insert_date` VARCHAR(20) NOT NULL,
    `last_updated` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `building_id` INTEGER NOT NULL,

    UNIQUE INDEX `rental_unit_suumo_id_key`(`suumo_id`),
    INDEX `rental_unit_suumo_id_idx`(`suumo_id`),
    INDEX `rental_unit_building_id_idx`(`building_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `rental_price_history` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `rental_unit_id` INTEGER NOT NULL,
    `rent` INTEGER NOT NULL,
    `rent_text` VARCHAR(100) NULL,
    `management_fee` INTEGER NOT NULL DEFAULT 0,
    `management_fee_text` VARCHAR(100) NULL,
    `recorded_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `rental_price_history_rental_unit_id_idx`(`rental_unit_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `rental_unit` ADD CONSTRAINT `rental_unit_building_id_fkey` FOREIGN KEY (`building_id`) REFERENCES `building`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `rental_price_history` ADD CONSTRAINT `rental_price_history_rental_unit_id_fkey` FOREIGN KEY (`rental_unit_id`) REFERENCES `rental_unit`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
