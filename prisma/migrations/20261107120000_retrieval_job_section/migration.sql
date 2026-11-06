-- CreateTable
CREATE TABLE `retrieval_job_section` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `jobId` INTEGER NOT NULL,
    `sectionKey` VARCHAR(100) NOT NULL,
    `regionId` VARCHAR(10) NOT NULL,
    `provinceId` VARCHAR(10) NOT NULL,
    `sectionType` VARCHAR(10) NOT NULL,
    `calcTotalItems` INTEGER NOT NULL,
    `scrapedPages` INTEGER NOT NULL,
    `computedPages` INTEGER NOT NULL,
    `totalPages` INTEGER NOT NULL,
    `pagesFetched` INTEGER NOT NULL,
    `itemsProcessed` INTEGER NOT NULL,
    `newItems` INTEGER NOT NULL,
    `updatedItems` INTEGER NOT NULL,
    `stopReason` VARCHAR(20) NOT NULL,
    `startedAt` DATETIME(3) NOT NULL,
    `finishedAt` DATETIME(3) NOT NULL,
    `errorMessage` TEXT NULL,

    INDEX `retrieval_job_section_jobId_idx`(`jobId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `retrieval_job_section` ADD CONSTRAINT `retrieval_job_section_jobId_fkey` FOREIGN KEY (`jobId`) REFERENCES `retrieval_job`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
