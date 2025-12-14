import { createServerFn } from '@tanstack/react-start'
import { notFound } from '@tanstack/react-router'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/db'
import { notes } from '@/db/schema'
import type { Note } from '@/types/note'

// Re-exportar el tipo para compatibilidad
export type { Note }

// Schemas de validación con Zod
const NoteIdSchema = z.object({
  id: z.string().uuid('El ID debe ser un UUID válido'),
})

const CreateNoteSchema = z.object({
  title: z
    .string()
    .min(1, 'El título es requerido')
    .max(255, 'El título no puede exceder 255 caracteres'),
  content: z.string().min(1, 'El contenido es requerido'),
})

// Server Function para obtener todas las notas
export const getNotes = createServerFn().handler(async () => {
  const allNotes = await db.select().from(notes)
  return allNotes.map((note) => ({
    id: note.id,
    title: note.title,
    content: note.content,
    createdAt: note.createdAt,
  }))
})

// Server Function para obtener una nota por ID
export const getNoteById = createServerFn()
  .inputValidator(NoteIdSchema)
  .handler(async ({ data }) => {
    const [note] = await db
      .select()
      .from(notes)
      .where(eq(notes.id, data.id))

    if (!note) {
      throw notFound()
    }

    return {
      id: note.id,
      title: note.title,
      content: note.content,
      createdAt: note.createdAt,
    }
  })

// Server Function para crear una nota
export const createNote = createServerFn({ method: 'POST' })
  .inputValidator(CreateNoteSchema)
  .handler(async ({ data }) => {
    const [newNote] = await db
      .insert(notes)
      .values({
        title: data.title.trim(),
        content: data.content.trim(),
      })
      .returning()

    return {
      id: newNote.id,
      title: newNote.title,
      content: newNote.content,
      createdAt: newNote.createdAt,
    }
  })

// Server Function para eliminar una nota
export const deleteNote = createServerFn({ method: 'POST' })
  .inputValidator(NoteIdSchema)
  .handler(async ({ data }) => {
    const [deletedNote] = await db
      .delete(notes)
      .where(eq(notes.id, data.id))
      .returning()

    if (!deletedNote) {
      throw notFound()
    }

    return { success: true }
  })
