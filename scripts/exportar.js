/**
 * Cópia de segurança dos registros, gravada fora do Supabase.
 *
 *   npm run exportar            -> backup/canal-AAAA-MM-DD-HHMM.json (cifrado)
 *   npm run exportar -- --claro -> conteúdo legível, para leitura humana
 *
 * O arquivo padrão sai CIFRADO, do mesmo jeito que está no banco: sem a
 * APP_KEY ninguém lê. Guarde a chave em local separado do arquivo.
 *
 * Use "--claro" apenas quando precisar ler de fato o conteúdo, e trate o
 * arquivo resultante como documento confidencial: ele contém relatos de
 * saúde mental em texto aberto.
 *
 * Este script SÓ LÊ. Nada aqui apaga ou altera dado algum.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { bd } from '../api/_lib/dados.js';
import { decifrar } from '../api/_lib/cripto.js';
import { RAIZ } from '../api/_lib/config.js';

const claro = process.argv.includes('--claro');

const pasta = join(RAIZ, 'backup');
mkdirSync(pasta, { recursive: true });

async function tudo(tabela) {
  const linhas = [];
  const porPagina = 1000;
  for (let pagina = 0; ; pagina++) {
    const { data, error } = await bd
      .from(tabela)
      .select('*')
      .order('id')
      .range(pagina * porPagina, (pagina + 1) * porPagina - 1);
    if (error) {
      console.error(`[ERRO] ${tabela}: ${error.message}`);
      process.exit(1);
    }
    linhas.push(...data);
    if (data.length < porPagina) break;
  }
  return linhas;
}

const registros = await tudo('registros');
const notas = await tudo('notas');
const auditoria = await tudo('auditoria');
const perfis = await tudo('perfis');

const CIFRADOS_REGISTRO = ['nome', 'setor', 'motivo_outro', 'relato', 'envolvido', 'telefone', 'email'];

const conteudo = {
  exportado_em: new Date().toISOString(),
  formato: claro ? 'texto aberto — CONFIDENCIAL' : 'cifrado (AES-256-GCM), precisa da APP_KEY',
  totais: {
    registros: registros.length,
    notas: notas.length,
    auditoria: auditoria.length,
    perfis: perfis.length,
  },
  registros: claro
    ? registros.map((r) => {
        const copia = { ...r };
        for (const campo of CIFRADOS_REGISTRO) copia[campo] = decifrar(r[campo]);
        return copia;
      })
    : registros,
  notas: claro ? notas.map((n) => ({ ...n, texto: decifrar(n.texto) })) : notas,
  auditoria,
  perfis,
};

const carimbo = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
const arquivo = join(pasta, `canal-${carimbo}${claro ? '-LEGIVEL' : ''}.json`);
writeFileSync(arquivo, JSON.stringify(conteudo, null, 2), 'utf8');

console.log(`\nExportado para:\n  ${arquivo}\n`);
console.log(`  registros: ${registros.length}`);
console.log(`  notas:     ${notas.length}`);
console.log(`  auditoria: ${auditoria.length}`);
console.log(`  perfis:    ${perfis.length}\n`);
if (claro) {
  console.log('  ATENCAO: este arquivo contem relatos em texto aberto.');
  console.log('  Guarde em local restrito e apague quando nao precisar mais.\n');
} else {
  console.log('  O arquivo esta cifrado. Guarde a APP_KEY em local separado dele.\n');
}
