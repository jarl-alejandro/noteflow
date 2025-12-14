import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { notes } from '@/db/schema'

// Tipo para una nota
export type Note = {
  id: string
  title: string
  content: string
  createdAt: Date
}

// Obtener todas las notas
export async function getNotes(): Promise<Note[]> {
  const allNotes = await db.select().from(notes)
  return allNotes.map((note) => ({
    id: note.id,
    title: note.title,
    content: note.content,
    createdAt: note.createdAt,
  }))
}

// Crear una nueva nota
export async function createNote(data: {
  title: string
  content: string
}): Promise<Note> {
  // Validar que title y content no estén vacíos
  if (!data.title || !data.title.trim()) {
    throw new Error('El título es requerido')
  }
  if (!data.content || !data.content.trim()) {
    throw new Error('El contenido es requerido')
  }

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
}

// Obtener una nota específica por ID
export async function getNoteById(id: string): Promise<Note | null> {
  const [note] = await db.select().from(notes).where(eq(notes.id, id))
  
  if (!note) {
    return null
  }

  return {
    id: note.id,
    title: note.title,
    content: note.content,
    createdAt: note.createdAt,
  }
}

// Eliminar una nota
export async function deleteNote(id: string): Promise<{ success: boolean }> {
  await db.delete(notes).where(eq(notes.id, id))
  return { success: true }
}

