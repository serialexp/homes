-- CreateTable
CREATE TABLE `translation_cache` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `source_text` VARCHAR(500) NOT NULL,
    `translated_text` VARCHAR(500) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `translation_cache_source_text_key`(`source_text`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
