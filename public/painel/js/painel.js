(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };

  var STATUS = {
    novo: 'Novo',
    em_acolhimento: 'Em acolhimento',
    encaminhado: 'Encaminhado',
    concluido: 'Concluído',
  };
  var PRIORIDADES = { critica: 'Crítica', alta: 'Alta', normal: 'Normal' };

  var estado = { usuario: null, filtro: 'abertos', busca: '', equipe: [] };

  /* ------------------------------------------------------------------ util */

  /**
   * Chamada ao nosso /api com o token do Supabase Auth.
   * O token vai no cabeçalho, não em cookie: sem cookie de sessão, não há
   * superfície de CSRF — outro site não consegue anexá-lo à requisição.
   */
  function api(caminho, opcoes) {
    opcoes = opcoes || {};
    return Auth.token()
      .catch(function () { mostrarLogin(); throw new Error('Sessão expirada. Entre novamente.'); })
      .then(function (token) {
        opcoes.headers = Object.assign(
          { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
          opcoes.headers
        );
        if (opcoes.corpo) opcoes.body = JSON.stringify(opcoes.corpo);
        return fetch(caminho, opcoes);
      })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (dados) {
          if (r.status === 401) { mostrarLogin(); throw new Error(dados.erro || 'Sessão expirada.'); }
          if (r.status === 428) { mostrarTrocaSenha(); throw new Error(dados.erro || 'Troque a senha.'); }
          if (!r.ok) throw new Error(dados.erro || 'Falha na operação.');
          return dados;
        });
      });
  }

  function el(tag, classe, texto) {
    var n = document.createElement(tag);
    if (classe) n.className = classe;
    if (texto !== undefined && texto !== null) n.textContent = texto; // nunca innerHTML com dado do usuário
    return n;
  }

  /* Célula de tabela com rótulo. No celular a tabela vira cartão e o CSS
     mostra este rótulo ao lado do valor — rolar tabela de lado com o
     polegar esconde informação e é fácil de errar. */
  function celula(rotulo, texto) {
    var td = el('td', null, texto);
    td.setAttribute('data-rotulo', rotulo);
    return td;
  }

  // O Postgres devolve ISO com fuso ("2026-09-23T14:56:41.492+00:00").
  // A versão anterior assumia o formato do SQLite e grudava um "Z" no fim,
  // o que gerava data inválida e fazia a tela mostrar o texto cru.
  function dataBR(iso) {
    if (!iso) return '—';
    var texto = String(iso);
    // Sem fuso explícito (formato antigo do SQLite), assume UTC.
    if (texto.indexOf('T') === -1 && !/[+-]\d{2}:?\d{2}$|Z$/.test(texto)) {
      texto = texto.replace(' ', 'T') + 'Z';
    }
    var d = new Date(texto);
    return isNaN(d.getTime()) ? iso : d.toLocaleString('pt-BR');
  }

  // Versão curta para telas pequenas: "23/09 08:56".
  function dataCurta(iso) {
    if (!iso) return '—';
    var d = new Date(String(iso));
    if (isNaN(d.getTime())) return dataBR(iso);
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) +
      ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }

  function erroEm(id, mensagem) {
    var caixa = $(id);
    caixa.textContent = mensagem;
    caixa.hidden = false;
  }

  /* ----------------------------------------------------------------- telas */

  function mostrarLogin() {
    $('tela-login').hidden = false;
    $('tela-senha').hidden = true;
    $('app').hidden = true;
  }

  function mostrarTrocaSenha() {
    $('tela-login').hidden = true;
    $('tela-senha').hidden = false;
    $('app').hidden = true;
  }

  function mostrarApp() {
    $('tela-login').hidden = true;
    $('tela-senha').hidden = true;
    $('app').hidden = false;
    $('meu-nome').textContent = estado.usuario.nome;
    $('meu-papel').textContent =
      estado.usuario.papel === 'admin' ? 'Administrador' : 'Equipe de acolhimento';

    var admin = estado.usuario.papel === 'admin';
    document.querySelector('[data-aba="auditoria"]').hidden = !admin;
    $('caixa-novo-usuario').hidden = !admin;

    carregarMetricas();
    carregarRegistros();
    carregarEquipe();
  }

  /* ----------------------------------------------------------------- login */

  function entrarNoPainel() {
    return api('/api/eu')
      .then(function (dados) {
        estado.usuario = dados.usuario;
        if (dados.usuario.trocar_senha) mostrarTrocaSenha();
        else mostrarApp();
      });
  }

  $('form-login').addEventListener('submit', function (ev) {
    ev.preventDefault();
    $('erro-login').hidden = true;
    var botao = ev.target.querySelector('button[type=submit]');
    botao.disabled = true;

    Auth.entrar($('email').value.trim(), $('senha').value)
      .then(function () {
        $('senha').value = '';
        return entrarNoPainel();
      })
      .catch(function (erro) {
        // A senha pode estar certa e o acesso ainda ser negado (conta sem
        // perfil, ou desativada). Descarta a sessão para não ficar num meio
        // termo em que o token existe mas nada funciona.
        Auth.sair().catch(function () {});
        erroEm('erro-login', erro.message);
      })
      .then(function () { botao.disabled = false; });
  });

  // "Esqueci minha senha": o Supabase envia o link; a nova senha é definida
  // em /painel/nova-senha.html. A mensagem é a mesma exista ou não a conta,
  // para não revelar quem faz parte da equipe de acolhimento.
  $('link-esqueci').addEventListener('click', function (ev) {
    ev.preventDefault();
    var email = $('email').value.trim();
    if (!email) return erroEm('erro-login', 'Digite seu e-mail para receber o link.');
    Auth.recuperar(email).catch(function () {}).then(function () {
      var caixa = $('erro-login');
      caixa.textContent = 'Se este e-mail tiver acesso ao painel, o link de redefinição chegará em instantes.';
      caixa.hidden = false;
    });
  });

  $('form-senha').addEventListener('submit', function (ev) {
    ev.preventDefault();
    $('erro-senha').hidden = true;
    if ($('senha-nova').value !== $('senha-conf').value) {
      return erroEm('erro-senha', 'As senhas digitadas não são iguais.');
    }
    if ($('senha-nova').value.length < 10) {
      return erroEm('erro-senha', 'A nova senha precisa ter ao menos 10 caracteres.');
    }
    Auth.trocarSenha($('senha-nova').value)
      .then(function () { return api('/api/senha-trocada', { method: 'POST' }); })
      .then(function () {
        estado.usuario.trocar_senha = false;
        $('form-senha').reset();
        mostrarApp();
      })
      .catch(function (erro) { erroEm('erro-senha', erro.message); });
  });

  $('btn-sair').addEventListener('click', function () {
    Auth.sair().catch(function () {}).then(function () {
      estado.usuario = null;
      location.reload();
    });
  });

  /* ------------------------------------------------------------------ abas */

  document.querySelectorAll('.aba').forEach(function (botao) {
    botao.addEventListener('click', function () {
      document.querySelectorAll('.aba').forEach(function (b) {
        b.setAttribute('aria-selected', String(b === botao));
      });
      ['registros', 'indicadores', 'usuarios', 'auditoria'].forEach(function (nome) {
        $('painel-' + nome).hidden = nome !== botao.dataset.aba;
      });
      if (botao.dataset.aba === 'indicadores') carregarIndicadores();
      if (botao.dataset.aba === 'usuarios') carregarEquipe(true);
      if (botao.dataset.aba === 'auditoria') carregarAuditoria();
    });
  });

  /* -------------------------------------------------------------- métricas */

  function cartaoMetrica(valor, rotulo, critico) {
    var caixa = el('div', 'metrica' + (critico ? ' critica' : ''));
    caixa.appendChild(el('div', 'valor', String(valor)));
    caixa.appendChild(el('div', 'rotulo', rotulo));
    return caixa;
  }

  function carregarMetricas() {
    api('/api/admin/metricas').then(function (m) {
      estado.metricas = m;
      var destino = $('metricas');
      destino.textContent = '';
      destino.appendChild(cartaoMetrica(m.porPrioridade.critica || 0, 'Prioridade crítica em aberto', true));
      destino.appendChild(cartaoMetrica(m.porStatus.novo || 0, 'Aguardando triagem'));
      destino.appendChild(cartaoMetrica(m.porStatus.em_acolhimento || 0, 'Em acolhimento'));
      destino.appendChild(cartaoMetrica(m.ultimos30, 'Recebidos nos últimos 30 dias'));
    }).catch(function () {});
  }

  function carregarIndicadores() {
    api('/api/admin/metricas').then(function (m) {
      var destino = $('metricas-2');
      destino.textContent = '';
      destino.appendChild(cartaoMetrica(m.total, 'Total de registros'));
      destino.appendChild(cartaoMetrica(m.ultimos30, 'Últimos 30 dias'));
      destino.appendChild(cartaoMetrica(m.porStatus.concluido || 0, 'Concluídos'));
      destino.appendChild(cartaoMetrica((m.porPrioridade.critica || 0) + (m.porPrioridade.alta || 0), 'Abertos de alta prioridade', true));

      var grafico = $('grafico-motivos');
      grafico.textContent = '';
      var maximo = m.motivos.reduce(function (a, b) { return Math.max(a, b.total); }, 0) || 1;

      m.motivos.forEach(function (item) {
        var linha = el('div');
        linha.style.margin = '0 0 12px';

        var topo = el('div');
        topo.style.cssText = 'display:flex; justify-content:space-between; gap:12px; font-size:14px; margin-bottom:5px';
        topo.appendChild(el('span', null, item.nome));
        var total = el('strong', null, String(item.total));
        topo.appendChild(total);

        var trilho = el('div');
        trilho.style.cssText = 'height:8px; border-radius:99px; background:var(--surface-2); border:1px solid var(--line); overflow:hidden';
        var barra = el('div');
        barra.style.cssText =
          'height:100%; background:var(--accent); width:' + Math.round((item.total / maximo) * 100) + '%';
        trilho.appendChild(barra);

        linha.appendChild(topo);
        linha.appendChild(trilho);
        grafico.appendChild(linha);
      });

      if (!m.motivos.length) grafico.appendChild(el('p', 'vazio', 'Nenhum registro ainda.'));
    }).catch(function () {});
  }

  /* -------------------------------------------------------------- registros */

  document.querySelectorAll('.chip[data-status]').forEach(function (chip) {
    chip.addEventListener('click', function () {
      document.querySelectorAll('.chip[data-status]').forEach(function (c) {
        c.setAttribute('aria-pressed', String(c === chip));
      });
      estado.filtro = chip.dataset.status;
      carregarRegistros();
    });
  });

  var timerBusca;
  $('busca-protocolo').addEventListener('input', function () {
    clearTimeout(timerBusca);
    estado.busca = this.value.trim();
    timerBusca = setTimeout(carregarRegistros, 300);
  });

  function carregarRegistros() {
    var params = new URLSearchParams();
    if (estado.filtro) params.set('status', estado.filtro);
    if (estado.busca) params.set('protocolo', estado.busca);

    api('/api/admin/registros?' + params.toString()).then(function (dados) {
      var lista = $('lista');
      lista.textContent = '';

      if (!dados.registros.length) {
        lista.appendChild(el('p', 'vazio', 'Nenhum registro neste filtro.'));
        return;
      }

      dados.registros.forEach(function (r) {
        var cartao = el('button', 'cartao-registro ' + r.prioridade);
        cartao.type = 'button';

        var cabeca = el('div', 'cabeca');
        cabeca.appendChild(el('span', 'codigo', r.protocolo));
        cabeca.appendChild(el('span', 'etiqueta et-' + r.prioridade, PRIORIDADES[r.prioridade]));
        cabeca.appendChild(
          el('span', 'etiqueta ' + (r.status === 'novo' ? 'et-novo' : 'et-status'), STATUS[r.status])
        );
        if (r.anonimo) cabeca.appendChild(el('span', 'etiqueta et-anonimo', 'Anônimo'));
        if (r.quer_contato === 'Sim') cabeca.appendChild(el('span', 'etiqueta et-status', 'Quer contato'));

        // A lista mostra só os rótulos de motivo — o relato exige abrir o registro.
        var resumo = r.motivos.length ? r.motivos.join(' · ') : 'Sem motivo selecionado';
        cartao.appendChild(cabeca);
        cartao.appendChild(el('div', 'resumo', resumo));
        cartao.appendChild(
          el('div', 'data', 'Recebido em ' + dataCurta(r.criado_em) +
            (r.responsavel ? ' · responsável: ' + r.responsavel : ' · sem responsável'))
        );

        cartao.addEventListener('click', function () { abrirRegistro(r.id); });
        lista.appendChild(cartao);
      });
    }).catch(function () {});
  }

  /* ----------------------------------------------------------------- gaveta */

  function fecharGaveta() {
    $('gaveta').hidden = true;
    $('fundo').hidden = true;
    $('gaveta').textContent = '';
  }

  $('fundo').addEventListener('click', fecharGaveta);
  document.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape' && !$('gaveta').hidden) fecharGaveta();
  });

  function bloco(rotulo, valor) {
    var caixa = el('div', 'dado');
    caixa.appendChild(el('dt', null, rotulo));
    caixa.appendChild(el('dd', null, valor || '—'));
    return caixa;
  }

  function abrirRegistro(id) {
    api('/api/admin/registros/' + id).then(function (dados) {
      var r = dados.registro;
      var g = $('gaveta');
      g.textContent = '';

      var fechar = el('button', 'btn-icone fechar', '✕');
      fechar.type = 'button';
      fechar.setAttribute('aria-label', 'Fechar');
      fechar.addEventListener('click', fecharGaveta);
      g.appendChild(fechar);

      g.appendChild(el('h2', null, r.protocolo));
      g.appendChild(el('p', 'apoio', 'Recebido em ' + dataBR(r.criado_em) + ' · última movimentação em ' + dataBR(r.atualizado_em)));

      var etiquetas = el('div', 'cabeca');
      etiquetas.style.marginTop = '12px';
      etiquetas.appendChild(el('span', 'etiqueta et-' + r.prioridade, 'Prioridade ' + PRIORIDADES[r.prioridade]));
      var etiquetaStatus = el('span', 'etiqueta et-status', STATUS[r.status]);
      etiquetas.appendChild(etiquetaStatus);
      g.appendChild(etiquetas);

      if (r.prioridade === 'critica') {
        g.appendChild(
          el('div', 'aviso-sensivel',
            'Registro sinalizado como crítico. Se houver indício de risco à vida e a pessoa se identificou, ' +
            'acione o protocolo interno de emergência imediatamente. CVV 188 · SAMU 192.')
        );
      }

      // ---- identificação
      g.appendChild(bloco('Identificação', r.anonimo ? 'Anônimo — a pessoa optou por não se identificar' : (r.nome || 'Não informou o nome')));
      if (!r.anonimo && r.setor) g.appendChild(bloco('Setor / Função', r.setor));

      // ---- motivos
      var motivos = r.motivos.slice();
      if (r.motivo_outro) motivos.push('Outro: ' + r.motivo_outro);
      g.appendChild(bloco('Motivos', motivos.length ? motivos.join(' · ') : '—'));

      // ---- relato
      var caixaRelato = el('div', 'dado');
      caixaRelato.appendChild(el('dt', null, 'Relato'));
      var dd = el('dd');
      dd.appendChild(el('div', 'relato', r.relato || 'Sem relato escrito.'));
      caixaRelato.appendChild(dd);
      g.appendChild(caixaRelato);

      var grade = el('div', 'grade-2');
      grade.style.marginTop = '18px';
      grade.appendChild(bloco('Precisa de acolhimento imediato', r.imediato));
      grade.appendChild(bloco('Envolve outra pessoa', r.envolve));
      if (r.envolvido) grade.appendChild(bloco('Pessoa / setor citado', r.envolvido));
      grade.appendChild(bloco('Deseja ser contatado', r.quer_contato));
      if (r.telefone) grade.appendChild(bloco('Telefone / WhatsApp', r.telefone));
      if (r.email) grade.appendChild(bloco('E-mail', r.email));
      g.appendChild(grade);

      // ---- triagem
      var triagem = el('div', 'dado');
      triagem.appendChild(el('dt', null, 'Triagem'));
      var linha = el('div', 'grade-2');

      var selStatus = el('select');
      Object.keys(STATUS).forEach(function (chave) {
        var op = el('option', null, STATUS[chave]);
        op.value = chave;
        if (chave === r.status) op.selected = true;
        selStatus.appendChild(op);
      });
      var statusAnterior = r.status;
      selStatus.addEventListener('change', function () {
        var escolhido = selStatus.value;
        atualizar(id, { status: escolhido }, selStatus, function (ok) {
          if (ok) {
            statusAnterior = escolhido;
            etiquetaStatus.textContent = STATUS[escolhido];
          } else {
            selStatus.value = statusAnterior;
          }
        });
      });

      var selResp = el('select');
      var vazio = el('option', null, 'Sem responsável');
      vazio.value = '';
      selResp.appendChild(vazio);
      estado.equipe.filter(function (u) { return u.ativo; }).forEach(function (u) {
        var op = el('option', null, u.nome);
        op.value = String(u.id);
        if (String(u.id) === String(r.responsavel_id)) op.selected = true;
        selResp.appendChild(op);
      });

      // O id do perfil é um uuid: enviar como texto. Converter para número
      // produzia NaN, que vira null no JSON e apagava o responsável.
      var respAnterior = r.responsavel_id ? String(r.responsavel_id) : '';
      selResp.addEventListener('change', function () {
        var escolhido = selResp.value;
        atualizar(id, { responsavel_id: escolhido || null }, selResp, function (ok) {
          if (ok) respAnterior = escolhido;
          else selResp.value = respAnterior;
        });
      });

      var c1 = el('div'); c1.appendChild(el('label', null, 'Status')); c1.appendChild(selStatus);
      var c2 = el('div'); c2.appendChild(el('label', null, 'Responsável')); c2.appendChild(selResp);
      linha.appendChild(c1); linha.appendChild(c2);
      triagem.appendChild(linha);
      g.appendChild(triagem);

      // ---- histórico
      var hist = el('div', 'dado');
      hist.appendChild(el('dt', null, 'Histórico de acolhimento'));
      if (!dados.notas.length) hist.appendChild(el('p', 'apoio', 'Nenhuma anotação ainda.'));
      dados.notas.forEach(function (n) {
        var nota = el('div', 'nota' +
          (n.de_autor ? ' do-autor' : n.visivel_autor ? ' publica' : ''));
        nota.appendChild(
          el('div', 'meta',
            n.de_autor
              ? 'Resposta de quem enviou o contato · ' + dataBR(n.criado_em)
              : (n.autor || 'Usuário removido') + ' · ' + dataBR(n.criado_em) +
                (n.visivel_autor ? ' · visível para quem enviou' : ' · interna'))
        );
        nota.appendChild(el('div', 'corpo', n.texto));
        hist.appendChild(nota);
      });
      g.appendChild(hist);

      // ---- nova anotação
      var form = el('form', 'dado');
      form.appendChild(el('dt', null, 'Nova anotação'));
      var area = el('textarea');
      area.style.minHeight = '110px';
      area.required = true;
      area.placeholder = 'Registre o atendimento, encaminhamento ou resposta…';
      form.appendChild(area);

      var marca = el('label', 'opcao');
      marca.style.marginTop = '10px';
      var chk = document.createElement('input');
      chk.type = 'checkbox';
      marca.appendChild(chk);
      marca.appendChild(document.createTextNode(' Enviar como resposta visível a quem abriu o contato (pelo protocolo)'));
      form.appendChild(marca);

      var salvar = el('button', 'botao primario pequeno', 'Salvar anotação');
      salvar.type = 'submit';
      salvar.style.marginTop = '12px';
      form.appendChild(salvar);

      form.addEventListener('submit', function (ev) {
        ev.preventDefault();
        api('/api/admin/registros/' + id + '/notas', {
          method: 'POST',
          corpo: { texto: area.value, visivel_autor: chk.checked },
        }).then(function () {
          abrirRegistro(id);
          carregarRegistros();
        }).catch(function (erro) { alert(erro.message); });
      });
      g.appendChild(form);

      $('gaveta').hidden = false;
      $('fundo').hidden = false;
      g.scrollTop = 0;
    }).catch(function (erro) { alert(erro.message); });
  }

  function atualizar(id, mudanca, campo, depois) {
    if (campo) campo.disabled = true;
    return api('/api/admin/registros/' + id, { method: 'PATCH', corpo: mudanca })
      .then(function () {
        carregarRegistros();
        carregarMetricas();
        if (depois) depois(true);
      })
      .catch(function (erro) {
        alert(erro.message);
        if (depois) depois(false);
      })
      .then(function () { if (campo) campo.disabled = false; });
  }

  /* ----------------------------------------------------------------- equipe */

  function carregarEquipe(renderizar) {
    return api('/api/admin/usuarios').then(function (dados) {
      estado.equipe = dados.usuarios;
      if (!renderizar) return;

      var corpo = $('tabela-usuarios');
      corpo.textContent = '';
      var admin = estado.usuario.papel === 'admin';

      dados.usuarios.forEach(function (u) {
        var tr = el('tr');
        tr.appendChild(celula('Nome', u.nome));
        tr.appendChild(celula('E-mail', u.email));
        tr.appendChild(celula('Perfil', u.papel === 'admin' ? 'Administrador' : 'Acolhimento'));
        tr.appendChild(celula('Último acesso', u.ultimo_acesso ? dataBR(u.ultimo_acesso) : 'nunca acessou'));
        tr.appendChild(celula('Situação', u.ativo ? 'Ativo' : 'Desativado'));

        var acoes = el('td');
        acoes.setAttribute('data-rotulo', '');
        if (admin) {
          var alternar = el('button', 'botao secundario pequeno', u.ativo ? 'Desativar' : 'Reativar');
          alternar.type = 'button';
          alternar.addEventListener('click', function () {
            if (u.ativo && !confirm('Desativar o acesso de ' + u.nome + '?')) return;
            api('/api/admin/usuarios/' + u.id, { method: 'PATCH', corpo: { ativo: !u.ativo } })
              .then(function () { carregarEquipe(true); })
              .catch(function (erro) { alert(erro.message); });
          });
          acoes.appendChild(alternar);

          var redefinir = el('button', 'botao secundario pequeno', 'Nova senha');
          redefinir.type = 'button';
          redefinir.style.marginLeft = '6px';
          redefinir.addEventListener('click', function () {
            if (!confirm('Gerar nova senha provisória para ' + u.nome + '? As sessões ativas serão encerradas.')) return;
            api('/api/admin/usuarios/' + u.id, { method: 'PATCH', corpo: { redefinir_senha: true } })
              .then(function (d) {
                alert('Senha provisória de ' + u.nome + ':\n\n' + d.senha_provisoria +
                      '\n\nEntregue pessoalmente. Ela não será exibida novamente.');
                carregarEquipe(true);
              })
              .catch(function (erro) { alert(erro.message); });
          });
          acoes.appendChild(redefinir);
        }
        tr.appendChild(acoes);
        corpo.appendChild(tr);
      });
    }).catch(function () {});
  }

  $('form-usuario').addEventListener('submit', function (ev) {
    ev.preventDefault();
    $('erro-usuario').hidden = true;
    $('senha-gerada').hidden = true;
    api('/api/admin/usuarios', {
      method: 'POST',
      corpo: { nome: $('u-nome').value, email: $('u-email').value, papel: $('u-papel').value },
    })
      .then(function (dados) {
        $('senha-gerada').textContent =
          'Acesso criado. Senha provisória: ' + dados.senha_provisoria +
          ' — entregue pessoalmente. Ela não será exibida novamente.';
        $('senha-gerada').hidden = false;
        $('form-usuario').reset();
        carregarEquipe(true);
      })
      .catch(function (erro) { erroEm('erro-usuario', erro.message); });
  });

  /* -------------------------------------------------------------- auditoria */

  function carregarAuditoria() {
    api('/api/admin/auditoria').then(function (dados) {
      var corpo = $('tabela-auditoria');
      corpo.textContent = '';
      dados.eventos.forEach(function (e) {
        var tr = el('tr');
        tr.appendChild(celula('Quando', dataBR(e.criado_em)));
        tr.appendChild(celula('Quem', e.usuario || '—'));
        tr.appendChild(celula('Ação', e.acao.replace(/_/g, ' ')));
        tr.appendChild(celula('Detalhe', e.detalhe || '—'));
        corpo.appendChild(tr);
      });
      if (!dados.eventos.length) {
        var tr = el('tr');
        var td = el('td', 'vazio', 'Nenhum evento registrado.');
        td.colSpan = 4;
        tr.appendChild(td);
        corpo.appendChild(tr);
      }
    }).catch(function () {});
  }

  /* ----------------------------------------------------------------- início */

  if (Auth.temSessao()) entrarNoPainel().catch(mostrarLogin);
  else mostrarLogin();
})();
