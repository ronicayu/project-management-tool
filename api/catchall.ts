import app from '../server/dist/index.js'
import { IncomingMessage, ServerResponse } from 'http'
import { URL } from 'url'

export default function handler(req: IncomingMessage, res: ServerResponse) {
  // Restore original path so Express can route: rewrite sends /api/catchall?path=projects/.../tasks
  const rawUrl = (req as IncomingMessage & { url?: string }).url ?? ''
  const parsed = new URL(rawUrl, 'http://localhost')
  const pathRest = parsed.searchParams.get('path')
  if (pathRest != null && pathRest !== '') {
    ;(req as IncomingMessage & { url?: string }).url = '/api/' + pathRest
  }
  // #region agent log
  const url = (req as IncomingMessage & { url?: string }).url ?? rawUrl
  const method = (req as IncomingMessage & { method?: string }).method ?? ''
  fetch('http://127.0.0.1:7243/ingest/f9550900-7055-4472-bd96-cec2f709fba9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'api/catchall.ts:handler',message:'Vercel handler received',data:{url,method},timestamp:Date.now(),hypothesisId:'H1,H2,H3,H5'})}).catch(()=>{});
  // #endregion
  return app(req, res)
}
