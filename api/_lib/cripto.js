import { randomBytes, createCipheriv, createDecipheriv, createHash } from 'node:crypto';
import { config } from './config.js';

/**
 * Criptografia dos campos sensíveis (AES-256-GCM), feita na aplicação.
 *
 * Isto é o que separa "o Supabase guarda nossos relatos" de "o Supabase
 * guarda bytes sem significado". Um vazamento do banco, um backup perdido
 * ou um acesso de suporte não expõem nada: a APP_KEY só existe nas
 * variáveis de ambiente da Vercel.
 *
 * Senhas não aparecem mais aqui — quem cuida delas é o Supabase Auth.
 */

const CHAVE = (() => {
  const bruto = Buffer.from(config.chave || '', 'base64');
  if (bruto.length !== 32) {
    console.error('[ERRO] APP_KEY deve ter 32 bytes em base64. Gere com: npm run chave');
    if (!process.env.VERCEL) process.exit(1);
    return Buffer.alloc(32); // evita derrubar a função; as rotas falharão de forma controlada
  }
  return bruto;
})();

export function cifrar(texto) {
  if (texto === null || texto === undefined || texto === '') return null;
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', CHAVE, iv);
  const dados = Buffer.concat([cipher.update(String(texto), 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), dados]).toString('base64');
}

export function decifrar(guardado) {
  if (!guardado) return '';
  try {
    const bruto = Buffer.from(guardado, 'base64');
    const iv = bruto.subarray(0, 12);
    const tag = bruto.subarray(12, 28);
    const decipher = createDecipheriv('aes-256-gcm', CHAVE, iv);
    decipher.setAuthTag(tag);
    return decipher.update(bruto.subarray(28)) + decipher.final('utf8');
  } catch {
    return '[conteúdo ilegível: chave incorreta ou dado corrompido]';
  }
}

// Alfabeto sem caracteres ambíguos (0/O, 1/I/L) para ditar por telefone.
const ALFABETO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function gerarProtocolo() {
  const bytes = randomBytes(8);
  let saida = '';
  for (let i = 0; i < 8; i++) {
    if (i === 4) saida += '-';
    saida += ALFABETO[bytes[i] % ALFABETO.length];
  }
  return `BLX-${saida}`;
}

/** Guarda apenas a impressão do IP, nunca o IP em claro. */
export function hashIp(ip) {
  return createHash('sha256').update(String(ip) + config.chave).digest('base64').slice(0, 22);
}

/** Senha provisória legível para entregar pessoalmente. */
export function senhaProvisoria() {
  return gerarProtocolo().replace(/-/g, '') + 'a1';
}
