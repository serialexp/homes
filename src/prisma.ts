import { PrismaClient } from '@prisma/client'

// Create a singleton PrismaClient instance
const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
})

// Export the client for use in other files
export default prisma 