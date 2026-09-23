/**
 * Autenticação contra o Supabase Auth usando apenas fetch.
 *
 * Não carregamos o SDK por CDN de propósito: isso obrigaria a afrouxar a
 * CSP (script-src) e colocaria um script de terceiros na mesma página que
 * exibe relatos de saúde mental. São ~80 linhas para evitar isso.
 *
 * O access_token fica em sessionStorage: some ao fechar a aba, o que é o
 * comportamento certo num computador compartilhado de obra.
 */
window.Auth = (function () {
  'use strict';

  var CHAVE = 'canal-sessao';
  var cfg = null;
  var sessao = null;

  try {
    sessao = JSON.parse(sessionStorage.getItem(CHAVE) || 'null');
  } catch (e) {
    sessao = null;
  }

  function guardar(dados) {
    sessao = dados;
    try {
      if (dados) sessionStorage.setItem(CHAVE, JSON.stringify(dados));
      else sessionStorage.removeItem(CHAVE);
    } catch (e) { /* modo privado */ }
  }

  function carregarConfig() {
    if (cfg) return Promise.resolve(cfg);
    return fetch('/api/config')
      .then(function (r) { return r.json(); })
      .then(function (dados) { cfg = dados; return cfg; });
  }

  function chamarAuth(caminho, corpo, token) {
    return carregarConfig().then(function (c) {
      var cabecalhos = { 'Content-Type': 'application/json', apikey: c.supabaseAnonKey };
      if (token) cabecalhos.Authorization = 'Bearer ' + token;
      return fetch(c.supabaseUrl + '/auth/v1' + caminho, {
        method: corpo ? 'POST' : 'GET',
        headers: cabecalhos,
        body: corpo ? JSON.stringify(corpo) : undefined,
      }).then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (d) {
          if (!r.ok) throw new Error(traduzir(d));
          return d;
        });
      });
    });
  }

  // As mensagens do Supabase vêm em inglês; quem usa o painel não deveria vê-las.
  function traduzir(d) {
    var m = (d.error_description || d.msg || d.message || '').toLowerCase();
    if (m.indexOf('invalid login') !== -1) return 'E-mail ou senha incorretos.';
    if (m.indexOf('email not confirmed') !== -1) return 'Acesso ainda não confirmado. Fale com o administrador.';
    if (m.indexOf('rate limit') !== -1 || m.indexOf('too many') !== -1) {
      return 'Muitas tentativas. Aguarde alguns minutos.';
    }
    if (m.indexOf('should be at least') !== -1 || m.indexOf('password') !== -1) {
      return 'A senha precisa ter ao menos 10 caracteres.';
    }
    return 'Não foi possível concluir. Tente novamente.';
  }

  return {
    config: carregarConfig,

    entrar: function (email, senha) {
      return chamarAuth('/token?grant_type=password', { email: email, password: senha })
        .then(function (d) {
          guardar({ token: d.access_token, refresh: d.refresh_token, ate: Date.now() + (d.expires_in - 60) * 1000 });
          return d;
        });
    },

    sair: function () {
      var token = sessao && sessao.token;
      guardar(null);
      if (!token) return Promise.resolve();
      return chamarAuth('/logout', {}, token).catch(function () {});
    },

    /** Devolve um token válido, renovando quando perto de expirar. */
    token: function () {
      if (!sessao) return Promise.reject(new Error('sem sessão'));
      if (Date.now() < sessao.ate) return Promise.resolve(sessao.token);
      return chamarAuth('/token?grant_type=refresh_token', { refresh_token: sessao.refresh })
        .then(function (d) {
          guardar({ token: d.access_token, refresh: d.refresh_token, ate: Date.now() + (d.expires_in - 60) * 1000 });
          return d.access_token;
        })
        .catch(function (e) { guardar(null); throw e; });
    },

    temSessao: function () { return Boolean(sessao); },

    trocarSenha: function (nova) {
      return this.token().then(function (token) {
        return carregarConfig().then(function (c) {
          return fetch(c.supabaseUrl + '/auth/v1/user', {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              apikey: c.supabaseAnonKey,
              Authorization: 'Bearer ' + token,
            },
            body: JSON.stringify({ password: nova }),
          }).then(function (r) {
            return r.json().catch(function () { return {}; }).then(function (d) {
              if (!r.ok) throw new Error(traduzir(d));
              return d;
            });
          });
        });
      });
    },

    /** Envia o e-mail de redefinição (link volta para /painel/nova-senha.html). */
    recuperar: function (email) {
      return chamarAuth('/recover', {
        email: email,
        gotrue_meta_security: {},
      });
    },

    /** Define a senha a partir do token que veio no link do e-mail. */
    definirComToken: function (token, nova) {
      return carregarConfig().then(function (c) {
        return fetch(c.supabaseUrl + '/auth/v1/user', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            apikey: c.supabaseAnonKey,
            Authorization: 'Bearer ' + token,
          },
          body: JSON.stringify({ password: nova }),
        }).then(function (r) {
          return r.json().catch(function () { return {}; }).then(function (d) {
            if (!r.ok) throw new Error(traduzir(d));
            return d;
          });
        });
      });
    },
  };
})();
