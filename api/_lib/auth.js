import { bd } from './dados.js';
import { ErroHttp } from './http.js';

/**
 * Autenticação: Supabase Auth.
 * O navegador faz login direto no endpoint de auth do Supabase e guarda o
 * access_token. Cada chamada ao nosso /api manda "Authorization: Bearer".
 * Aqui validamos o token e buscamos o papel na tabela perfis.
 *
 * Como o token vai num cabeçalho (e não num cookie), não existe superfície
 * de CSRF: um site de terceiros não consegue anexá-lo à requisição.
 */

/**
 * Cache apenas da validação do token (chamada de rede ao Supabase Auth).
 * O PERFIL NUNCA entra aqui: ele carrega `ativo` e `papel`, e guardá-lo faria
 * a desativação de alguém demorar até o cache vencer. Quem é afastado da
 * equipe precisa perder o acesso aos relatos na requisição seguinte, não
 * meio minuto depois.
 */
const cacheToken = new Map(); // token -> { usuarioId, ate }
const VALIDADE_CACHE = 30_000;

function tokenDe(req) {
  const bruto = req.headers.authorization || '';
  return bruto.startsWith('Bearer ') ? bruto.slice(7).trim() : '';
}

/**
 * Autentica e diz o motivo quando recusa.
 * Distinguir "sem perfil" de "token inválido" importa: criar a conta direto no
 * painel do Supabase cria o login mas não o perfil, e sem essa distinção a
 * pessoa recebia "sessão expirada" — mensagem que manda investigar o lado errado.
 */
export async function autenticarRequisicao(req) {
  const token = tokenDe(req);
  if (!token) return { usuario: null, motivo: 'sem_token' };

  let usuarioId;
  const emCache = cacheToken.get(token);

  if (emCache && emCache.ate > Date.now()) {
    usuarioId = emCache.usuarioId;
  } else {
    const { data, error } = await bd.auth.getUser(token);
    if (error || !data?.user) {
      cacheToken.delete(token);
      return { usuario: null, motivo: 'token_invalido' };
    }
    usuarioId = data.user.id;
    if (cacheToken.size > 200) cacheToken.clear();
    cacheToken.set(token, { usuarioId, ate: Date.now() + VALIDADE_CACHE });
  }

  // Leitura sempre fresca: é o que faz a desativação valer imediatamente.
  const { data: perfil } = await bd
    .from('perfis')
    .select('id, nome, email, papel, ativo, trocar_senha')
    .eq('id', usuarioId)
    .maybeSingle();

  // Sem perfil, ou desativado, não entra — mesmo com token ainda válido.
  if (!perfil) {
    cacheToken.delete(token);
    return { usuario: null, motivo: 'sem_perfil' };
  }
  if (!perfil.ativo) {
    cacheToken.delete(token);
    return { usuario: null, motivo: 'desativado' };
  }

  return {
    usuario: {
      id: perfil.id,
      nome: perfil.nome,
      email: perfil.email,
      papel: perfil.papel,
      trocar_senha: perfil.trocar_senha,
    },
    motivo: null,
  };
}

export const MENSAGENS_AUTH = {
  sem_token: 'Sessão expirada. Entre novamente.',
  token_invalido: 'Sessão expirada. Entre novamente.',
  desativado: 'Seu acesso ao painel foi desativado. Procure o administrador.',
  sem_perfil:
    'Sua conta existe, mas ainda não tem acesso ao painel. ' +
    'Peça a um administrador para criar seu acesso em Equipe › Adicionar. ' +
    'Contas criadas direto no Supabase não recebem acesso automaticamente.',
};

/** Retorna o usuário autenticado e ativo, ou null. Não lança. */
export async function usuarioAtual(req) {
  const { usuario } = await autenticarRequisicao(req);
  return usuario;
}

/** Exige sessão válida; com `papel`, exige também aquele perfil. */
export async function exigirLogin(req, { papel = null } = {}) {
  const { usuario, motivo } = await autenticarRequisicao(req);
  if (!usuario) {
    // 403 quando a identidade é válida mas falta autorização: o navegador não
    // deve tratar como "faça login de novo", porque logar de novo não resolve.
    const status = motivo === 'sem_perfil' || motivo === 'desativado' ? 403 : 401;
    throw new ErroHttp(status, MENSAGENS_AUTH[motivo] || MENSAGENS_AUTH.sem_token);
  }

  // Com senha provisória o painel fica bloqueado até a troca. É um empurrão
  // de processo, não uma barreira de segurança: quem já está autenticado
  // poderia contornar. Serve para a senha entregue em mão não virar permanente.
  if (usuario.trocar_senha) {
    throw new ErroHttp(428, 'Troque sua senha provisória para continuar.');
  }
  if (papel && usuario.papel !== papel) {
    throw new ErroHttp(403, 'Você não tem permissão para esta ação.');
  }
  return usuario;
}

/** Marca a troca como feita. Chamado pelo painel após atualizar a senha. */
export async function marcarSenhaTrocada(usuarioId) {
  const { error } = await bd.from('perfis').update({ trocar_senha: false }).eq('id', usuarioId);
  if (error) console.error('[trocar_senha]', error.message);
}

export async function registrarAcesso(usuarioId) {
  const { error } = await bd
    .from('perfis')
    .update({ ultimo_acesso: new Date().toISOString() })
    .eq('id', usuarioId);
  if (error) console.error('[ultimo_acesso]', error.message);
}
