(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };

  var ROTULOS = {
    novo: 'Recebido — aguardando triagem da equipe',
    em_acolhimento: 'Em acolhimento — a equipe está cuidando do seu contato',
    encaminhado: 'Encaminhado para atendimento especializado',
    concluido: 'Concluído',
  };

  // O Postgres devolve ISO com fuso; o formato antigo, sem fuso, é tratado como UTC.
  function dataBR(iso) {
    if (!iso) return '—';
    var texto = String(iso);
    if (texto.indexOf('T') === -1 && !/[+-]\d{2}:?\d{2}$|Z$/.test(texto)) {
      texto = texto.replace(' ', 'T') + 'Z';
    }
    var d = new Date(texto);
    return isNaN(d.getTime()) ? iso : d.toLocaleString('pt-BR');
  }

  function mostrarErro(mensagem) {
    $('erro').textContent = mensagem;
    $('erro').hidden = false;
    $('resultado').hidden = true;
  }

  function consultar(codigo) {
    $('erro').hidden = true;
    fetch('/api/protocolo/' + encodeURIComponent(codigo))
      .then(function (r) {
        return r.json().then(function (d) {
          if (!r.ok) throw new Error(d.erro || 'Não foi possível consultar.');
          return d;
        });
      })
      .then(function (dados) {
        $('linha-status').innerHTML =
          '<strong>' + (ROTULOS[dados.status] || dados.status) + '</strong><br>' +
          'Protocolo ' + dados.protocolo + ' · registrado em ' + dataBR(dados.criado_em) +
          ' · última movimentação em ' + dataBR(dados.atualizado_em);

        var caixa = $('mensagens');
        caixa.textContent = '';
        $('sem-mensagens').hidden = dados.mensagens.length > 0;

        dados.mensagens.forEach(function (m) {
          var bloco = document.createElement('div');
          bloco.className = 'destaque';
          bloco.style.marginTop = '14px';
          bloco.style.fontWeight = '400';

          var quando = document.createElement('p');
          quando.className = 'discreto';
          quando.style.margin = '0 0 6px';
          quando.style.fontSize = '13px';
          quando.textContent = 'Equipe de acolhimento · ' + dataBR(m.criado_em);

          var texto = document.createElement('p');
          texto.style.margin = '0';
          texto.style.whiteSpace = 'pre-wrap';
          texto.textContent = m.texto; // textContent: nunca interpreta HTML

          bloco.appendChild(quando);
          bloco.appendChild(texto);
          caixa.appendChild(bloco);
        });

        $('resultado').hidden = false;
      })
      .catch(function (erro) { mostrarErro(erro.message); });
  }

  $('busca').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var codigo = $('codigo').value.trim().toUpperCase();
    if (!codigo) return mostrarErro('Digite o número de protocolo.');
    consultar(codigo);
  });

  var inicial = new URLSearchParams(location.search).get('codigo');
  if (inicial) {
    $('codigo').value = inicial.toUpperCase();
    consultar(inicial);
  }
})();
