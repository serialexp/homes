/*
  Warnings:

  - A unique constraint covering the columns `[url]` on the table `page` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX `page_url_key` ON `page`(`url`);
