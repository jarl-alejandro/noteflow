# Code Review Técnica - POC Nowflow

**Fecha:** 2025-01-27  
**Reviewer:** Senior Backend Architect (10+ años)  
**Contexto:** POC que será base de SaaS en producción con usuarios reales en redes lentas

---

## 1. Arquitectura y diseño

### ❌ PROBLEMAS CRÍTICOS

#### 1.1. Ausencia total de separación de responsabilidades
**Ubicación:** `src/server/functions.ts`

Todas las funciones están mezcladas en un solo archivo sin capas:
- No hay servicios de dominio
- No hay repositorios/DAOs
- No hay DTOs de respuesta
- La lógica de negocio está acoplada directamente a Drizzle

**Impacto:** Imposible testear, reutilizar o mantener. Cualquier cambio requiere tocar el mismo archivo.

**Ejemplo del problema:**
```typescript
// src/server/functions.ts:26-34
export const getNotes = createServerFn().handler(async () => {
  const allNotes = await db.select().from(notes) // ❌ Acceso directo a DB
  return allNotes.map((note) => ({ // ❌ Transformación inline
    id: note.id,
    title: note.title,
    content: note.content,
    createdAt: note.createdAt,
  }))
})
```

**Debería ser:**
```typescript
// src/services/notes.service.ts
export class NotesService {
  constructor(private notesRepo: NotesRepository) {}
  
  async getAllNotes(): Promise<Note[]> {
    return this.notesRepo.findAll()
  }
}

// src/repositories/notes.repository.ts
export class NotesRepository {
  async findAll(): Promise<Note[]> {
    return db.select().from(notes)
  }
}
```

#### 1.2. No hay manejo de errores estructurado
**Ubicación:** Todo el código

- Errores de DB se propagan sin contexto
- No hay tipos de error específicos
- No hay logging estructurado
- `console.error` en código de producción (líneas 30, 52)

**Impacto:** Imposible debuggear en producción. Errores genéricos sin contexto.

**Ejemplo:**
```typescript
// src/components/CreateNoteModal.tsx:30
console.error('Error al guardar la nota:', error) // ❌ Console en producción
```

**Debería tener:**
- Logger estructurado (Pino, Winston)
- Error types específicos (NotFoundError, ValidationError, DatabaseError)
- Error boundaries en React
- Tracking de errores (Sentry, LogRocket)

#### 1.3. Duplicación de código flagrante
**Ubicación:** `src/routes/notes/$id.tsx:27`, `src/components/NoteTable.tsx:19`

La función `formatDate` está duplicada en 2 lugares con la misma implementación.

**Impacto:** Si cambias el formato en un lugar, se rompe la consistencia.

**Solución inmediata:** Extraer a `src/utils/date.ts` o usar una librería (date-fns, dayjs).

#### 1.4. Falta de abstracción de persistencia
**Ubicación:** `src/server/functions.ts`

Drizzle está acoplado directamente. Si necesitas cambiar a otro ORM o agregar caching, tocas TODO.

**Impacto:** Lock-in tecnológico. Refactor masivo si cambias de stack.

---

### ⚠️ DEUDA TÉCNICA ACEPTABLE (temporalmente)

- Uso de TanStack Start: OK para POC, pero evalúa si necesitas SSR completo
- Validación con Zod: Bien implementada, pero falta validación de sanitización

---

## 2. Performance y uso de recursos

### ❌ PROBLEMAS CRÍTICOS

#### 2.1. `getNotes()` trae TODAS las notas sin límite
**Ubicación:** `src/server/functions.ts:26-34`

```typescript
export const getNotes = createServerFn().handler(async () => {
  const allNotes = await db.select().from(notes) // ❌ Sin LIMIT, sin paginación
  return allNotes.map((note) => ({ ... }))
})
```

**Impacto:**
- Con 10k notas: ~5-10MB de JSON por request
- Tiempo de respuesta: 2-5 segundos
- Memoria del servidor: se carga todo en RAM
- **FALLA TOTAL con 100k+ notas**

**Cuello de botella inmediato:**
- Serialización JSON de arrays grandes
- Transferencia de red
- Parsing en el cliente
- Re-renders de React con listas enormes

**Solución obligatoria:**
```typescript
export const getNotes = createServerFn()
  .inputValidator(z.object({
    page: z.number().int().min(1).default(1),
    limit: z.number().int().min(1).max(100).default(20),
  }))
  .handler(async ({ data }) => {
    const offset = (data.page - 1) * data.limit
    const allNotes = await db
      .select()
      .from(notes)
      .limit(data.limit)
      .offset(offset)
      .orderBy(desc(notes.createdAt))
    
    const total = await db.select({ count: count() }).from(notes)
    
    return {
      data: allNotes,
      pagination: {
        page: data.page,
        limit: data.limit,
        total: total[0].count,
      }
    }
  })
```

#### 2.2. No hay índices en la base de datos
**Ubicación:** `src/db/schema.ts:4-9`

```typescript
export const notes = pgTable('notes', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: varchar('title', { length: 255 }).notNull(),
  content: text('content').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})
```

**Problemas:**
- `createdAt` sin índice → ordenar por fecha será O(n log n) siempre
- `title` sin índice → búsquedas futuras serán lentas
- Sin índice compuesto para queries comunes

**Impacto:** Con 10k+ registros, queries simples tardan 100-500ms.

**Solución:**
```typescript
export const notes = pgTable('notes', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: varchar('title', { length: 255 }).notNull(),
  content: text('content').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  createdAtIdx: index('notes_created_at_idx').on(table.createdAt.desc()),
  titleIdx: index('notes_title_idx').on(table.title),
}))
```

#### 2.3. Over-fetching: trae `content` completo en listado
**Ubicación:** `src/server/functions.ts:28-33`, `src/components/NoteTable.tsx:30-35`

En el listado se trae el `content` completo y luego se trunca en el cliente.

**Impacto:**
- Nota de 50KB → se transfiere completa aunque solo muestres 50 caracteres
- Con 20 notas de 10KB cada una = 200KB innecesarios por request

**Solución:**
```typescript
// En getNotes, solo traer preview
const allNotes = await db
  .select({
    id: notes.id,
    title: notes.title,
    contentPreview: sql<string>`LEFT(${notes.content}, 100)`.as('contentPreview'),
    createdAt: notes.createdAt,
  })
  .from(notes)
```

#### 2.4. No hay límite de tamaño de `content`
**Ubicación:** `src/db/schema.ts:7`, `src/server/functions.ts:22`

`content` es `text` sin límite. Un usuario puede insertar 100MB.

**Impacto:**
- DoS por inserción de contenido masivo
- Queries lentas
- Memoria del servidor explotada

**Solución:** Agregar límite en schema y validación:
```typescript
content: text('content').notNull().$type<string>().$withMaxLength(100000), // 100KB max
```

#### 2.5. Pool de conexiones sin configuración
**Ubicación:** `src/db/index.ts:11-13`

```typescript
const pool = new Pool({
  connectionString: env.DATABASE_URL,
})
```

**Problemas:**
- Sin `max` (default 10) → puede agotarse con pocos usuarios concurrentes
- Sin `idleTimeoutMillis` → conexiones zombie
- Sin `connectionTimeoutMillis` → requests colgados

**Solución:**
```typescript
const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 20, // conexiones máximas
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
})
```

---

### ⚠️ PROBLEMAS MENORES

- No hay compresión de respuestas (gzip/brotli)
- No hay HTTP caching headers
- Re-renders innecesarios en `NoteTable` (no memoizado)

---

## 3. Optimización para redes lentas

### ❌ PROBLEMAS CRÍTICOS

#### 3.1. Sin paginación = imposible en 3G
**Ubicación:** Todo el sistema

Con 100 notas de 5KB cada una = 500KB de transferencia. En 3G (1-2 Mbps) = 2-4 segundos solo de descarga.

**Impacto:** Usuarios en redes lentas abandonan la app.

**Solución:** Ver punto 2.1 (paginación obligatoria).

#### 3.2. No hay campos selectivos
**Ubicación:** `src/server/functions.ts`

Siempre traes todos los campos. Si solo necesitas `id` y `title` para un dropdown, traes `content` también.

**Solución:** Agregar parámetro `fields`:
```typescript
.inputValidator(z.object({
  fields: z.array(z.enum(['id', 'title', 'content', 'createdAt'])).optional(),
}))
```

#### 3.3. Sin manejo de timeouts
**Ubicación:** Cliente y servidor

- No hay timeout en queries de DB
- No hay timeout en requests HTTP
- Usuario espera indefinidamente

**Solución:**
```typescript
// En router.tsx
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      gcTime: 1000 * 60 * 10,
      refetchOnWindowFocus: false,
      retry: 3,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    },
  },
})
```

#### 3.4. Sin estrategia de reintentos
**Ubicación:** `src/routes/index.tsx:55-102`

Si falla la creación, el usuario tiene que reintentar manualmente.

**Solución:** Ya está parcialmente implementado con TanStack Query, pero falta configuración de retry (ver 3.3).

#### 3.5. Optimistic updates sin validación de red
**Ubicación:** `src/routes/index.tsx:59-82`

Los optimistic updates son buenos, pero:
- No detectas si estás offline
- No hay queue de operaciones pendientes
- Si falla, el rollback puede ser confuso

**Solución:** Agregar detección de conectividad y queue offline.

---

### ✅ COSAS BIEN HECHAS

- Uso de TanStack Query para caching ✅
- Optimistic updates implementados ✅
- SSR con pre-population de cache ✅

---

## 4. Backend & API design

### ❌ PROBLEMAS CRÍTICOS

#### 4.1. Sin autenticación/autorización
**Ubicación:** Todo el sistema

**Cualquiera puede:**
- Ver todas las notas de todos los usuarios
- Crear notas
- Eliminar cualquier nota

**Impacto:** **INACEPTABLE para producción.** Violación total de seguridad.

**Solución obligatoria:**
- JWT o session-based auth
- Middleware de autenticación en todas las server functions
- Autorización por recurso (solo puedes ver/editar tus notas)

#### 4.2. Validación solo client-side en algunos casos
**Ubicación:** `src/components/CreateNoteModal.tsx:52-60`

Validación con TanStack Form es buena, pero:
- Usuario puede hacer POST directo al endpoint sin validación
- No hay sanitización de HTML/XSS

**Impacto:** XSS attacks, inyección de código.

**Solución:**
```typescript
// Ya tienes Zod en el servidor ✅, pero falta sanitización:
import DOMPurify from 'isomorphic-dompurify'

content: z.string()
  .min(1)
  .transform((val) => DOMPurify.sanitize(val.trim())), // Sanitizar HTML
```

#### 4.3. Manejo de errores inconsistente
**Ubicación:** `src/server/functions.ts`

- `getNoteById` lanza `notFound()` ✅
- `deleteNote` lanza `notFound()` ✅
- Pero `getNotes` no maneja errores de DB
- `createNote` no valida duplicados ni constraints

**Impacto:** Errores de DB se propagan como 500 genéricos.

**Solución:** Wrapper de errores:
```typescript
async function handleDbError(error: unknown) {
  if (error instanceof PostgresError) {
    switch (error.code) {
      case '23505': // unique violation
        throw new ConflictError('Ya existe una nota con ese título')
      case '23503': // foreign key violation
        throw new BadRequestError('Referencia inválida')
      default:
        throw new DatabaseError('Error en base de datos', error)
    }
  }
  throw error
}
```

#### 4.4. Sin rate limiting
**Ubicación:** Ninguna

**Impacto:** Usuario puede hacer 1000 requests/segundo y saturar el servidor.

**Solución:** Implementar rate limiting (Upstash Redis, Vercel Edge Config, o middleware propio).

#### 4.5. Sin versionado de API
**Ubicación:** Rutas y server functions

Cuando cambies el contrato, rompes todos los clientes.

**Solución:** Versionar desde el inicio:
```typescript
export const createNote = createServerFn({ method: 'POST' })
  .withOptions({ version: 'v1' }) // o en la ruta
```

#### 4.6. Status codes inconsistentes
**Ubicación:** `src/server/functions.ts`

- `deleteNote` retorna `{ success: true }` pero debería ser 204 No Content
- Errores lanzan excepciones pero no siempre con status codes claros

**Solución:** Usar status codes HTTP correctos:
- 200 OK para GET con body
- 201 Created para POST exitoso
- 204 No Content para DELETE exitoso
- 400 Bad Request para validación
- 404 Not Found para recursos no encontrados
- 500 Internal Server Error solo para errores inesperados

---

### ⚠️ PROBLEMAS MENORES

- No hay CORS configurado (puede ser problema si agregas mobile app)
- No hay headers de seguridad (CSP, X-Frame-Options, etc.)

---

## 5. Base de datos

### ❌ PROBLEMAS CRÍTICOS

#### 5.1. Sin multi-tenant
**Ubicación:** `src/db/schema.ts`

No hay `userId` o `tenantId`. Todas las notas son globales.

**Impacto:** Imposible escalar a múltiples usuarios/organizaciones sin refactor masivo.

**Solución:**
```typescript
export const notes = pgTable('notes', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id), // ❗ Agregar
  tenantId: uuid('tenant_id').references(() => tenants.id).optional(), // Si necesitas orgs
  title: varchar('title', { length: 255 }).notNull(),
  content: text('content').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow(), // ❗ Falta
  deletedAt: timestamp('deleted_at'), // ❗ Soft delete
}, (table) => ({
  userIdIdx: index('notes_user_id_idx').on(table.userId),
  createdAtIdx: index('notes_created_at_idx').on(table.createdAt.desc()),
}))
```

#### 5.2. Sin soft deletes
**Ubicación:** `src/server/functions.ts:78-91`

`deleteNote` hace DELETE físico. Si necesitas auditoría o recuperación, estás jodido.

**Impacto:** Datos perdidos para siempre. Imposible cumplir GDPR "derecho al olvido" con recuperación.

**Solución:** Ver 5.1 (agregar `deletedAt`).

#### 5.3. Sin `updatedAt`
**Ubicación:** `src/db/schema.ts`

No sabes cuándo se modificó una nota por última vez.

**Impacto:** Imposible implementar "última modificación", sincronización, conflict resolution.

**Solución:** Ver 5.1.

#### 5.4. Queries ineficientes
**Ubicación:** `src/server/functions.ts`

- `getNotes()`: SELECT * sin WHERE, sin ORDER BY explícito
- `getNoteById()`: Bien, usa índice primario ✅
- `deleteNote()`: DELETE sin verificar ownership (si agregas multi-tenant)

**Solución:** Ver puntos anteriores (paginación, índices, WHERE por userId).

#### 5.5. Sin transacciones donde se necesitan
**Ubicación:** `src/server/functions.ts`

Aunque las operaciones son simples ahora, cuando agregues:
- Crear nota + enviar notificación
- Eliminar nota + eliminar attachments
- Actualizar contadores

Necesitarás transacciones. No está preparado.

**Solución:** Usar transacciones de Drizzle:
```typescript
await db.transaction(async (tx) => {
  const note = await tx.insert(notes).values({...}).returning()
  await tx.insert(notifications).values({ noteId: note[0].id })
})
```

#### 5.6. Sin migraciones versionadas en producción
**Ubicación:** `package.json:14-17`

Tienes `db:migrate` pero no veo estrategia de:
- Migraciones automáticas en deploy
- Rollback plan
- Migraciones en múltiples ambientes

**Impacto:** Deploy manual, riesgo de inconsistencias entre ambientes.

---

### ⚠️ RIESGOS FUTUROS

- Sin full-text search: cuando necesites buscar en `content`, será lento
- Sin relaciones: si agregas tags, categories, etc., será refactor grande
- Sin particionamiento: con millones de notas, queries lentas

---

## 6. Mantenibilidad y evolución

### ❌ PROBLEMAS CRÍTICOS

#### 6.1. Cero tests
**Ubicación:** Todo el proyecto

No hay tests unitarios, de integración, ni E2E.

**Impacto:** 
- Imposible refactorizar con confianza
- Bugs en producción
- Regresiones constantes

**Qué testear YA:**
1. **Server functions** (crítico):
   ```typescript
   // tests/server/functions.test.ts
   describe('getNotes', () => {
     it('debe retornar notas paginadas', async () => { ... })
     it('debe validar límite máximo', async () => { ... })
   })
   ```

2. **Validación Zod** (crítico):
   ```typescript
   describe('CreateNoteSchema', () => {
     it('debe rechazar título vacío', () => { ... })
     it('debe rechazar título > 255 chars', () => { ... })
   })
   ```

3. **Componentes críticos**:
   - `CreateNoteModal`: validación de formulario
   - `NoteTable`: renderizado de lista vacía, con datos

#### 6.2. Código duplicado sin extraer
**Ubicación:** `formatDate` en 2 lugares

Ya mencionado en 1.3, pero es síntoma de falta de utilities compartidas.

**Solución:** Crear `src/utils/` con funciones puras testeadas.

#### 6.3. Sin documentación de contratos
**Ubicación:** Server functions

No hay JSDoc, OpenAPI/Swagger, ni comentarios explicando:
- Qué hace cada función
- Qué parámetros espera
- Qué retorna
- Qué errores puede lanzar

**Impacto:** Nuevo desarrollador no entiende el sistema.

**Solución:**
```typescript
/**
 * Obtiene una lista paginada de notas.
 * 
 * @param data - Parámetros de paginación
 * @param data.page - Número de página (default: 1)
 * @param data.limit - Cantidad de resultados (default: 20, max: 100)
 * @returns Lista paginada de notas
 * @throws {ValidationError} Si los parámetros son inválidos
 * @throws {DatabaseError} Si hay error en la base de datos
 */
export const getNotes = createServerFn()...
```

#### 6.4. Acoplamiento fuerte con TanStack Start
**Ubicación:** Todo el código

Si TanStack Start cambia su API o encuentras un bug crítico, estás atado.

**Impacto:** Migración costosa si necesitas cambiar de stack.

**Mitigación:** Abstraer server functions detrás de una capa de servicios (ver 1.1).

---

### ⚠️ COMPLEJIDAD ACCIDENTAL

- Type casting innecesario en algunos lugares
- Uso de `as` en lugar de type guards
- Magic numbers (50 en `getContentPreview`, 255 en validación)

---

### ✅ CONSISTENCIA Y LEGIBILIDAD

- Código TypeScript bien tipado ✅
- Uso consistente de componentes shadcn ✅
- Estructura de carpetas clara ✅
- Nombres descriptivos ✅

---

## 7. Conclusión ejecutiva

### Top 5 problemas más graves

1. **🔴 Sin autenticación/autorización** → Inaceptable para producción. Cualquiera puede ver/eliminar todas las notas.
2. **🔴 `getNotes()` sin paginación** → Sistema colapsa con 10k+ notas. Imposible en redes lentas.
3. **🔴 Sin multi-tenant** → Refactor masivo necesario para escalar a múltiples usuarios.
4. **🔴 Cero tests** → Imposible refactorizar o agregar features sin romper cosas.
5. **🔴 Sin separación de capas** → Todo mezclado en `functions.ts`. Imposible mantener.

### Qué arreglaría antes de lanzar a producción

**CRÍTICO (bloquea lanzamiento):**
1. Autenticación/autorización completa
2. Paginación en `getNotes()`
3. Índices en base de datos (`createdAt`, `userId` cuando lo agregues)
4. Límite de tamaño de `content` (100KB max)
5. Tests básicos de server functions y validación
6. Manejo de errores estructurado con logging
7. Rate limiting básico

**IMPORTANTE (arreglar en primer mes):**
8. Multi-tenant o al menos `userId` en schema
9. Soft deletes
10. Campos selectivos en queries
11. Timeouts y retry logic
12. Sanitización de HTML/XSS
13. Extraer `formatDate` y otras utilities

**NICE TO HAVE (primer trimestre):**
14. Documentación de API (OpenAPI)
15. Monitoring y alerting (Sentry, DataDog)
16. Caching estratégico (Redis para queries frecuentes)
17. Full-text search (PostgreSQL tsvector)

### Qué decisiones fueron buenas

1. **✅ TanStack Query + SSR** → Excelente para UX y performance. Bien implementado.
2. **✅ Zod para validación** → Type-safe, bien usado en servidor.
3. **✅ Optimistic updates** → Buena UX, bien implementado con rollback.
4. **✅ Drizzle ORM** → Mejor que Prisma para control y performance.
5. **✅ TypeScript estricto** → Código bien tipado, reduce bugs.
6. **✅ shadcn/ui** → Componentes consistentes y accesibles.

### Si este POC es una base sólida para un SaaS

**Respuesta: NO, pero puede serlo con trabajo.**

**Por qué NO ahora:**
- Sin autenticación = no es un SaaS, es un juguete
- Sin paginación = no escala
- Sin tests = deuda técnica inaceptable
- Sin separación de capas = imposible mantener

**Por qué SÍ puede serlo:**
- Stack moderno y bien elegido (TanStack, Drizzle, TypeScript)
- Fundamentos correctos (validación, tipos, SSR)
- Código limpio y legible
- Arquitectura simple que permite crecer

**Qué falta para que sea sólido:**
1. **2-3 semanas de trabajo** en los puntos críticos mencionados
2. **Tests** (cobertura mínima 60-70% en lógica de negocio)
3. **Refactor** de `functions.ts` a capas (services, repositories)
4. **Autenticación** completa (JWT + middleware)
5. **Paginación** y optimizaciones de queries

**Veredicto:** Es un buen POC técnico, pero necesita trabajo arquitectónico serio antes de producción. Con las correcciones críticas, puede ser base sólida.

---

### Qué partes necesitan tests ya

1. **Server functions** (prioridad máxima):
   - `getNotes()`: paginación, límites, ordenamiento
   - `getNoteById()`: validación UUID, not found
   - `createNote()`: validación, sanitización, constraints
   - `deleteNote()`: validación, not found

2. **Validación Zod**:
   - Todos los schemas con casos edge (empty, max length, invalid types)

3. **Componentes críticos**:
   - `CreateNoteModal`: validación de formulario, submit, errores
   - Optimistic updates: rollback en error

### Dónde se volverá frágil en 6 meses

1. **`src/server/functions.ts`** → Archivo monolítico. Cualquier cambio afecta todo.
2. **Schema sin `userId`** → Refactor masivo cuando agregues usuarios.
3. **Queries sin índices** → Performance degradará gradualmente.
4. **Sin tests** → Regresiones silenciosas en cada feature nueva.
5. **Código duplicado** → Inconsistencias crecerán (ya hay `formatDate` duplicado).

### Este código lo puede mantener otro equipo

**Respuesta: PARCIALMENTE.**

**Sí, porque:**
- Código legible y bien tipado
- Stack moderno y documentado
- Estructura de carpetas clara

**No, porque:**
- Sin documentación de contratos API
- Sin tests que sirvan como documentación ejecutable
- Sin separación de capas (todo mezclado)
- Sin comentarios explicando decisiones de negocio

**Para que otro equipo lo mantenga:**
- Agregar tests (documentación ejecutable)
- Documentar server functions con JSDoc
- Refactor a capas (más fácil de entender)
- README con arquitectura y decisiones

---

## Facilidad para agregar features sin romper todo

**Actual: 3/10**

**Problemas:**
- Todo en `functions.ts` → cambios afectan múltiples features
- Sin tests → no sabes si rompiste algo
- Validación mezclada con lógica → difícil agregar reglas nuevas

**Con refactor a capas: 7/10**
- Services separados por dominio
- Repositories aislados
- Tests que validan contratos

---

## Complejidad accidental

**Nivel: BAJO** ✅

El código es simple y directo. No hay over-engineering. El problema es falta de estructura, no complejidad innecesaria.

---

## Consistencia de estilos

**Nivel: ALTO** ✅

- TypeScript consistente
- Componentes shadcn consistentes
- Nombres descriptivos
- Formato de código uniforme (Biome)

---

## Legibilidad del código

**Nivel: ALTA** ✅

Código limpio, bien nombrado, fácil de entender. El problema no es legibilidad, es **arquitectura y escalabilidad**.

---

**Fin de la review.**
