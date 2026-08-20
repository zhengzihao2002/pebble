import { config } from 'dotenv';
config({ path: '.env.local' });

import type { Config } from 'drizzle-kit';

export default {
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  schemaFilter: ['public', 'neon_auth'],
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
} satisfies Config;
