-- AlterTable
ALTER TABLE `property` ADD COLUMN `section_type` VARCHAR(10) NULL;

-- CreateIndex
CREATE INDEX `property_section_type_region_province_idx` ON `property`(`section_type`, `region`, `province`);
