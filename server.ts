/**
 * Root entry for Vercel: export the Express app so Vercel runs it as a single serverless function.
 * Requires server to be built first (server/dist/index.js).
 */
import app from './server/dist/index.js'
export default app
