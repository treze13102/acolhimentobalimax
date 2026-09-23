(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };

  // O Supabase devolve o token no fragmento da URL (#access_token=...).
  // Fragmento não é enviado ao servidor nem entra em log de acesso.
  var frag = new URLSearchParams(location.hash.replace(/^#/, ''));
  var token = frag.get('access_token');
  var tipo = frag.get('type');
  var erroLink = frag.get('error_description');

  // Limpa a barra de endereços para o token não ficar visível nem no histórico.
  if (location.hash) history.replaceState(null, '', location.pathname);

  function falhar(mensagem) {
    $('erro').textContent = mensagem;
    $('erro').hidden = false;
    $('campos').hidden = true;
  }

  if (erroLink) {
    falhar('Este link expirou ou já foi usado. Peça um novo em "Esqueci minha senha".');
  } else if (!token || tipo !== 'recovery') {
    falhar('Abra esta página pelo link enviado ao seu e-mail.');
  }

  $('form').addEventListener('submit', function (ev) {
    ev.preventDefault();
    $('erro').hidden = true;

    if ($('nova').value !== $('conf').value) {
      $('erro').textContent = 'As senhas digitadas não são iguais.';
      $('erro').hidden = false;
      return;
    }
    if ($('nova').value.length < 10) {
      $('erro').textContent = 'A senha precisa ter ao menos 10 caracteres.';
      $('erro').hidden = false;
      return;
    }

    Auth.definirComToken(token, $('nova').value)
      .then(function () {
        $('campos').hidden = true;
        $('ajuda').textContent = 'Senha alterada. Você já pode entrar no painel.';
      })
      .catch(function (erro) {
        $('erro').textContent = erro.message;
        $('erro').hidden = false;
      });
  });
})();
