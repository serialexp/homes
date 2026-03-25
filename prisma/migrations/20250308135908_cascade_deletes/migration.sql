-- DropForeignKey
ALTER TABLE `price_history` DROP FOREIGN KEY `price_history_property_id_fkey`;

-- DropForeignKey
ALTER TABLE `rental_price_history` DROP FOREIGN KEY `rental_price_history_rental_unit_id_fkey`;

-- DropForeignKey
ALTER TABLE `rental_unit` DROP FOREIGN KEY `rental_unit_building_id_fkey`;

-- AddForeignKey
ALTER TABLE `rental_unit` ADD CONSTRAINT `rental_unit_building_id_fkey` FOREIGN KEY (`building_id`) REFERENCES `building`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `price_history` ADD CONSTRAINT `price_history_property_id_fkey` FOREIGN KEY (`property_id`) REFERENCES `property`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `rental_price_history` ADD CONSTRAINT `rental_price_history_rental_unit_id_fkey` FOREIGN KEY (`rental_unit_id`) REFERENCES `rental_unit`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
