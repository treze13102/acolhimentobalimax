/**
 * Servidor local de desenvolvimento.
 * Serve /public e entrega /api para a mesma função usada na Vercel,
 * para que o comportamento local e o de produção sejam o mesmo código.
 *
 *   npm run dev   ->  http://localhost:3100
 */
import { createServer } from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { join, normalize, extname } from 'node:path';
import handler from './api/index.js';
import { RAIZ } from './api/_lib/config.js';

const PORTA = Number(process.env.PORTA || 3100);
const PUBLICO = join(RAIZ, 'public');

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
};

function resolverArquivo(caminho) {
  let relativo = caminho;
  if (relativo === '' || relativo.endsWith('/')) relativo += 'index.html';
  const alvo = normalize(join(PUBLICO, relativo));
  if (!alvo.startsWith(PUBLICO)) return null; // impede sair da pasta com ".."
  try {
    return statSync(alvo).isFile() ? alvo : null;
  } catch {
    return null;
  }
}

createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (url.pathname.startsWith('/api/')) return handler(req, res);

  const arquivo = resolverArquivo(decodeURIComponent(url.pathname));
  if (arquivo) {
    const tipo = TIPOS[extname(arquivo).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': tipo, 'Cache-Control': 'no-store' });
    return createReadStream(arquivo).pipe(res);
  }

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Página não encontrada.');
}).listen(PORTA, () => {
  console.log(`\nCanal de Acolhimento (desenvolvimento)`);
  console.log(`  Formulário: http://localhost:${PORTA}/`);
  console.log(`  Painel:     http://localhost:${PORTA}/painel/\n`);
});
