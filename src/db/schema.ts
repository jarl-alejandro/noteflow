import { pgTable, uuid, varchar, text, timestamp } from 'drizzle-orm/pg-core'

// Esquema de la tabla notes
export const notes = pgTable('notes', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: varchar('title', { length: 255 }).notNull(),
  content: text('content').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

