-- DropForeignKey
ALTER TABLE `building_station` DROP FOREIGN KEY `building_station_building_id_fkey`;

-- DropForeignKey
ALTER TABLE `building_station` DROP FOREIGN KEY `building_station_station_id_fkey`;

-- DropForeignKey
ALTER TABLE `station` DROP FOREIGN KEY `station_train_line_id_fkey`;

-- AddForeignKey
ALTER TABLE `station` ADD CONSTRAINT `station_train_line_id_fkey` FOREIGN KEY (`train_line_id`) REFERENCES `train_line`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `building_station` ADD CONSTRAINT `building_station_building_id_fkey` FOREIGN KEY (`building_id`) REFERENCES `building`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `building_station` ADD CONSTRAINT `building_station_station_id_fkey` FOREIGN KEY (`station_id`) REFERENCES `station`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
