import { createServerFn } from '@tanstack/react-start'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { notes } from '@/db/schema'
import type { Note } from '@/types/note'

// Re-exportar el tipo para compatibilidad
export type { Note }

// Funciones internas (sin createServerFn para uso en loaders)
async function _getNotes(): Promise<Note[]> {
  const allNotes = await db.select().from(notes)
  return allNotes.map((note) => ({
    id: note.id,
    title: note.title,
    content: note.content,
    createdAt: note.createdAt,
  }))
}

async function _createNote(data: {
  title: string
  content: string
}): Promise<Note> {
  // Validar que title y content no estén vacíos
  if (!data?.title || !data.title.trim()) {
    throw new Error('El título es requerido')
  }
  if (!data?.content || !data.content.trim()) {
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

async function _getNoteById(id: string): Promise<Note | null> {
  if (!id) {
    return null
  }
  
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

async function _deleteNote(id: string): Promise<{ success: boolean }> {
  if (!id) {
    throw new Error('ID es requerido')
  }
  await db.delete(notes).where(eq(notes.id, id))
  return { success: true }
}

// Exportar funciones para uso en loaders (sin createServerFn)
export const getNotes = _getNotes
export const getNoteById = _getNoteById

// Exportar server functions para uso en cliente (con createServerFn)
// useServerFn llama a estas funciones con los argumentos directamente
export const createNote = createServerFn().handler(async (ctx) => {
  // useServerFn pasa los argumentos como primer parámetro en ctx.data
  const data = (ctx as any).data as { title: string; content: string }
  return _createNote(data)
}) as any

export const deleteNote = createServerFn().handler(async (ctx) => {
  const id = (ctx as any).data as string
  return _deleteNote(id)
}) as any

