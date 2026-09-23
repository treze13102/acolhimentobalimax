import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const RAIZ = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

// Em desenvolvimento lemos .env.local; na Vercel as variáveis já vêm do ambiente.
function carregarEnv() {
  for (const nome of ['.env.local', '.env']) {
    const arquivo = join(RAIZ, nome);
    if (!existsSync(arquivo)) continue;
    for (const linha of readFileSync(arquivo, 'utf8').split(/\r?\n/)) {
      const limpa = linha.trim();
      if (!limpa || limpa.startsWith('#')) continue;
      const i = limpa.indexOf('=');
      if (i === -1) continue;
      const chave = limpa.slice(0, i).trim();
      let valor = limpa.slice(i + 1).trim();
      if (
        (valor.startsWith('"') && valor.endsWith('"')) ||
        (valor.startsWith("'") && valor.endsWith("'"))
      ) {
        valor = valor.slice(1, -1);
      }
      if (process.env[chave] === undefined) process.env[chave] = valor;
    }
  }
}

if (!process.env.VERCEL) carregarEnv();

export const config = {
  supabaseUrl: process.env.SUPABASE_URL || '',
  supabaseAnon: process.env.SUPABASE_ANON_KEY || '',
  supabaseService: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  chave: process.env.APP_KEY || '',
  empresa: process.env.EMPRESA || 'Balimax Engenharia',
  // Em produção a Vercel serve tudo por HTTPS; local roda em http.
  producao: Boolean(process.env.VERCEL),
};

const faltando = [
  ['SUPABASE_URL', config.supabaseUrl],
  ['SUPABASE_ANON_KEY', config.supabaseAnon],
  ['SUPABASE_SERVICE_ROLE_KEY', config.supabaseService],
  ['APP_KEY', config.chave],
].filter(([, valor]) => !valor);

if (faltando.length) {
  const nomes = faltando.map(([nome]) => nome).join(', ');
  console.error(
    `\n[ERRO] Variáveis de ambiente ausentes: ${nomes}\n` +
      'Local: copie .env.example para .env.local e preencha.\n' +
      'Vercel: Project Settings > Environment Variables.\n' +
      'Gere a APP_KEY com: npm run chave\n'
  );
  if (!process.env.VERCEL) process.exit(1);
}
