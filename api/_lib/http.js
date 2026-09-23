import { config } from './config.js';
import { hashIp } from './cripto.js';

export const LIMITE_CORPO = 256 * 1024; // 256 KB

export class ErroHttp extends Error {
  constructor(status, mensagem) {
    super(mensagem);
    this.status = status;
  }
}

export function ipDe(req) {
  // Atrás da Vercel o IP real vem no x-forwarded-for.
  const encaminhado = req.headers['x-forwarded-for'];
  if (typeof encaminhado === 'string' && encaminhado) return encaminhado.split(',')[0].trim();
  return req.socket?.remoteAddress || 'desconhecido';
}

export function ipHashDe(req) {
  return hashIp(ipDe(req));
}

export async function lerJson(req) {
  // Na Vercel o corpo já pode vir interpretado.
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try {
      return req.body ? JSON.parse(req.body) : {};
    } catch {
      throw new ErroHttp(400, 'JSON inválido.');
    }
  }

  const partes = [];
  let tamanho = 0;
  for await (const parte of req) {
    tamanho += parte.length;
    if (tamanho > LIMITE_CORPO) throw new ErroHttp(413, 'Conteúdo muito grande.');
    partes.push(parte);
  }
  if (!partes.length) return {};
  const bruto = Buffer.concat(partes);

  // Bytes que não sejam UTF-8 válido viram U+FFFD e fariam uma resposta
  // acentuada deixar de casar com a lista, sem erro visível. Melhor recusar
  // do que gravar um registro incompleto.
  const texto = bruto.toString('utf8');
  if (!Buffer.from(texto, 'utf8').equals(bruto)) {
    throw new ErroHttp(400, 'O conteúdo enviado não está em UTF-8. Recarregue a página e tente de novo.');
  }

  try {
    return JSON.parse(texto);
  } catch {
    throw new ErroHttp(400, 'JSON inválido.');
  }
}

export function json(res, status, corpo) {
  const texto = JSON.stringify(corpo);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(texto),
    'Cache-Control': 'no-store',
  });
  res.end(texto);
}

/** Origem do Supabase, para liberar no connect-src da CSP. */
export function origemSupabase() {
  try {
    return new URL(config.supabaseUrl).origin;
  } catch {
    return '';
  }
}

export function cabecalhosSeguranca(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'geolocation=(), camera=(), microphone=()');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; " +
      `connect-src 'self' ${origemSupabase()}; ` +
      "form-action 'self'; frame-ancestors 'none'; base-uri 'none'; object-src 'none'"
  );
  if (config.producao) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
}

/* ----------------------------------------------------------------- roteador */

export function criarRoteador() {
  const rotas = [];
  const registrar = (metodo) => (padrao, tratador) => {
    const nomes = [];
    const regex = new RegExp(
      '^' +
        padrao.replace(/:([A-Za-z_]+)/g, (_, nome) => {
          nomes.push(nome);
          return '([^/]+)';
        }) +
        '$'
    );
    rotas.push({ metodo, regex, nomes, tratador });
  };

  return {
    get: registrar('GET'),
    post: registrar('POST'),
    patch: registrar('PATCH'),
    delete: registrar('DELETE'),
    async resolver(req, res, url) {
      for (const rota of rotas) {
        if (rota.metodo !== req.method) continue;
        const achado = rota.regex.exec(url.pathname);
        if (!achado) continue;
        const params = {};
        rota.nomes.forEach((nome, i) => (params[nome] = decodeURIComponent(achado[i + 1])));
        await rota.tratador(req, res, { params, url });
        return true;
      }
      return false;
    },
  };
}
