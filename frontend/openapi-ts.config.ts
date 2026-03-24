import { defineConfig } from '@hey-api/openapi-ts';

export default defineConfig({
  // Source: FastAPI OpenAPI spec (run backend first)
  input: process.env.NEXT_PUBLIC_API_URL
    ? `${process.env.NEXT_PUBLIC_API_URL}/openapi.json`
    : 'http://localhost:8000/openapi.json',

  // Output: generated types + client
  output: {
    path: 'types/api',
    format: 'prettier',
    lint: 'eslint',
  },

  // Use the fetch-based client (no axios dependency)
  client: '@hey-api/client-fetch',

  // Generate: TypeScript types + typed API functions
  plugins: [
    '@hey-api/typescript',
    '@hey-api/sdk',
  ],
});

// ─── Usage ─────────────────────────────────────────────────────────────────────
// Run after any backend change:
//   pnpm openapi-ts
//
// This generates:
//   types/api/types.gen.ts   ← all Pydantic model types
//   types/api/sdk.gen.ts     ← typed API call functions
//   types/api/client.gen.ts  ← HTTP client config
//
// Then import in lib/api/<domain>.ts:
//   import type { ContactResponse } from '@/types/api';
