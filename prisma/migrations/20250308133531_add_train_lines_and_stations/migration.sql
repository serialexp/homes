-- CreateTable
CREATE TABLE `train_line` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(100) NOT NULL,
    `translated_name` VARCHAR(255) NULL,
    `operator` VARCHAR(100) NULL,
    `region` VARCHAR(100) NULL,
    `insert_date` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `last_updated` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `train_line_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `station` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(100) NOT NULL,
    `translated_name` VARCHAR(255) NULL,
    `insert_date` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `last_updated` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `train_line_id` INTEGER NOT NULL,

    INDEX `station_train_line_id_idx`(`train_line_id`),
    UNIQUE INDEX `station_name_train_line_id_key`(`name`, `train_line_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `building_station` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `building_id` INTEGER NOT NULL,
    `station_id` INTEGER NOT NULL,
    `walking_minutes` INTEGER NOT NULL,
    `insert_date` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `last_updated` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `building_station_building_id_idx`(`building_id`),
    INDEX `building_station_station_id_idx`(`station_id`),
    UNIQUE INDEX `building_station_building_id_station_id_key`(`building_id`, `station_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `station` ADD CONSTRAINT `station_train_line_id_fkey` FOREIGN KEY (`train_line_id`) REFERENCES `train_line`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `building_station` ADD CONSTRAINT `building_station_building_id_fkey` FOREIGN KEY (`building_id`) REFERENCES `building`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `building_station` ADD CONSTRAINT `building_station_station_id_fkey` FOREIGN KEY (`station_id`) REFERENCES `station`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
