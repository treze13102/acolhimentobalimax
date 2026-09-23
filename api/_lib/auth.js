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

const cache = new Map(); // token -> { usuario, ate }
const VALIDADE_CACHE = 30_000;

function tokenDe(req) {
  const bruto = req.headers.authorization || '';
  return bruto.startsWith('Bearer ') ? bruto.slice(7).trim() : '';
}

/** Retorna o usuário autenticado e ativo, ou null. Não lança. */
export async function usuarioAtual(req) {
  const token = tokenDe(req);
  if (!token) return null;

  const emCache = cache.get(token);
  if (emCache && emCache.ate > Date.now()) return emCache.usuario;

  const { data, error } = await bd.auth.getUser(token);
  if (error || !data?.user) return null;

  const { data: perfil } = await bd
    .from('perfis')
    .select('id, nome, email, papel, ativo, trocar_senha')
    .eq('id', data.user.id)
    .maybeSingle();

  // Sem perfil, ou desativado, não entra — mesmo com token válido.
  // É assim que a desativação corta o acesso antes do token expirar.
  if (!perfil || !perfil.ativo) {
    cache.delete(token);
    return null;
  }

  const usuario = {
    id: perfil.id,
    nome: perfil.nome,
    email: perfil.email,
    papel: perfil.papel,
    trocar_senha: perfil.trocar_senha,
  };
  cache.set(token, { usuario, ate: Date.now() + VALIDADE_CACHE });
  if (cache.size > 200) cache.clear();
  return usuario;
}

/** Exige sessão válida; com `papel`, exige também aquele perfil. */
export async function exigirLogin(req, { papel = null } = {}) {
  const usuario = await usuarioAtual(req);
  if (!usuario) throw new ErroHttp(401, 'Sessão expirada. Entre novamente.');

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
