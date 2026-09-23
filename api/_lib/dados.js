import { createClient } from '@supabase/supabase-js';
import { config } from './config.js';
import { ErroHttp } from './http.js';

/**
 * Cliente com service_role: ignora RLS. Só existe no servidor.
 * Nunca exponha esta chave ao navegador — ela lê tudo.
 */
export const bd = createClient(config.supabaseUrl, config.supabaseService, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { headers: { 'X-Cliente': 'canal-acolhimento' } },
});

/** Converte erro do PostgREST em ErroHttp, sem vazar detalhe interno. */
export function conferir(resposta, contexto) {
  if (resposta.error) {
    console.error(`[banco:${contexto}]`, resposta.error.message);
    throw new ErroHttp(500, 'Não foi possível concluir a operação. Tente novamente.');
  }
  return resposta.data;
}

/** Trilha de auditoria. Falha aqui não pode derrubar a operação principal. */
export async function auditar({ usuarioId = null, acao, registroId = null, detalhe = null, ipHash = null }) {
  const { error } = await bd
    .from('auditoria')
    .insert({ usuario_id: usuarioId, acao, registro_id: registroId, detalhe, ip_hash: ipHash });
  if (error) console.error('[auditoria]', error.message);
}

/**
 * Limite de requisições por chave, contado no banco.
 * Em ambiente sem servidor não há memória compartilhada entre instâncias.
 */
export async function limitar(chave, maximo, segundos) {
  const { data, error } = await bd.rpc('consumir_limite', {
    p_chave: chave,
    p_max: maximo,
    p_segundos: segundos,
  });
  if (error) {
    // Se o contador falhar, deixamos passar: barrar quem precisa de ajuda
    // é pior do que aceitar um envio a mais.
    console.error('[limite]', error.message);
    return true;
  }
  return data === true;
}
