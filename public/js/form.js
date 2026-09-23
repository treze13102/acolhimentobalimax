(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var criticos = [];

  function valorMarcado(nome) {
    var el = document.querySelector('input[name="' + nome + '"]:checked');
    return el ? el.value : '';
  }

  function motivosMarcados() {
    return Array.prototype.map.call(
      document.querySelectorAll('input[name="motivo"]:checked'),
      function (c) { return c.value; }
    );
  }

  /* ------------------------------------------------- monta a lista de motivos */

  fetch('/api/motivos')
    .then(function (r) { return r.json(); })
    .then(function (dados) {
      criticos = dados.criticos || [];
      if (dados.empresa) $('empresa').textContent = dados.empresa;

      var caixa = $('motivos');
      dados.motivos.forEach(function (texto, i) {
        var rotulo = document.createElement('label');
        rotulo.className = 'opcao' + (criticos.indexOf(texto) !== -1 ? ' sensivel' : '');
        var entrada = document.createElement('input');
        entrada.type = 'checkbox';
        entrada.name = 'motivo';
        entrada.value = texto;
        entrada.id = 'motivo-' + i;
        rotulo.appendChild(entrada);
        rotulo.appendChild(document.createTextNode(' ' + texto));
        caixa.appendChild(rotulo);
      });
    })
    .catch(function () {
      mostrarErro('Não foi possível carregar o formulário. Recarregue a página ou fale com o RH.');
    });

  /* ----------------------------------------------------- campos condicionais */

  document.addEventListener('change', function (ev) {
    var nome = ev.target.name;

    if (nome === 'motivo') {
      var sel = motivosMarcados();
      $('campo-outro').hidden = sel.indexOf('Outro') === -1;
      var risco = sel.some(function (v) { return criticos.indexOf(v) !== -1; });
      var alerta = $('alerta-risco');
      if (risco && alerta.hidden) {
        alerta.hidden = false;
        alerta.scrollIntoView({ block: 'nearest' });
      } else if (!risco) {
        alerta.hidden = true;
      }
    } else if (nome === 'identificar') {
      $('bloco-identificacao').hidden = valorMarcado('identificar') !== 'Sim';
    } else if (nome === 'envolve') {
      $('campo-envolvido').hidden = valorMarcado('envolve') !== 'Sim';
    } else if (nome === 'contato') {
      $('bloco-contato').hidden = valorMarcado('contato') !== 'Sim';
    }
  });

  /* ------------------------------------------------------------------ envio */

  function mostrarErro(mensagem) {
    var caixa = $('erro');
    caixa.textContent = mensagem;
    caixa.hidden = false;
    caixa.scrollIntoView({ block: 'center' });
  }

  $('formulario').addEventListener('submit', function (ev) {
    ev.preventDefault();
    $('erro').hidden = true;

    var motivos = motivosMarcados();
    var relato = $('relato').value.trim();
    if (!motivos.length && !relato) {
      mostrarErro('Selecione ao menos um motivo ou escreva o que está acontecendo.');
      return;
    }

    var identificar = valorMarcado('identificar');
    var corpo = {
      identificar: identificar,
      nome: identificar === 'Sim' ? $('nome').value : '',
      setor: identificar === 'Sim' ? $('setor').value : '',
      motivos: motivos,
      outro: $('outro').value,
      relato: relato,
      imediato: valorMarcado('imediato'),
      envolve: valorMarcado('envolve'),
      envolvido: $('envolvido').value,
      contato: valorMarcado('contato'),
      telefone: $('telefone').value,
      email: $('email').value,
    };

    var botao = $('enviar');
    botao.disabled = true;
    botao.textContent = 'Enviando…';

    fetch('/api/registros', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo),
    })
      .then(function (r) {
        return r.json().then(function (dados) {
          if (!r.ok) throw new Error(dados.erro || 'Não foi possível enviar.');
          return dados;
        });
      })
      .then(function (dados) {
        $('formulario').hidden = true;
        $('protocolo').textContent = dados.protocolo;
        $('ir-protocolo').href = '/protocolo.html?codigo=' + encodeURIComponent(dados.protocolo);
        $('aviso-critico').hidden = dados.prioridade !== 'critica';
        $('recibo').hidden = false;
        $('recibo').scrollIntoView({ block: 'start' });
        document.title = 'Contato registrado — ' + dados.protocolo;
      })
      .catch(function (erro) {
        mostrarErro(erro.message + ' Se for urgente, ligue 188 (CVV) ou procure o RH diretamente.');
        botao.disabled = false;
        botao.textContent = 'Enviar com segurança';
      });
  });

  $('copiar-protocolo').addEventListener('click', function () {
    var texto = $('protocolo').textContent;
    var botao = this;
    function ok() {
      botao.textContent = 'Copiado ✓';
      setTimeout(function () { botao.textContent = 'Copiar protocolo'; }, 2500);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(texto).then(ok, function () {});
    } else {
      var area = document.createElement('textarea');
      area.value = texto;
      document.body.appendChild(area);
      area.select();
      try { document.execCommand('copy'); ok(); } catch (e) {}
      document.body.removeChild(area);
    }
  });
})();
