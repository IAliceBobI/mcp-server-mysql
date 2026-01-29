import { defineConfig } from 'vitest/config';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables before tests
dotenv.config({ path: path.resolve(__dirname, '.env.test') });

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: [],
  },
});
