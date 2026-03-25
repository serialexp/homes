-- CreateTable
CREATE TABLE `retrieval_job` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `processId` VARCHAR(50) NOT NULL,
    `status` VARCHAR(20) NOT NULL,
    `startTime` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `endTime` DATETIME(3) NULL,
    `region` VARCHAR(100) NULL,
    `province` VARCHAR(100) NULL,
    `type` VARCHAR(100) NULL,
    `refresh` BOOLEAN NOT NULL DEFAULT false,
    `totalItems` INTEGER NOT NULL DEFAULT 0,
    `processedItems` INTEGER NOT NULL DEFAULT 0,
    `totalPages` INTEGER NOT NULL DEFAULT 0,
    `downloadedPages` INTEGER NOT NULL DEFAULT 0,
    `errorMessage` TEXT NULL,

    UNIQUE INDEX `retrieval_job_processId_key`(`processId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
