import { bd, conferir, auditar, limitar } from './dados.js';
import { cifrar, decifrar, gerarProtocolo, senhaProvisoria } from './cripto.js';
import { criarRoteador, json, lerJson, ErroHttp, ipHashDe, ipDe } from './http.js';
import { exigirLogin, usuarioAtual, registrarAcesso, marcarSenhaTrocada } from './auth.js';
import { config } from './config.js';
import {
  MOTIVOS,
  MOTIVOS_CRITICOS,
  MOTIVOS_GRAVES,
  STATUS,
  PRIORIDADES,
  calcularPrioridade,
} from './dominio.js';

export const rotas = criarRoteador();

const nfc = (v) => String(v ?? '').normalize('NFC');
const texto = (v, max = 2000) => nfc(v).trim().slice(0, max) || null;

const umaDe = (v, lista, campo) => {
  const limpo = nfc(v).trim();
  if (!limpo) return null;
  if (!lista.includes(limpo)) {
    throw new ErroHttp(400, `Resposta não reconhecida em "${campo}". Recarregue a página e tente de novo.`);
  }
  return limpo;
};

/* ==================================================================
   CONFIGURAÇÃO DO CLIENTE
================================================================== */

// O navegador precisa da URL e da chave anônima para falar com o Supabase Auth.
// A chave anon é pública por definição e, com o RLS fechado, não lê dado algum.
rotas.get('/api/config', (req, res) => {
  json(res, 200, {
    supabaseUrl: config.supabaseUrl,
    supabaseAnonKey: config.supabaseAnon,
    empresa: config.empresa,
  });
});

/* ==================================================================
   PÚBLICO
================================================================== */

rotas.get('/api/motivos', (req, res) => {
  json(res, 200, {
    motivos: MOTIVOS,
    criticos: [...MOTIVOS_CRITICOS],
    graves: [...MOTIVOS_GRAVES],
    empresa: config.empresa,
  });
});

rotas.post('/api/registros', async (req, res) => {
  if (!(await limitar(`envio:${ipDe(req)}`, 5, 600))) {
    throw new ErroHttp(429, 'Muitos envios deste dispositivo. Aguarde alguns minutos ou ligue 188.');
  }

  const corpo = await lerJson(req);

  const enviados = Array.isArray(corpo.motivos) ? corpo.motivos.map(nfc) : [];
  const motivos = [...new Set(enviados.filter((m) => MOTIVOS.includes(m)))];
  if (motivos.length !== new Set(enviados).size) {
    throw new ErroHttp(400, 'Um dos motivos enviados não foi reconhecido. Recarregue a página e tente de novo.');
  }
  const relato = texto(corpo.relato, 20000);

  if (!motivos.length && !relato) {
    throw new ErroHttp(400, 'Selecione ao menos um motivo ou escreva o que está acontecendo.');
  }

  const anonimo = corpo.identificar !== 'Sim';
  const imediato = umaDe(corpo.imediato, ['Sim', 'Não', 'Não tenho certeza'], 'acolhimento imediato');
  const envolve = umaDe(corpo.envolve, ['Sim', 'Não', 'Prefiro não informar'], 'envolve outra pessoa');
  const querContato = umaDe(corpo.contato, ['Sim', 'Não'], 'deseja contato');
  const prioridade = calcularPrioridade(motivos, imediato);
  const protocolo = gerarProtocolo();
  const ipHash = ipHashDe(req);

  conferir(
    await bd.from('registros').insert({
      protocolo,
      anonimo,
      nome: anonimo ? null : cifrar(texto(corpo.nome, 200)),
      setor: anonimo ? null : cifrar(texto(corpo.setor, 200)),
      motivos,
      motivo_outro: cifrar(texto(corpo.outro, 500)),
      relato: cifrar(relato),
      imediato,
      envolve,
      envolvido: envolve === 'Sim' ? cifrar(texto(corpo.envolvido, 300)) : null,
      quer_contato: querContato,
      telefone: querContato === 'Sim' ? cifrar(texto(corpo.telefone, 60)) : null,
      email: querContato === 'Sim' ? cifrar(texto(corpo.email, 200)) : null,
      prioridade,
      ip_hash: ipHash,
    }),
    'inserir registro'
  );

  await auditar({ acao: 'registro_criado', detalhe: `${protocolo} (${prioridade})`, ipHash });

  if (prioridade === 'critica') {
    console.warn(`[PRIORIDADE CRÍTICA] Novo registro ${protocolo} em ${new Date().toISOString()}`);
  }

  json(res, 201, { protocolo, prioridade });
});

rotas.get('/api/protocolo/:codigo', async (req, res, { params }) => {
  if (!(await limitar(`consulta:${ipDe(req)}`, 20, 600))) {
    throw new ErroHttp(429, 'Muitas consultas. Aguarde alguns minutos.');
  }

  const codigo = String(params.codigo).toUpperCase().trim();
  const { data: registro } = await bd
    .from('registros')
    .select('id, protocolo, criado_em, atualizado_em, status')
    .eq('protocolo', codigo)
    .maybeSingle();

  if (!registro) throw new ErroHttp(404, 'Protocolo não encontrado. Confira o código digitado.');

  const notas = conferir(
    await bd
      .from('notas')
      .select('texto, criado_em')
      .eq('registro_id', registro.id)
      .eq('visivel_autor', true)
      .order('criado_em'),
    'notas públicas'
  );

  json(res, 200, {
    protocolo: registro.protocolo,
    criado_em: registro.criado_em,
    atualizado_em: registro.atualizado_em,
    status: registro.status,
    mensagens: notas.map((n) => ({ texto: decifrar(n.texto), criado_em: n.criado_em })),
  });
});

/* ==================================================================
   SESSÃO
================================================================== */

rotas.get('/api/eu', async (req, res) => {
  const usuario = await usuarioAtual(req);
  if (!usuario) throw new ErroHttp(401, 'Não autenticado.');
  await registrarAcesso(usuario.id);
  await auditar({ usuarioId: usuario.id, acao: 'login', ipHash: ipHashDe(req) });
  json(res, 200, { usuario });
});

// O painel chama após trocar a senha direto no Supabase Auth.
rotas.post('/api/senha-trocada', async (req, res) => {
  const usuario = await usuarioAtual(req);
  if (!usuario) throw new ErroHttp(401, 'Não autenticado.');
  await marcarSenhaTrocada(usuario.id);
  await auditar({ usuarioId: usuario.id, acao: 'senha_alterada', ipHash: ipHashDe(req) });
  json(res, 200, { ok: true });
});

/* ==================================================================
   PAINEL
================================================================== */

rotas.get('/api/admin/metricas', async (req, res) => {
  await exigirLogin(req);

  const registros = conferir(
    await bd.from('registros').select('status, prioridade, motivos, criado_em'),
    'métricas'
  );

  const porStatus = {};
  const porPrioridade = {};
  const contagem = new Map();
  const corte = Date.now() - 30 * 24 * 3600 * 1000;
  let ultimos30 = 0;

  for (const r of registros) {
    porStatus[r.status] = (porStatus[r.status] || 0) + 1;
    if (r.status !== 'concluido') {
      porPrioridade[r.prioridade] = (porPrioridade[r.prioridade] || 0) + 1;
    }
    if (new Date(r.criado_em).getTime() >= corte) ultimos30 += 1;
    for (const m of r.motivos || []) contagem.set(m, (contagem.get(m) || 0) + 1);
  }

  json(res, 200, {
    total: registros.length,
    ultimos30,
    porStatus,
    porPrioridade,
    motivos: [...contagem.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([nome, total]) => ({ nome, total })),
  });
});

rotas.get('/api/admin/registros', async (req, res, { url }) => {
  await exigirLogin(req);

  // A lista nunca traz o relato: ler conteúdo sensível exige abrir o registro,
  // o que deixa rastro na auditoria.
  let consulta = bd
    .from('registros')
    .select('id, protocolo, criado_em, atualizado_em, anonimo, motivos, prioridade, status, imediato, quer_contato, responsavel_id')
    .limit(300);

  const status = url.searchParams.get('status');
  if (status === 'abertos') consulta = consulta.neq('status', 'concluido');
  else if (status && STATUS.includes(status)) consulta = consulta.eq('status', status);

  const prioridade = url.searchParams.get('prioridade');
  if (prioridade && PRIORIDADES.includes(prioridade)) consulta = consulta.eq('prioridade', prioridade);

  const busca = (url.searchParams.get('protocolo') || '').trim().toUpperCase();
  if (busca) consulta = consulta.ilike('protocolo', `%${busca.replace(/[%_]/g, '')}%`);

  const registros = conferir(await consulta.order('criado_em', { ascending: false }), 'listar registros');

  const equipe = conferir(await bd.from('perfis').select('id, nome'), 'perfis');
  const nomePorId = new Map(equipe.map((u) => [u.id, u.nome]));

  const ordem = { critica: 0, alta: 1, normal: 2 };
  registros.sort(
    (a, b) =>
      ordem[a.prioridade] - ordem[b.prioridade] ||
      new Date(b.criado_em) - new Date(a.criado_em)
  );

  json(res, 200, {
    registros: registros.map((r) => ({
      ...r,
      responsavel: r.responsavel_id ? nomePorId.get(r.responsavel_id) || null : null,
    })),
  });
});

rotas.get('/api/admin/registros/:id', async (req, res, { params }) => {
  const usuario = await exigirLogin(req);
  const id = Number(params.id);
  if (!Number.isInteger(id)) throw new ErroHttp(400, 'Registro inválido.');

  const { data: r } = await bd.from('registros').select('*').eq('id', id).maybeSingle();
  if (!r) throw new ErroHttp(404, 'Registro não encontrado.');

  // Toda abertura de registro fica registrada com autor, data e IP.
  await auditar({
    usuarioId: usuario.id,
    acao: 'registro_aberto',
    registroId: id,
    detalhe: r.protocolo,
    ipHash: ipHashDe(req),
  });

  const notas = conferir(
    await bd
      .from('notas')
      .select('id, texto, visivel_autor, criado_em, usuario_id')
      .eq('registro_id', id)
      .order('criado_em'),
    'notas'
  );

  const equipe = conferir(await bd.from('perfis').select('id, nome'), 'perfis');
  const nomePorId = new Map(equipe.map((u) => [u.id, u.nome]));

  json(res, 200, {
    registro: {
      ...r,
      nome: decifrar(r.nome),
      setor: decifrar(r.setor),
      motivo_outro: decifrar(r.motivo_outro),
      relato: decifrar(r.relato),
      envolvido: decifrar(r.envolvido),
      telefone: decifrar(r.telefone),
      email: decifrar(r.email),
      ip_hash: undefined,
    },
    notas: notas.map((n) => ({
      id: n.id,
      texto: decifrar(n.texto),
      visivel_autor: n.visivel_autor,
      criado_em: n.criado_em,
      autor: n.usuario_id ? nomePorId.get(n.usuario_id) || null : null,
    })),
  });
});

rotas.patch('/api/admin/registros/:id', async (req, res, { params }) => {
  const usuario = await exigirLogin(req);
  const id = Number(params.id);
  const corpo = await lerJson(req);

  const { data: existente } = await bd
    .from('registros')
    .select('protocolo')
    .eq('id', id)
    .maybeSingle();
  if (!existente) throw new ErroHttp(404, 'Registro não encontrado.');

  const mudanca = { atualizado_em: new Date().toISOString() };
  const descricao = [];

  if (corpo.status !== undefined) {
    if (!STATUS.includes(corpo.status)) throw new ErroHttp(400, 'Status inválido.');
    mudanca.status = corpo.status;
    descricao.push(`status=${corpo.status}`);
  }
  if (corpo.prioridade !== undefined) {
    if (!PRIORIDADES.includes(corpo.prioridade)) throw new ErroHttp(400, 'Prioridade inválida.');
    mudanca.prioridade = corpo.prioridade;
    descricao.push(`prioridade=${corpo.prioridade}`);
  }
  if (corpo.responsavel_id !== undefined) {
    const alvo = corpo.responsavel_id || null;
    if (alvo) {
      const { data: perfil } = await bd
        .from('perfis')
        .select('id')
        .eq('id', alvo)
        .eq('ativo', true)
        .maybeSingle();
      if (!perfil) throw new ErroHttp(400, 'Responsável inválido.');
    }
    mudanca.responsavel_id = alvo;
    descricao.push(`responsavel=${alvo ?? 'nenhum'}`);
  }
  if (!descricao.length) throw new ErroHttp(400, 'Nada a atualizar.');

  conferir(await bd.from('registros').update(mudanca).eq('id', id), 'atualizar registro');

  await auditar({
    usuarioId: usuario.id,
    acao: 'registro_atualizado',
    registroId: id,
    detalhe: `${existente.protocolo}: ${descricao.join(', ')}`,
    ipHash: ipHashDe(req),
  });
  json(res, 200, { ok: true });
});

rotas.post('/api/admin/registros/:id/notas', async (req, res, { params }) => {
  const usuario = await exigirLogin(req);
  const id = Number(params.id);
  const { texto: conteudo, visivel_autor } = await lerJson(req);

  const limpo = texto(conteudo, 10000);
  if (!limpo) throw new ErroHttp(400, 'Escreva o conteúdo da anotação.');

  const { data: existe } = await bd.from('registros').select('id').eq('id', id).maybeSingle();
  if (!existe) throw new ErroHttp(404, 'Registro não encontrado.');

  conferir(
    await bd.from('notas').insert({
      registro_id: id,
      usuario_id: usuario.id,
      texto: cifrar(limpo),
      visivel_autor: Boolean(visivel_autor),
    }),
    'inserir nota'
  );
  await bd.from('registros').update({ atualizado_em: new Date().toISOString() }).eq('id', id);

  await auditar({
    usuarioId: usuario.id,
    acao: visivel_autor ? 'resposta_ao_autor' : 'nota_interna',
    registroId: id,
    ipHash: ipHashDe(req),
  });
  json(res, 201, { ok: true });
});

/* ==================================================================
   EQUIPE E AUDITORIA
================================================================== */

rotas.get('/api/admin/usuarios', async (req, res) => {
  await exigirLogin(req);
  const usuarios = conferir(
    await bd
      .from('perfis')
      .select('id, nome, email, papel, ativo, criado_em, ultimo_acesso')
      .order('nome'),
    'listar perfis'
  );
  json(res, 200, { usuarios });
});

rotas.post('/api/admin/usuarios', async (req, res) => {
  const usuario = await exigirLogin(req, { papel: 'admin' });
  const { nome, email, papel } = await lerJson(req);

  const nomeLimpo = texto(nome, 120);
  const emailLimpo = texto(email, 200)?.toLowerCase();
  if (!nomeLimpo || !emailLimpo || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(emailLimpo)) {
    throw new ErroHttp(400, 'Informe nome e e-mail válidos.');
  }

  const provisoria = senhaProvisoria();
  const { data: criado, error } = await bd.auth.admin.createUser({
    email: emailLimpo,
    password: provisoria,
    email_confirm: true, // acesso interno: não exigimos confirmação por e-mail
  });

  if (error) {
    if (/already/i.test(error.message)) throw new ErroHttp(409, 'Já existe usuário com este e-mail.');
    console.error('[criar usuário]', error.message);
    throw new ErroHttp(500, 'Não foi possível criar o acesso.');
  }

  const { error: erroPerfil } = await bd.from('perfis').insert({
    id: criado.user.id,
    nome: nomeLimpo,
    email: emailLimpo,
    papel: papel === 'admin' ? 'admin' : 'acolhimento',
  });

  if (erroPerfil) {
    // Sem perfil o login não funciona; desfaz para não deixar conta órfã.
    await bd.auth.admin.deleteUser(criado.user.id);
    console.error('[criar perfil]', erroPerfil.message);
    throw new ErroHttp(500, 'Não foi possível criar o acesso.');
  }

  await auditar({
    usuarioId: usuario.id,
    acao: 'usuario_criado',
    detalhe: emailLimpo,
    ipHash: ipHashDe(req),
  });
  json(res, 201, { senha_provisoria: provisoria });
});

rotas.patch('/api/admin/usuarios/:id', async (req, res, { params }) => {
  const usuario = await exigirLogin(req, { papel: 'admin' });
  const id = String(params.id);
  const corpo = await lerJson(req);

  if (id === usuario.id && corpo.ativo === false) {
    throw new ErroHttp(400, 'Você não pode desativar o próprio acesso.');
  }

  const { data: alvo } = await bd.from('perfis').select('email').eq('id', id).maybeSingle();
  if (!alvo) throw new ErroHttp(404, 'Usuário não encontrado.');

  const mudanca = {};
  if (corpo.ativo !== undefined) mudanca.ativo = Boolean(corpo.ativo);
  if (corpo.papel !== undefined) mudanca.papel = corpo.papel === 'admin' ? 'admin' : 'acolhimento';

  let provisoria = null;
  if (corpo.redefinir_senha) {
    provisoria = senhaProvisoria();
    const { error } = await bd.auth.admin.updateUserById(id, { password: provisoria });
    if (error) {
      console.error('[redefinir senha]', error.message);
      throw new ErroHttp(500, 'Não foi possível redefinir a senha.');
    }
  }

  if (Object.keys(mudanca).length) {
    conferir(await bd.from('perfis').update(mudanca).eq('id', id), 'atualizar perfil');
  } else if (!provisoria) {
    throw new ErroHttp(400, 'Nada a atualizar.');
  }

  // Desativar precisa cortar o acesso agora, não quando o token expirar.
  if (mudanca.ativo === false || provisoria) {
    await bd.auth.admin.signOut(id, 'global').catch(() => {});
  }

  await auditar({
    usuarioId: usuario.id,
    acao: 'usuario_atualizado',
    detalhe: alvo.email,
    ipHash: ipHashDe(req),
  });
  json(res, 200, { ok: true, senha_provisoria: provisoria });
});

rotas.get('/api/admin/auditoria', async (req, res) => {
  await exigirLogin(req, { papel: 'admin' });

  const eventos = conferir(
    await bd
      .from('auditoria')
      .select('id, acao, registro_id, detalhe, criado_em, usuario_id')
      .order('criado_em', { ascending: false })
      .limit(400),
    'auditoria'
  );

  const equipe = conferir(await bd.from('perfis').select('id, nome'), 'perfis');
  const nomePorId = new Map(equipe.map((u) => [u.id, u.nome]));

  json(res, 200, {
    eventos: eventos.map((e) => ({
      ...e,
      usuario: e.usuario_id ? nomePorId.get(e.usuario_id) || null : null,
    })),
  });
});
