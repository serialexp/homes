-- AlterTable
ALTER TABLE `train_line` ADD COLUMN `canonical_id` VARCHAR(32) NULL,
    ADD COLUMN `canonical_name` VARCHAR(255) NULL,
    ADD COLUMN `kind` VARCHAR(20) NOT NULL DEFAULT 'unknown';

-- CreateIndex
CREATE INDEX `train_line_canonical_id_idx` ON `train_line`(`canonical_id`);
