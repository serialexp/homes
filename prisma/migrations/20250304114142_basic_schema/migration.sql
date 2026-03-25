-- CreateTable
CREATE TABLE `page` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `url` VARCHAR(255) NOT NULL,
    `content` LONGTEXT NOT NULL,
    `kind` VARCHAR(50) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `property` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `region` VARCHAR(100) NOT NULL,
    `province` VARCHAR(100) NOT NULL,
    `price` INTEGER NOT NULL,
    `coverage` INTEGER NOT NULL DEFAULT 0,
    `volume` INTEGER NOT NULL DEFAULT 0,
    `area` DOUBLE NOT NULL DEFAULT 0,
    `building_area` DOUBLE NOT NULL DEFAULT 0,
    `type` VARCHAR(100) NULL,
    `train_line` VARCHAR(100) NOT NULL,
    `train_station` VARCHAR(100) NOT NULL,
    `station_distance_foot` INTEGER NOT NULL DEFAULT 0,
    `address` VARCHAR(255) NOT NULL,
    `suumo_id` VARCHAR(50) NOT NULL,
    `suumo_js_id` VARCHAR(50) NOT NULL,
    `url` VARCHAR(255) NOT NULL,
    `postal_code` VARCHAR(20) NOT NULL,
    `state` VARCHAR(100) NOT NULL,
    `city` VARCHAR(100) NOT NULL,
    `property_type` VARCHAR(50) NOT NULL,
    `insert_date` VARCHAR(20) NOT NULL,

    INDEX `property_suumo_id_idx`(`suumo_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
