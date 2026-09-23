// Preferência de tema. Guarda só "claro"/"escuro" — nada do conteúdo do formulário
// vai para o navegador, para não deixar rastro em computador compartilhado.
(function () {
  'use strict';
  var raiz = document.documentElement;
  try {
    var salvo = localStorage.getItem('canal-tema');
    if (salvo === 'claro' || salvo === 'escuro') raiz.setAttribute('data-tema', salvo);
  } catch (e) { /* modo privado ou cookies bloqueados */ }

  document.addEventListener('click', function (ev) {
    var botao = ev.target.closest && ev.target.closest('#btn-tema');
    if (!botao) return;
    var escuro =
      raiz.getAttribute('data-tema') === 'escuro' ||
      (!raiz.hasAttribute('data-tema') &&
        window.matchMedia('(prefers-color-scheme: dark)').matches);
    var novo = escuro ? 'claro' : 'escuro';
    raiz.setAttribute('data-tema', novo);
    try { localStorage.setItem('canal-tema', novo); } catch (e) {}
  });
})();
