import { config } from 'dotenv'
import { defineConfig } from 'drizzle-kit'

// Cargar variables de entorno desde .env
config()

// Validar que DATABASE_URL esté configurado
const databaseUrl = process.env.DATABASE_URL

if (!databaseUrl) {
  throw new Error(
    'DATABASE_URL no está configurado. Por favor, agrega DATABASE_URL a tu archivo .env\n' +
    'Ejemplo: DATABASE_URL=postgresql://usuario:contraseña@localhost:5432/nombre_base_datos'
  )
}

export default defineConfig({
  out: './drizzle',
  schema: './src/db/schema.ts',
  dialect: 'postgresql',
  dbCredentials: {
    url: databaseUrl,
  },
})
