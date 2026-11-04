-- AlterTable
ALTER TABLE `retrieval_job` ADD COLUMN `activeSlot` VARCHAR(10) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `retrieval_job_activeSlot_key` ON `retrieval_job`(`activeSlot`);
