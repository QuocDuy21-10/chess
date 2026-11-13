import { defineConfig } from 'drizzle-kit';

// `npm run db:generate` writes a migration into drizzle/ from the changes to src/schema.ts.
export default defineConfig({ dialect: 'postgresql', schema: './src/schema.ts', out: './drizzle' });
