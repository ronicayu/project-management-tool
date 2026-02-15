import app from '../server/dist/index.js'

export default function handler(req: import('http').IncomingMessage, res: import('http').ServerResponse) {
  // #region agent log
  const url = (req as import('http').IncomingMessage & { url?: string }).url ?? '';
  const method = (req as import('http').IncomingMessage & { method?: string }).method ?? '';
  fetch('http://127.0.0.1:7243/ingest/f9550900-7055-4472-bd96-cec2f709fba9',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'api/[[...path]].ts:handler',message:'Vercel handler received',data:{url,method},timestamp:Date.now(),hypothesisId:'H1,H2,H3,H5'})}).catch(()=>{});
  // #endregion
  return app(req, res)
}
