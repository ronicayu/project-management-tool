import app from '../server/dist/index.js'

export default function handler(req: import('http').IncomingMessage, res: import('http').ServerResponse) {
  return app(req, res)
}
