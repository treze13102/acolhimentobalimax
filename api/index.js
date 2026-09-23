import { rotas } from './_lib/rotas.js';
import { json, cabecalhosSeguranca, ErroHttp } from './_lib/http.js';

/**
 * Função única que atende todo o /api.
 * O vercel.json redireciona /api/* para cá, então temos um só ponto de
 * entrada (e um só cold start) em vez de uma função por rota.
 */
export default async function handler(req, res) {
  cabecalhosSeguranca(res);

  let url;
  try {
    url = new URL(req.url, `https://${req.headers.host || 'localhost'}`);
  } catch {
    return json(res, 400, { erro: 'Requisição inválida.' });
  }

  try {
    if (await rotas.resolver(req, res, url)) return;
    json(res, 404, { erro: 'Recurso não encontrado.' });
  } catch (erro) {
    if (erro instanceof ErroHttp) return json(res, erro.status, { erro: erro.message });
    // Nunca devolve stack ao cliente: pode conter trecho de dado sensível.
    console.error('[erro]', erro);
    json(res, 500, { erro: 'Erro interno. Tente novamente ou procure o RH.' });
  }
}
