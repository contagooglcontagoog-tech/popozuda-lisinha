/**
 * Popozuda × Dice — Checkout PIX
 * Intercepta o carrinho Shopify e redireciona para pagamento Dice.
 */

/* ── Bloqueia Doran SDK antes dos scripts defer rodarem ────────────────────
   drv-sdk.js é defer e checa window.$svDoranInit.sdkURL para carregar drv-app.js
   (que recria os círculos em 3 linhas). Nosso script inline roda primeiro.  */
(function () {
  var doran = window.$svDoranInit;
  if (doran) {
    doran.sdkURL  = undefined;
    doran.widgets = [];
  }
  /* Intercepta atribuições futuras de sdkURL (bloco Shopify que roda depois) */
  try {
    Object.defineProperty(window, '$svDoranInit', {
      get: function () { return doran; },
      set: function (v) {
        if (v) { v.sdkURL = undefined; v.widgets = []; }
        doran = v;
      },
      configurable: true,
    });
  } catch (_) {}
})();

(function () {
  'use strict';

  /* ── Catálogo de variantes → produtos ── */
  var PRODUTOS = {
    '48961856504035': { nome: 'Creme Popozuda',         preco: 119.90, img: 'https://popozuda.com.br/cdn/shop/files/Creme_ef5f5c0e-822b-4207-ab06-fdedad93aa9c.webp' },
    '48843070963939': { nome: 'Lisinha',                preco: 39.90,  img: 'https://popozuda.com.br/cdn/shop/files/Lisinha_bb9f1b3e-7628-4029-85a3-aab539943ce9.webp' },
    '48843070537955': { nome: 'Spray Popozuda',         preco: 129.90, img: 'https://popozuda.com.br/cdn/shop/files/Spray_5b4488c6-58fa-45a7-9347-2e649b0c80e1.webp' },
    '48843071652067': { nome: 'Body Splash Sedutora',   preco: 69.90,  img: 'https://popozuda.com.br/cdn/shop/files/Sedutora_2a119351-00ba-42dd-8941-ab331e515233.webp' },
    '48997600657635': { nome: 'Combo Popozuda',         preco: 329.90, img: 'https://popozuda.com.br/cdn/shop/files/Creme_ef5f5c0e-822b-4207-ab06-fdedad93aa9c.webp' },
    '48997255151843': { nome: 'Creme + Spray Popozuda', preco: 199.90, img: 'https://popozuda.com.br/cdn/shop/files/Creme_ef5f5c0e-822b-4207-ab06-fdedad93aa9c.webp' },
    '48997322064099': { nome: 'Creme, Spray e Lisinha', preco: 269.90, img: 'https://popozuda.com.br/cdn/shop/files/Creme_ef5f5c0e-822b-4207-ab06-fdedad93aa9c.webp' },
  };

  /* ── Mapa slug → variantId (para links /products/slug) ── */
  var SLUG_MAP = {
    'poppzuda-cream':        '48961856504035',
    'lisinha':               '48843070963939',
    'spray-popozuda':        '48843070537955',
    'body-splash-sedutora':  '48843071652067',
    'combo-popozuda':        '48997600657635',
    'creme-e-spray-popozuda':'48997255151843',
    'creme-spray-e-lisinha': '48997322064099',
  };

  /* ── Preços especiais Lisinha (bundle 1/2/3 unidades) ── */
  var LISINHA_VARIANT = '48843070963939';
  var LISINHA_BUNDLE  = { 1: 39.90, 2: 79.90, 3: 119.90 };

  var FRETE = 0; /* Popozuda oferece frete grátis */
  var COR   = '#9d123f';

  /* estado */
  var cart      = [];       /* [{variantId, nome, preco, qty}] */
  var pixText   = '';
  var pixId     = null;
  var pollingTO = null;
  var timerTO   = null;
  var etapa     = 1;

  /* ── Utilitários ── */
  function fmt(v) {
    return 'R$ ' + v.toFixed(2).replace('.', ',');
  }
  function totalCart() {
    return cart.reduce(function (s, i) { return s + i.preco * i.qty; }, 0) + FRETE;
  }
  function subtotalCart() {
    return cart.reduce(function (s, i) { return s + i.preco * i.qty; }, 0);
  }

  /* ── Injeção de estilos ── */
  function injectCSS() {
    var style = document.createElement('style');
    style.textContent = [
      ':root { --pz: ' + COR + '; --pz-light: #fce8ef; --pz-dark: #7a0d30; }',

      /* fix overflow-x global */
      'html,body { max-width:100%;overflow-x:hidden; }',

      /* overlay */
      '.pz-overlay { position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9998;opacity:0;visibility:hidden;transition:opacity .3s; }',
      '.pz-overlay.on { opacity:1;visibility:visible; }',

      /* drawer */
      '.pz-drawer { position:fixed;top:0;right:-110%;width:100%;max-width:420px;height:100%;height:100dvh;background:#fff;z-index:9999;transition:right .35s cubic-bezier(.4,0,.2,1);display:flex;flex-direction:column;box-shadow:-4px 0 24px rgba(0,0,0,.14); }',
      '.pz-drawer.on { right:0; }',
      '.pz-dhead { display:flex;justify-content:space-between;align-items:center;padding:18px 20px;border-bottom:1px solid #eee; }',
      '.pz-dhead h3 { font-size:1.05em;font-weight:700;margin:0; }',
      '.pz-dclose { background:none;border:none;font-size:1.4em;cursor:pointer;color:#888;padding:8px;min-width:44px;min-height:44px;display:flex;align-items:center;justify-content:center; }',
      '.pz-dbody { flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:16px 20px; }',
      '.pz-empty { text-align:center;padding:60px 20px;color:#aaa; }',
      '.pz-empty svg { width:48px;height:48px;fill:#ddd;margin-bottom:12px; }',
      '.pz-item { display:flex;gap:12px;padding:14px 0;border-bottom:1px solid #eee;align-items:flex-start; }',
      '.pz-item-img { width:72px;height:72px;border-radius:10px;object-fit:cover;flex-shrink:0;background:#f3f3f3; }',
      '.pz-item-info { flex:1;min-width:0; }',
      '.pz-item-name { font-weight:600;font-size:.9em;margin-bottom:6px;line-height:1.3; }',
      '.pz-item-price { font-weight:700;color:var(--pz);font-size:1em; }',
      '.pz-qty { display:flex;align-items:center;gap:8px;margin-bottom:6px; }',
      '.pz-qty-btn { width:36px;height:36px;border:1.5px solid #ddd;border-radius:6px;background:#f7f7f7;cursor:pointer;font-size:1em;font-weight:700;display:flex;align-items:center;justify-content:center;transition:border-color .15s;touch-action:manipulation; }',
      '.pz-qty-btn:hover { border-color:var(--pz);color:var(--pz); }',
      '.pz-qty-btn:disabled { opacity:.35;pointer-events:none; }',
      '.pz-qty-num { font-size:.95em;font-weight:700;min-width:22px;text-align:center; }',
      '.pz-dfooter { padding:16px 20px;padding-bottom:max(16px,env(safe-area-inset-bottom));border-top:1px solid #eee; }',
      '.pz-totals-row { display:flex;justify-content:space-between;font-size:.88em;color:#666;margin-bottom:6px; }',
      '.pz-totals-row.grand { font-size:1.08em;font-weight:700;color:#222;border-top:1px solid #eee;padding-top:10px;margin-top:4px; }',
      '.pz-totals-row.grand span:last-child { color:var(--pz); }',
      '.pz-btn-ck { display:block;width:100%;padding:16px;min-height:52px;background:var(--pz);color:#fff;border:none;border-radius:50px;font-size:.97em;font-weight:700;letter-spacing:.5px;text-transform:uppercase;cursor:pointer;margin-top:14px;transition:box-shadow .2s;touch-action:manipulation; }',
      '.pz-btn-ck:hover { box-shadow:0 6px 20px rgba(157,18,63,.35); }',

      /* modal checkout */
      '.pz-modal-wrap { display:none;position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,.6);align-items:flex-end;overflow-y:auto; }',
      '.pz-modal-wrap.on { display:flex; }',
      '@media(min-width:580px) { .pz-modal-wrap { align-items:center;justify-content:center;padding:20px; } }',
      '.pz-modal { background:#fff;width:100%;max-width:500px;max-height:100dvh;overflow-y:auto;-webkit-overflow-scrolling:touch;border-radius:20px 20px 0 0;position:relative; }',
      '@media(min-width:580px) { .pz-modal { border-radius:16px;max-height:92dvh; } }',
      '.pz-mhead { position:sticky;top:0;background:#fff;padding:14px 16px;border-bottom:1px solid #eee;display:flex;justify-content:space-between;align-items:center;z-index:2; }',
      '@media(min-width:580px) { .pz-mhead { padding:16px 20px; } }',
      '.pz-mhead-title { font-size:1em;font-weight:700; }',
      '.pz-mclose { width:36px;height:36px;min-width:36px;border:none;background:#f3f3f3;border-radius:50%;cursor:pointer;font-size:.95em;color:#666;display:flex;align-items:center;justify-content:center;touch-action:manipulation; }',
      '.pz-steps { display:flex;border-bottom:1px solid #eee; }',
      '.pz-step { flex:1;text-align:center;padding:11px 0;font-size:.72em;font-weight:600;text-transform:uppercase;letter-spacing:.07em;color:#aaa;border-bottom:2px solid transparent;transition:all .2s; }',
      '.pz-step.active { color:var(--pz);border-color:var(--pz); }',
      '.pz-step.done { color:var(--pz); }',
      '.pz-mbody { padding:18px 14px;padding-bottom:max(18px,env(safe-area-inset-bottom)); }',
      '@media(min-width:400px) { .pz-mbody { padding:22px 20px; } }',
      '.pz-stage { display:none; }',
      '.pz-stage.show { display:block; }',

      /* form */
      '.pz-summary { border:1px solid #eee;border-radius:10px;padding:14px;margin-bottom:18px; }',
      '.pz-sum-row { display:flex;justify-content:space-between;font-size:.88em;color:#666;padding:5px 0; }',
      '.pz-sum-row.grand { font-weight:700;color:#222;font-size:1em;border-top:1px solid #eee;margin-top:5px;padding-top:10px; }',
      '.pz-sum-row.grand span:last-child { color:var(--pz);font-size:1.15em; }',
      '.pz-fg { margin-bottom:13px; }',
      '.pz-fg label { display:block;font-size:.78em;font-weight:600;color:#888;margin-bottom:4px;letter-spacing:.03em; }',
      '.pz-inp { width:100%;border:1.5px solid #ddd;border-radius:9px;padding:12px 13px;font-size:16px;color:#222;background:#f8f8f8;outline:none;transition:border-color .2s;font-family:inherit;-webkit-appearance:none;box-sizing:border-box; }',
      '.pz-inp:focus { border-color:var(--pz);background:#fff; }',
      '.pz-inp.err { border-color:#e53935;background:#fff8f8; }',
      '.pz-row2 { display:grid;grid-template-columns:1fr 1fr;gap:10px; }',
      '@media(max-width:400px) { .pz-row2 { grid-template-columns:1fr; } }',
      '.pz-cep-g { display:flex;gap:8px; }',
      '.pz-cep-g .pz-inp { flex:1;min-width:0; }',
      '.pz-btn-cep { flex-shrink:0;border:1.5px solid #ddd;border-radius:9px;padding:0 14px;min-height:48px;background:#f3f3f3;font-size:.82em;font-weight:600;color:#666;cursor:pointer;font-family:inherit;white-space:nowrap;touch-action:manipulation; }',
      '.pz-actions { display:flex;gap:10px;margin-top:18px;padding-top:14px;border-top:1px solid #eee; }',
      '.pz-btn-back { flex-shrink:0;border:1.5px solid #ddd;border-radius:50px;padding:14px 16px;min-height:52px;background:none;font-size:.87em;font-weight:600;color:#888;cursor:pointer;font-family:inherit;touch-action:manipulation; }',
      '.pz-btn-next { flex:1;border:none;border-radius:50px;padding:15px;min-height:52px;background:var(--pz);color:#fff;font-size:.93em;font-weight:700;letter-spacing:.5px;text-transform:uppercase;cursor:pointer;transition:box-shadow .2s;font-family:inherit;touch-action:manipulation; }',
      '.pz-btn-next:hover { box-shadow:0 4px 16px rgba(157,18,63,.35); }',
      '.pz-btn-next:disabled { opacity:.5;pointer-events:none; }',
      '.pz-obrig { color:var(--pz); }',

      /* PIX */
      '.pz-pix-wrap { text-align:center;padding:6px 0; }',
      '.pz-pix-amount { font-size:2.2em;font-weight:700;color:var(--pz);letter-spacing:-.02em;line-height:1; }',
      '@media(min-width:400px) { .pz-pix-amount { font-size:2.5em; } }',
      '.pz-pix-sub { font-size:.86em;color:#888;margin:6px 0 22px; }',
      '.pz-pix-load { display:flex;flex-direction:column;align-items:center;gap:14px;padding:36px 0; }',
      '.pz-spinner { width:38px;height:38px;border:3px solid #eee;border-top-color:var(--pz);border-radius:50%;animation:pzspin .8s linear infinite; }',
      '@keyframes pzspin { to { transform:rotate(360deg); } }',
      '.pz-pix-load p { font-size:.86em;color:#888; }',
      '#pz-qr-wrap { display:none; }',
      '.pz-timer { display:none;align-items:center;justify-content:center;gap:8px;background:#fff8e1;border:1px solid #ffb300;border-radius:9px;padding:8px 14px;margin-bottom:14px;font-size:.82em;font-weight:600;color:#7b5600; }',
      '.pz-timer.on { display:flex; }',
      '.pz-timer-val { color:#c0392b;font-family:monospace;font-size:1.1em; }',
      '#pz-qrcode { width:180px;height:180px;margin:0 auto 16px;padding:8px;background:#fff;border:1px solid #eee;border-radius:12px; }',
      '@media(min-width:400px) { #pz-qrcode { width:200px;height:200px;padding:10px; } }',
      '#pz-qrcode img,#pz-qrcode canvas { max-width:100%;height:auto; }',
      '.pz-code-box { background:#f5f5f5;border:1px solid #eee;border-radius:9px;padding:9px 12px;font-family:monospace;font-size:.74em;color:#888;word-break:break-all;text-align:left;margin-bottom:12px;max-height:52px;overflow:hidden; }',
      '.pz-btn-copy { display:block;width:100%;padding:15px;min-height:52px;background:#222;color:#fff;border:none;border-radius:50px;font-size:.92em;font-weight:700;letter-spacing:.5px;text-transform:uppercase;cursor:pointer;transition:background .2s;margin-bottom:18px;font-family:inherit;touch-action:manipulation; }',
      '.pz-btn-copy.ok { background:#27ae60; }',
      '.pz-pix-steps { text-align:left;border:1px solid #eee;border-radius:10px;overflow:hidden; }',
      '.pz-pix-step { display:flex;gap:12px;align-items:flex-start;padding:11px 14px;border-bottom:1px solid #eee;font-size:.86em;color:#666; }',
      '.pz-pix-step:last-child { border-bottom:none; }',
      '.pz-pix-n { flex-shrink:0;width:22px;height:22px;background:var(--pz);color:#fff;border-radius:50%;font-size:.74em;font-weight:700;display:flex;align-items:center;justify-content:center; }',
      '#pz-pix-err { display:none;text-align:center;padding:28px 0; }',
      '#pz-pix-err p { font-size:.86em;color:#e53935;margin:8px 0 16px; }',
      '.pz-btn-retry { background:#f3f3f3;border:1.5px solid #ddd;border-radius:50px;padding:12px 22px;min-height:48px;font-size:.86em;font-weight:600;color:#444;cursor:pointer;font-family:inherit;touch-action:manipulation; }',

      /* confirmação */
      '.pz-done { text-align:center;padding:40px 16px; }',
      '@media(min-width:400px) { .pz-done { padding:50px 20px; } }',
      '.pz-done-icon { font-size:3.2em;margin-bottom:16px; }',
      '.pz-done h3 { font-size:1.35em;font-weight:700;margin-bottom:10px; }',
      '@media(min-width:400px) { .pz-done h3 { font-size:1.45em; } }',
      '.pz-done p { color:#888;font-size:.93em;line-height:1.7; }',
      '.pz-btn-done { margin-top:22px;background:var(--pz);color:#fff;border:none;border-radius:50px;padding:14px 34px;min-height:52px;font-size:.93em;font-weight:700;cursor:pointer;font-family:inherit;touch-action:manipulation; }',

      /* cart badge — fica no canto inferior direito no mobile */
      '.pz-cart-badge { position:fixed;bottom:calc(20px + env(safe-area-inset-bottom));right:16px;z-index:9997;background:var(--pz);color:#fff;border-radius:50px;padding:12px 18px;font-size:.82em;font-weight:700;cursor:pointer;box-shadow:0 4px 16px rgba(157,18,63,.35);transition:transform .2s,box-shadow .2s;display:none;align-items:center;gap:7px;touch-action:manipulation; }',
      '@media(min-width:768px) { .pz-cart-badge { top:12px;bottom:auto;right:16px; } }',
      '.pz-cart-badge.show { display:flex; }',
      '.pz-cart-badge:hover { transform:scale(1.05);box-shadow:0 6px 20px rgba(157,18,63,.45); }',

      /* ── Polyfill: corrige image-zoom-reveal e .loading (Shopify fora do ambiente nativo) ── */
      /* Shopify theme: .image-zoom-reveal .media__image { opacity:0 } */
      /* Shopify theme: .media__image.loading { opacity:0 } */
      '.image-zoom-reveal.loaded .media__image { opacity:1 !important; transform:none !important; }',
      '.media__image.loaded { opacity:1 !important; }',
      /* Fallback nuclear: após 2s, força todas as imagens com src a aparecer */
      '@keyframes pz-reveal { to { opacity:1 !important; transform:none !important; } }',
      '.image-zoom-reveal .media__image[src] { animation: pz-reveal 0.01s 2s ease forwards; }',
      '.media__image.loading[src]:not(svg) { animation: pz-reveal 0.01s 2s ease forwards; }',

      /* ── Doran Shoppable Videos: exibe HTML capturado como linha horizontal rolável ── */
      /* SDK bloqueado — o HTML capturado tem slides como divs em bloco; forçamos flex row */
      '.drv-stories-wrapper { overflow:hidden !important; }',
      '.drv-stories-wrapper .drv-swiper-wrapper { display:flex !important; flex-direction:row !important; flex-wrap:nowrap !important; overflow-x:auto !important; overflow-y:hidden !important; gap:10px !important; padding:8px 16px !important; }',
      '.drv-swiper-slide { flex-shrink:0 !important; width:75px !important; }',
      /* Esconde "Powered by Doran" branding */
      '.drv-brand-mark { display:none !important; }',
    ].join('\n');
    document.head.appendChild(style);
  }

  /* ── Injeção de HTML ── */
  function injectHTML() {
    var html = [
      /* overlay */
      '<div class="pz-overlay" id="pz-overlay"></div>',

      /* floating badge */
      '<div class="pz-cart-badge" id="pz-badge" onclick="pzAbrirDrawer()">',
      '  <svg viewBox="0 0 24 24" width="16" height="16" fill="#fff"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4zM3 6h18M16 10a4 4 0 01-8 0"/></svg>',
      '  <span id="pz-badge-txt">Ver Carrinho</span>',
      '</div>',

      /* drawer */
      '<div class="pz-drawer" id="pz-drawer">',
      '  <div class="pz-dhead">',
      '    <h3>Seu Carrinho</h3>',
      '    <button class="pz-dclose" onclick="pzFecharDrawer()">✕</button>',
      '  </div>',
      '  <div class="pz-dbody" id="pz-dbody">',
      '    <div class="pz-empty">',
      '      <svg viewBox="0 0 24 24"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4zM3 6h18M16 10a4 4 0 01-8 0"/></svg>',
      '      <p>Seu carrinho está vazio.</p>',
      '    </div>',
      '  </div>',
      '  <div class="pz-dfooter" id="pz-dfooter" style="display:none">',
      '    <div class="pz-totals-row"><span>Subtotal</span><span id="pz-sub">R$ 0,00</span></div>',
      '    <div class="pz-totals-row"><span>Frete</span><span>Grátis</span></div>',
      '    <div class="pz-totals-row grand"><span>Total</span><span id="pz-total">R$ 0,00</span></div>',
      '    <button class="pz-btn-ck" onclick="pzAbrirModal()">Finalizar Compra →</button>',
      '  </div>',
      '</div>',

      /* modal */
      '<div class="pz-modal-wrap" id="pz-modal-wrap">',
      '  <div class="pz-modal">',
      '    <div class="pz-mhead">',
      '      <span class="pz-mhead-title" id="pz-modal-title">Finalize seu pedido</span>',
      '      <button class="pz-mclose" onclick="pzFecharModal()">✕</button>',
      '    </div>',
      '    <div class="pz-steps">',
      '      <div class="pz-step active" id="pz-s1">Entrega</div>',
      '      <div class="pz-step" id="pz-s2">Pagamento</div>',
      '      <div class="pz-step" id="pz-s3">Confirmação</div>',
      '    </div>',
      '    <div class="pz-mbody">',

      /* Etapa 1 */
      '      <div class="pz-stage show" id="pz-e1">',
      '        <div class="pz-summary" id="pz-ck-summary"></div>',
      '        <div class="pz-fg"><label>Nome completo <span class="pz-obrig">*</span></label>',
      '          <input id="pz-nome" type="text" class="pz-inp" placeholder="Seu nome completo" autocomplete="name" /></div>',
      '        <div class="pz-row2">',
      '          <div class="pz-fg"><label>Telefone <span class="pz-obrig">*</span></label>',
      '            <input id="pz-tel" type="tel" class="pz-inp" placeholder="(11) 99999-9999" inputmode="numeric" /></div>',
      '          <div class="pz-fg"><label>CPF <span class="pz-obrig">*</span></label>',
      '            <input id="pz-cpf" type="text" class="pz-inp" placeholder="000.000.000-00" inputmode="numeric" maxlength="14" /></div>',
      '        </div>',
      '        <div class="pz-fg"><label>E-mail <span class="pz-obrig">*</span></label>',
      '          <input id="pz-email" type="email" class="pz-inp" placeholder="seu@email.com" autocomplete="email" /></div>',
      '        <div class="pz-fg"><label>CEP <span class="pz-obrig">*</span></label>',
      '          <div class="pz-cep-g">',
      '            <input id="pz-cep" type="text" class="pz-inp" placeholder="00000-000" inputmode="numeric" maxlength="9" />',
      '            <button class="pz-btn-cep" id="pz-btn-cep" onclick="pzBuscarCep()">Buscar</button>',
      '          </div></div>',
      '        <div class="pz-fg"><label>Endereço <span class="pz-obrig">*</span></label>',
      '          <input id="pz-rua" type="text" class="pz-inp" placeholder="Rua / Avenida" /></div>',
      '        <div class="pz-row2">',
      '          <div class="pz-fg"><label>Número <span class="pz-obrig">*</span></label>',
      '            <input id="pz-num" type="text" class="pz-inp" placeholder="123" inputmode="numeric" /></div>',
      '          <div class="pz-fg"><label>Complemento</label>',
      '            <input id="pz-comp" type="text" class="pz-inp" placeholder="Apto, Bloco…" /></div>',
      '        </div>',
      '        <div class="pz-row2">',
      '          <div class="pz-fg"><label>Bairro <span class="pz-obrig">*</span></label>',
      '            <input id="pz-bairro" type="text" class="pz-inp" placeholder="Bairro" /></div>',
      '          <div class="pz-fg"><label>Cidade <span class="pz-obrig">*</span></label>',
      '            <input id="pz-cidade" type="text" class="pz-inp" placeholder="Cidade" /></div>',
      '        </div>',
      '        <div class="pz-fg"><label>Estado <span class="pz-obrig">*</span></label>',
      '          <select id="pz-estado" class="pz-inp">',
      '            <option value="">Selecione</option>',
      '            <option>AC</option><option>AL</option><option>AP</option><option>AM</option>',
      '            <option>BA</option><option>CE</option><option>DF</option><option>ES</option>',
      '            <option>GO</option><option>MA</option><option>MT</option><option>MS</option>',
      '            <option>MG</option><option>PA</option><option>PB</option><option>PR</option>',
      '            <option>PE</option><option>PI</option><option>RJ</option><option>RN</option>',
      '            <option>RS</option><option>RO</option><option>RR</option><option>SC</option>',
      '            <option>SP</option><option>SE</option><option>TO</option>',
      '          </select></div>',
      '        <div class="pz-actions">',
      '          <button class="pz-btn-next" onclick="pzAvancarEtapa1()">Ir para pagamento →</button>',
      '        </div>',
      '      </div>',

      /* Etapa 2 - PIX */
      '      <div class="pz-stage" id="pz-e2">',
      '        <div class="pz-pix-wrap">',
      '          <div class="pz-pix-amount" id="pz-pix-amount">R$ 0,00</div>',
      '          <p class="pz-pix-sub">Pague via PIX — confirmação imediata</p>',
      '          <div class="pz-pix-load" id="pz-pix-load">',
      '            <div class="pz-spinner"></div><p>Gerando seu QR Code…</p>',
      '          </div>',
      '          <div id="pz-qr-wrap">',
      '            <div class="pz-timer" id="pz-timer"><span>⏱ Válido por:</span><strong class="pz-timer-val" id="pz-timer-val">30:00</strong></div>',
      '            <div id="pz-qrcode"></div>',
      '            <div class="pz-code-box" id="pz-code"></div>',
      '            <button class="pz-btn-copy" id="pz-btn-copy" onclick="pzCopiarPix()">Copiar Código PIX</button>',
      '            <div class="pz-pix-steps">',
      '              <div class="pz-pix-step"><span class="pz-pix-n">1</span>Abra o app do seu banco e acesse o PIX</div>',
      '              <div class="pz-pix-step"><span class="pz-pix-n">2</span>Escolha "PIX Copia e Cola" ou escaneie o QR</div>',
      '              <div class="pz-pix-step"><span class="pz-pix-n">3</span>Confirme o valor e finalize o pagamento</div>',
      '              <div class="pz-pix-step"><span class="pz-pix-n">4</span>Pedido confirmado automaticamente em segundos</div>',
      '            </div>',
      '          </div>',
      '          <div id="pz-pix-err">',
      '            <div style="font-size:2em">⚠</div>',
      '            <p id="pz-pix-err-msg"></p>',
      '            <button class="pz-btn-retry" onclick="pzTentarNovamente()">Tentar novamente</button>',
      '          </div>',
      '        </div>',
      '        <div class="pz-actions" style="margin-top:18px">',
      '          <button class="pz-btn-back" onclick="pzIrEtapa(1)">← Voltar</button>',
      '        </div>',
      '      </div>',

      /* Etapa 3 - Confirmação */
      '      <div class="pz-stage" id="pz-e3">',
      '        <div class="pz-done">',
      '          <div class="pz-done-icon">✅</div>',
      '          <h3>Pagamento Confirmado!</h3>',
      '          <p>Seu pedido foi identificado e já está sendo preparado para envio.<br>Você receberá a confirmação por e-mail em breve. 💖</p>',
      '          <button class="pz-btn-done" onclick="pzFecharModal()">Fechar</button>',
      '        </div>',
      '      </div>',

      '    </div>',
      '  </div>',
      '</div>',
    ].join('\n');

    var div = document.createElement('div');
    div.innerHTML = html;
    document.body.appendChild(div);

    /* carregar QRCode.js se não existir */
    if (!window.QRCode) {
      var s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
      document.head.appendChild(s);
    }
  }

  /* ── Intercept Shopify cart ── */
  function extractVariantFromForm(form) {
    /* 1) input[name="id"] explícito */
    var idInput = form.querySelector('input[name="id"]');
    if (idInput && idInput.value) return String(idInput.value);
    /* 2) select ou input de variante */
    var varInput = form.querySelector('[name="variant_id"],[ref="variantId"]');
    if (varInput && varInput.value) return String(varInput.value);
    /* 3) FormData fallback */
    try {
      var fd = new FormData(form);
      return String(fd.get('id') || fd.get('variant_id') || '');
    } catch (_) { return ''; }
  }

  function interceptShopifyCart() {
    /* — Estratégia 1: captura submit do formulário antes do custom element — */
    document.addEventListener('submit', function (e) {
      var form = e.target;
      if (!form || form.getAttribute('data-type') !== 'add-to-cart-form') return;
      e.preventDefault();
      e.stopImmediatePropagation();
      var variantId = extractVariantFromForm(form);
      if (variantId && PRODUTOS[variantId]) {
        var nome  = PRODUTOS[variantId].nome;
        var preco = PRODUTOS[variantId].preco;
        /* Bundle pricing para Lisinha */
        if (variantId === LISINHA_VARIANT) {
          var qty   = getLisinhaBundleQty();
          preco = LISINHA_BUNDLE[qty] || preco;
          if (qty > 1) nome = nome + ' (' + qty + ' un.)';
        }
        pzAdicionarAoCarrinho(variantId, nome, preco);
      }
    }, true /* capture — dispara antes do custom element */);

    /* — Estratégia 2: click nos botões add-to-cart — */
    document.addEventListener('click', function (e) {
      var btn = e.target.closest('[name="add"],[data-add-to-cart],[aria-label*="carrinho"],[aria-label*="Comprar"]');
      if (btn) {
        var form = btn.closest('form[data-type="add-to-cart-form"]');
        if (form) {
          e.preventDefault();
          e.stopImmediatePropagation();
          var variantId = extractVariantFromForm(form);
          if (variantId && PRODUTOS[variantId]) {
            pzAdicionarAoCarrinho(variantId, PRODUTOS[variantId].nome, PRODUTOS[variantId].preco);
          }
          return;
        }
      }
      /* bloqueia /checkout e /cart */
      var link = e.target.closest('a[href]');
      if (link) {
        var href = link.getAttribute('href') || '';

        /* intercepta /products/slug — "Comprar agora" nos banners */
        if (href.indexOf('/products/') === 0) {
          e.preventDefault();
          e.stopImmediatePropagation();
          /* extrai variantId da URL ou via slug map */
          var variantId = null;
          var qm = href.indexOf('?variant=');
          if (qm !== -1) {
            variantId = href.slice(qm + 9).split('&')[0];
          } else {
            var slug = href.replace('/products/', '').split('?')[0];
            variantId = SLUG_MAP[slug] || null;
          }
          if (variantId && PRODUTOS[variantId]) {
            var prod = PRODUTOS[variantId];
            pzAdicionarAoCarrinho(variantId, prod.nome, prod.preco);
            /* abre checkout direto — comportamento "Comprar agora" */
            setTimeout(function () { pzAbrirModal(); }, 120);
          }
          return;
        }

        if (href === '/checkout' || href === '/cart' || href.indexOf('/checkout') === 0) {
          e.preventDefault();
          if (cart.length > 0) pzAbrirDrawer();
        }
      }
    }, true);

    /* — Estratégia 3: override fetch como camada extra — */
    var origFetch = window.fetch;
    var SHOPIFY_CART_RE = /\/(cart)(\/add|\/change|\/update|\/clear|\.js|\/sections)(\.js)?(\?|$)/;

    window.fetch = function (input, init) {
      var url = typeof input === 'string' ? input : (input && input.url) || '';

      /* Bloqueia chamadas à Storefront API do myshopify (kaching bundle busca preços aqui) */
      if (url && url.indexOf('myshopify.com') !== -1) {
        return Promise.resolve(new Response(JSON.stringify({}), {
          status: 200, headers: { 'Content-Type': 'application/json' }
        }));
      }

      /* Mocka chamadas Shopify que falhariam no clone (CORS / 404) */
      if (url && (SHOPIFY_CART_RE.test(url) || url.indexOf('popozuda.com.br/cart') !== -1)) {
        /* /cart/add com produto nosso: intercepta normalmente */
        if (url.indexOf('/cart/add') !== -1) {
          try {
            var body = init && init.body;
            var variantId = null;
            if (body instanceof FormData) {
              variantId = String(body.get('id') || body.get('variant_id') || '');
            } else if (typeof body === 'string') {
              try { var p = JSON.parse(body); variantId = String(p.id || p.variant_id || ''); }
              catch (_) { var m = body.match(/(?:^|&)id=(\d+)/); if (m) variantId = m[1]; }
            }
            if (variantId && PRODUTOS[variantId]) {
              pzAdicionarAoCarrinho(variantId, PRODUTOS[variantId].nome, PRODUTOS[variantId].preco);
              return Promise.resolve(new Response(JSON.stringify({
                items: [{ variant_id: parseInt(variantId), quantity: 1, price: PRODUTOS[variantId].preco * 100 }]
              }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
            }
          } catch (e) { console.warn('[Dice] fetch intercept err:', e); }
        }
        /* Todas as outras chamadas /cart/* → retorna carrinho vazio silenciosamente */
        return Promise.resolve(new Response(JSON.stringify({
          token: '', note: '', attributes: {}, total_price: 0, item_count: 0, items: [], sections: {}
        }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
      }

      return origFetch.apply(this, arguments);
    };

    /* Mesma proteção para XMLHttpRequest (alguns temas Shopify ainda usam XHR) */
    var OrigXHR = window.XMLHttpRequest;
    function PzXHR() {
      var xhr = new OrigXHR();
      var _open = xhr.open.bind(xhr);
      var _send = xhr.send.bind(xhr);
      var _url = '';
      xhr.open = function (method, url) { _url = url || ''; return _open.apply(xhr, arguments); };
      xhr.send = function () {
        if (_url && _url.indexOf('myshopify.com') !== -1) {
          var self = xhr;
          setTimeout(function () {
            Object.defineProperty(self, 'readyState',   { get: function () { return 4; }, configurable: true });
            Object.defineProperty(self, 'status',       { get: function () { return 200; }, configurable: true });
            Object.defineProperty(self, 'responseText', { get: function () { return '{}'; }, configurable: true });
            if (typeof self.onreadystatechange === 'function') self.onreadystatechange();
            self.dispatchEvent(new Event('readystatechange'));
            self.dispatchEvent(new Event('load'));
          }, 0);
          return;
        }
        if (_url && (SHOPIFY_CART_RE.test(_url) || _url.indexOf('popozuda.com.br/cart') !== -1)) {
          var self = xhr;
          setTimeout(function () {
            Object.defineProperty(self, 'readyState',  { get: function () { return 4; }, configurable: true });
            Object.defineProperty(self, 'status',      { get: function () { return 200; }, configurable: true });
            Object.defineProperty(self, 'responseText',{ get: function () { return '{"items":[],"item_count":0,"total_price":0,"sections":{}}'; }, configurable: true });
            if (typeof self.onreadystatechange === 'function') self.onreadystatechange();
            self.dispatchEvent(new Event('readystatechange'));
            self.dispatchEvent(new Event('load'));
          }, 0);
          return;
        }
        return _send.apply(xhr, arguments);
      };
      return xhr;
    }
    PzXHR.prototype = OrigXHR.prototype;
    window.XMLHttpRequest = PzXHR;
  }

  /* ── Funções de Cart ── */
  window.pzAdicionarAoCarrinho = function (variantId, nome, preco) {
    var prod = PRODUTOS[variantId] || {};
    var existente = cart.find(function (i) { return i.variantId === variantId; });
    if (existente) {
      existente.qty++;
    } else {
      cart.push({ variantId: variantId, nome: nome, preco: preco, qty: 1, img: prod.img || '' });
    }
    pzAtualizarBadge();
    pzRenderDrawer();
    /* Página de produto: abre checkout direto sem passar pelo drawer */
    if (window.location.pathname.indexOf('/products/') === 0) {
      pzAbrirModal();
    } else {
      pzAbrirDrawer();
    }
  };

  function pzAtualizarBadge() {
    var badge = document.getElementById('pz-badge');
    var txt   = document.getElementById('pz-badge-txt');
    if (!badge) return;
    var total = cart.reduce(function (s, i) { return s + i.qty; }, 0);
    if (total > 0) {
      badge.classList.add('show');
      if (txt) txt.textContent = total + (total === 1 ? ' item' : ' itens') + ' — ' + fmt(totalCart());
    } else {
      badge.classList.remove('show');
    }
  }

  function pzRenderDrawer() {
    var body   = document.getElementById('pz-dbody');
    var footer = document.getElementById('pz-dfooter');
    var sub    = document.getElementById('pz-sub');
    var tot    = document.getElementById('pz-total');
    if (!body) return;

    if (cart.length === 0) {
      body.innerHTML = '<div class="pz-empty"><svg viewBox="0 0 24 24" width="48" height="48" fill="#ddd"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4zM3 6h18M16 10a4 4 0 01-8 0"/></svg><p>Seu carrinho está vazio.</p></div>';
      if (footer) footer.style.display = 'none';
      return;
    }

    var html = '';
    cart.forEach(function (item, idx) {
      var imgTag = item.img
        ? '<img class="pz-item-img" src="' + item.img + '" alt="' + item.nome + '">'
        : '';
      html += '<div class="pz-item">' +
        imgTag +
        '<div class="pz-item-info">' +
        '<div class="pz-item-name">' + item.nome + '</div>' +
        '<div class="pz-qty">' +
        '<button class="pz-qty-btn" onclick="pzMudaQtd(' + idx + ',-1)" ' + (item.qty <= 1 ? 'disabled' : '') + '>−</button>' +
        '<span class="pz-qty-num">' + item.qty + '</span>' +
        '<button class="pz-qty-btn" onclick="pzMudaQtd(' + idx + ',1)">+</button>' +
        '</div>' +
        '<div class="pz-item-price">' + fmt(item.preco * item.qty) + '</div>' +
        '</div></div>';
    });
    body.innerHTML = html;
    if (footer) footer.style.display = 'block';
    if (sub) sub.textContent  = fmt(subtotalCart());
    if (tot) tot.textContent  = fmt(totalCart());
  }

  window.pzMudaQtd = function (idx, delta) {
    if (!cart[idx]) return;
    cart[idx].qty = Math.max(1, cart[idx].qty + delta);
    pzRenderDrawer();
    pzAtualizarBadge();
  };

  /* ── Drawer ── */
  window.pzAbrirDrawer = function () {
    pzRenderDrawer();
    document.getElementById('pz-overlay').classList.add('on');
    document.getElementById('pz-drawer').classList.add('on');
    document.body.style.overflow = 'hidden';
  };
  window.pzFecharDrawer = function () {
    document.getElementById('pz-overlay').classList.remove('on');
    document.getElementById('pz-drawer').classList.remove('on');
    document.body.style.overflow = '';
  };

  /* ── Modal Checkout ── */
  window.pzAbrirModal = function () {
    pzFecharDrawer();
    /* summary */
    var sumEl = document.getElementById('pz-ck-summary');
    if (sumEl) {
      var rows = cart.map(function (i) {
        return '<div class="pz-sum-row"><span>' + i.nome + (i.qty > 1 ? ' ×' + i.qty : '') + '</span><span>' + fmt(i.preco * i.qty) + '</span></div>';
      }).join('');
      rows += '<div class="pz-sum-row"><span>Frete</span><span>Grátis 🎉</span></div>';
      rows += '<div class="pz-sum-row grand"><span>Total</span><span>' + fmt(totalCart()) + '</span></div>';
      sumEl.innerHTML = rows;
    }
    pzIrEtapa(1);
    document.getElementById('pz-modal-wrap').classList.add('on');
    document.body.style.overflow = 'hidden';
  };
  window.pzFecharModal = function () {
    pzPararPolling();
    document.getElementById('pz-modal-wrap').classList.remove('on');
    document.body.style.overflow = '';
  };

  window.pzIrEtapa = function (n) {
    etapa = n;
    ['pz-e1', 'pz-e2', 'pz-e3'].forEach(function (id, i) {
      var el = document.getElementById(id);
      if (el) el.classList.toggle('show', i + 1 === n);
    });
    ['pz-s1', 'pz-s2', 'pz-s3'].forEach(function (id, i) {
      var el = document.getElementById(id);
      if (!el) return;
      el.classList.remove('active', 'done');
      if (i + 1 === n) el.classList.add('active');
      if (i + 1 < n)  el.classList.add('done');
    });
    var panel = document.querySelector('.pz-modal');
    if (panel) panel.scrollTop = 0;
    var titles = { 1: 'Dados de entrega', 2: 'Pagamento PIX', 3: 'Pedido confirmado' };
    var t = document.getElementById('pz-modal-title');
    if (t) t.textContent = titles[n] || '';
  };

  /* ── Validação e avanço ── */
  window.pzAvancarEtapa1 = function () {
    if (!pzValidar()) return;
    pzIrEtapa(2);
    var load = document.getElementById('pz-pix-load');
    var qr   = document.getElementById('pz-qr-wrap');
    var err  = document.getElementById('pz-pix-err');
    if (load) load.style.display = 'flex';
    if (qr)   qr.style.display   = 'none';
    if (err)  err.style.display  = 'none';
    var amEl = document.getElementById('pz-pix-amount');
    if (amEl) amEl.textContent = fmt(totalCart());
    pzGerarPix();
  };

  function pzValidar() {
    var ok = true;
    ['pz-nome', 'pz-cpf', 'pz-email', 'pz-tel', 'pz-cep', 'pz-rua', 'pz-num', 'pz-bairro', 'pz-cidade'].forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      var empty = !el.value.trim();
      el.classList.toggle('err', empty);
      if (empty) ok = false;
    });
    var est = document.getElementById('pz-estado');
    if (est && !est.value) { est.classList.add('err'); ok = false; }
    else if (est) est.classList.remove('err');
    var cpf = document.getElementById('pz-cpf');
    if (cpf && cpf.value.replace(/\D/g, '').length !== 11) { cpf.classList.add('err'); ok = false; }
    var tel = document.getElementById('pz-tel');
    if (tel) { var tl = tel.value.replace(/\D/g, '').length; if (tl < 10 || tl > 11) { tel.classList.add('err'); ok = false; } }
    if (!ok) { var p = document.querySelector('.pz-modal'); if (p) p.scrollTop = 0; }
    return ok;
  }

  /* ── Dice API ── */
  function pzGerarPix() {
    var nomeProdutos = cart.map(function (i) { return i.nome + (i.qty > 1 ? ' ×' + i.qty : ''); }).join(', ');

    fetch('/api/criar-pagamento', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nome:         document.getElementById('pz-nome').value,
        email:        document.getElementById('pz-email').value,
        cpf:          document.getElementById('pz-cpf').value,
        tel:          document.getElementById('pz-tel').value,
        produto_nome: nomeProdutos,
        total:        totalCart()
      })
    })
    .then(function (r) { return r.json(); })
    .then(function (data) {
      var load = document.getElementById('pz-pix-load');
      if (load) load.style.display = 'none';
      if (!data.ok) throw new Error(data.erro || 'Erro ao gerar PIX.');
      pixText = data.qr_code_text;
      pixId   = data.payment_id;

      var qrEl = document.getElementById('pz-qrcode');
      if (qrEl) {
        qrEl.innerHTML = '';
        if (window.QRCode) {
          new QRCode(qrEl, { text: pixText, width: 200, height: 200, colorDark: '#000', colorLight: '#fff', correctLevel: QRCode.CorrectLevel.L });
        }
      }
      var codeEl = document.getElementById('pz-code');
      if (codeEl) codeEl.textContent = pixText;

      var qrWrap = document.getElementById('pz-qr-wrap');
      if (qrWrap) qrWrap.style.display = 'block';

      pzStartTimer();
      pzIniciarPolling(pixId);
    })
    .catch(function (err) {
      var load = document.getElementById('pz-pix-load');
      if (load) load.style.display = 'none';
      var errEl  = document.getElementById('pz-pix-err');
      var errMsg = document.getElementById('pz-pix-err-msg');
      if (errMsg) errMsg.textContent = err.message || 'Erro ao gerar PIX. Tente novamente.';
      if (errEl) errEl.style.display = 'block';
    });
  }

  function pzIniciarPolling(id) {
    pzPararPolling();
    if (!id) return;
    (function poll() {
      fetch('/api/status-pagamento?id=' + encodeURIComponent(id))
        .then(function (r) { return r.json(); })
        .then(function (d) {
          if (d.status === 'PAID' || d.status === 'APPROVED') {
            pzPararPolling();
            clearTimeout(timerTO);
            pzIrEtapa(3);
          } else {
            pollingTO = setTimeout(poll, 4000);
          }
        })
        .catch(function () { pollingTO = setTimeout(poll, 6000); });
    })();
  }

  function pzPararPolling() {
    if (pollingTO) { clearTimeout(pollingTO); pollingTO = null; }
  }

  window.pzTentarNovamente = function () {
    var err  = document.getElementById('pz-pix-err');
    var load = document.getElementById('pz-pix-load');
    if (err)  err.style.display  = 'none';
    if (load) load.style.display = 'flex';
    pzGerarPix();
  };

  window.pzCopiarPix = function () {
    if (!pixText) return;
    var btn = document.getElementById('pz-btn-copy');
    if (navigator.clipboard) {
      navigator.clipboard.writeText(pixText).then(function () {
        if (btn) { btn.textContent = '✓ CÓDIGO COPIADO!'; btn.classList.add('ok'); }
        setTimeout(function () { if (btn) { btn.textContent = 'Copiar Código PIX'; btn.classList.remove('ok'); } }, 2500);
      });
    } else {
      var ta = document.createElement('textarea');
      ta.value = pixText;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      if (btn) btn.textContent = '✓ CÓDIGO COPIADO!';
      setTimeout(function () { if (btn) btn.textContent = 'Copiar Código PIX'; }, 2500);
    }
  };

  /* ── Timer PIX 30 min ── */
  function pzStartTimer() {
    if (timerTO) clearTimeout(timerTO);
    var wrap = document.getElementById('pz-timer');
    var el   = document.getElementById('pz-timer-val');
    if (!wrap || !el) return;
    wrap.classList.add('on');
    var secs = 30 * 60;
    (function tick() {
      var m = Math.floor(secs / 60), s = secs % 60;
      el.textContent = m + ':' + (s < 10 ? '0' : '') + s;
      if (secs > 0) { secs--; timerTO = setTimeout(tick, 1000); }
      else el.textContent = 'Expirado';
    })();
  }

  /* ── CEP ── */
  window.pzBuscarCep = function () {
    var cep = document.getElementById('pz-cep').value.replace(/\D/g, '');
    if (cep.length !== 8) return;
    var btn = document.getElementById('pz-btn-cep');
    if (btn) { btn.textContent = '…'; btn.disabled = true; }
    fetch('https://viacep.com.br/ws/' + cep + '/json/')
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (d.erro) throw new Error();
        var set = function (id, val) { var el = document.getElementById(id); if (el) el.value = val || ''; };
        set('pz-rua', d.logradouro);
        set('pz-bairro', d.bairro);
        set('pz-cidade', d.localidade);
        set('pz-estado', d.uf);
        var numEl = document.getElementById('pz-num');
        if (numEl) numEl.focus();
      })
      .catch(function () { alert('CEP não encontrado. Preencha manualmente.'); })
      .finally(function () { if (btn) { btn.textContent = 'Buscar'; btn.disabled = false; } });
  };

  /* ── Máscaras ── */
  function addMask(id, fn) {
    var el = document.getElementById(id);
    if (el) el.addEventListener('input', function () { this.value = fn(this.value); });
  }

  /* ── Fechar overlay ao clicar fora ── */
  function bindOverlay() {
    var ov = document.getElementById('pz-overlay');
    if (ov) {
      ov.addEventListener('click', function () {
        pzFecharDrawer();
      });
    }
    var mw = document.getElementById('pz-modal-wrap');
    if (mw) {
      mw.addEventListener('click', function (e) {
        if (e.target === mw) pzFecharModal();
      });
    }
  }

  function bindMasks() {
    addMask('pz-tel', function (v) {
      v = v.replace(/\D/g, '');
      return v.length <= 10
        ? v.replace(/(\d{2})(\d{4})(\d{0,4})/, '($1) $2-$3')
        : v.replace(/(\d{2})(\d{5})(\d{0,4})/, '($1) $2-$3');
    });
    addMask('pz-cpf', function (v) {
      v = v.replace(/\D/g, '');
      return v.replace(/(\d{3})(\d{3})(\d{3})(\d{0,2})/, '$1.$2.$3-$4');
    });
    addMask('pz-cep', function (v) {
      v = v.replace(/\D/g, '');
      return v.length > 5 ? v.slice(0, 5) + '-' + v.slice(5, 8) : v;
    });
  }

  /* ── Lisinha: lê qty selecionada no kaching bundle ── */
  function getLisinhaBundleQty() {
    /* Tenta ler o radio selecionado */
    var bars = document.querySelectorAll('.kaching-bundles__bar');
    for (var i = 0; i < bars.length; i++) {
      var radio = bars[i].querySelector('input[type="radio"]');
      if (radio && radio.checked) {
        var title = (bars[i].querySelector('.kaching-bundles__bar-title') || {}).textContent || '';
        var n = parseInt(title);
        if (n >= 1 && n <= 3) return n;
      }
    }
    /* Fallback: input[name=quantity] no formulário */
    var qtyEl = document.querySelector('form[data-type="add-to-cart-form"] input[name="quantity"]');
    return parseInt((qtyEl && qtyEl.value) || '1') || 1;
  }

  /* ── Lisinha: sobrescreve preços exibidos no kaching bundle ── */
  function fixLisinhaBundlePrices() {
    if (window.location.pathname.indexOf('/products/lisinha') !== 0) return;
    var bars = document.querySelectorAll('.kaching-bundles__bar');
    if (!bars.length) return;
    var prices = [
      { price: 'R$ 39,90' },
      { price: 'R$ 79,90' },
      { price: 'R$ 119,90' },
    ];
    bars.forEach(function (bar, i) {
      var d = prices[i];
      if (!d) return;
      /* Preço principal */
      var priceEl = bar.querySelector('[data-a11y-label="system.price"]');
      if (priceEl) {
        var tn = priceEl.firstChild;
        if (tn && tn.nodeType === 3) tn.textContent = d.price;
        else priceEl.insertBefore(document.createTextNode(d.price), priceEl.firstChild);
      }
      /* Remove preço riscado (de original da Shopify) */
      var origEl = bar.querySelector('[data-a11y-label="system.original_price"]');
      if (origEl) origEl.style.display = 'none';
    });
  }

  /* ── Lisinha: sincroniza preço nativo com bundle selecionado ── */
  function updateLisinhaNativePrice(qty) {
    var price = LISINHA_BUNDLE[qty];
    if (!price) return;
    document.querySelectorAll('.product-price-block .price').forEach(function (el) {
      el.textContent = fmt(price);
    });
  }

  function initLisinhaNativePriceFix() {
    if (window.location.pathname.indexOf('/products/lisinha') !== 0) return;

    /* Click em qualquer bar → atualiza preço pelo índice (0=1un, 1=2un, 2=3un) */
    document.addEventListener('click', function (e) {
      var bar = e.target.closest('.kaching-bundles__bar');
      if (!bar) return;
      var allBars = document.querySelectorAll('.kaching-bundles__bar');
      var idx = Array.prototype.indexOf.call(allBars, bar);
      updateLisinhaNativePrice([1, 2, 3][idx] || 1);
    }, true);

    /* MutationObserver: captura preselect do Kaching ao carregar (sem clique do user) */
    var obs = new MutationObserver(function () {
      var selected = document.querySelector('.kaching-bundles__bar--selected');
      if (!selected) return;
      var allBars = document.querySelectorAll('.kaching-bundles__bar');
      var idx = Array.prototype.indexOf.call(allBars, selected);
      updateLisinhaNativePrice([1, 2, 3][idx] || 1);
    });

    /* Aguarda o bloco kaching aparecer no DOM para começar a observar */
    var pollObs = setInterval(function () {
      var block = document.querySelector('.kaching-bundles');
      if (!block) return;
      clearInterval(pollObs);
      obs.observe(block, { attributes: true, attributeFilter: ['class'], subtree: true });
    }, 200);
    setTimeout(function () { clearInterval(pollObs); }, 15000);
  }

  /* ── Polyfills Shopify ── */
  function fixShopifyComponents() {
    /* 0. Forçar carregamento de imagens com loading="lazy" (abaixo da dobra nunca disparam load) */
    document.querySelectorAll('img[loading="lazy"]').forEach(function (img) {
      img.loading = 'eager';
    });

    /* 1. Imagens lazy data-mode="js" (responsive-image custom element) */
    document.querySelectorAll('img[data-mode="js"]').forEach(function (img) {
      var ds = img.getAttribute('data-srcset');
      var dz = img.getAttribute('data-default-sizes');
      if (!ds) return;
      img.setAttribute('srcset', ds);
      if (dz) img.setAttribute('sizes', dz);
      if (!img.getAttribute('src')) {
        var first = ds.split(',')[0].trim().split(/\s+/)[0];
        if (first) img.setAttribute('src', first);
      }
      img.removeAttribute('data-mode');
    });

    /* 2. counter-component: animar 0 -> data-target ao entrar na viewport */
    document.querySelectorAll('counter-component[data-target]').forEach(function (el) {
      var target = parseInt(el.getAttribute('data-target'), 10);
      if (isNaN(target)) return;
      var display = el.querySelector('[ref="numberDisplay"]');
      if (!display) return;
      var started = false;
      var obs = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting && !started) {
            started = true;
            obs.unobserve(el);
            var t0 = null;
            var duration = 1400;
            requestAnimationFrame(function step(ts) {
              if (!t0) t0 = ts;
              var p = Math.min((ts - t0) / duration, 1);
              var ease = 1 - Math.pow(1 - p, 3);
              display.textContent = Math.round(ease * target);
              if (p < 1) requestAnimationFrame(step);
            });
          }
        });
      }, { threshold: 0.3 });
      obs.observe(el);
    });

    /* 3. image-zoom-reveal: precisa de .loaded e .in-view para mostrar a imagem
          CSS do tema: .image-zoom-reveal .media__image { opacity:0 }
                       .image-zoom-reveal.loaded.in-view .media__image { opacity:1 } */
    function revealZoom(container) {
      container.classList.add('loaded', 'in-view');
      /* Remove loading do .media e img internos */
      container.querySelectorAll('.media').forEach(function (m) {
        m.classList.remove('loading');
        m.classList.add('loaded', 'in-view');
      });
      container.querySelectorAll('img').forEach(function (i) {
        i.classList.remove('loading');
        i.classList.add('loaded');
      });
    }

    document.querySelectorAll('.image-zoom-reveal').forEach(function (container) {
      var img = container.querySelector('img');
      if (!img) { revealZoom(container); return; }
      if (img.complete && img.naturalWidth > 0) {
        revealZoom(container);
      } else {
        img.addEventListener('load',  function () { revealZoom(container); }, { once: true });
        img.addEventListener('error', function () { revealZoom(container); }, { once: true });
      }
    });

    /* 4. media.loading sem image-zoom-reveal (depoimentos com data-mode="liquid") */
    document.querySelectorAll('.media.loading').forEach(function (media) {
      var img = media.querySelector('img');
      function unlockMedia() {
        media.classList.remove('loading');
        media.classList.add('loaded');
        if (img) { img.classList.remove('loading'); img.classList.add('loaded'); }
      }
      if (!img || (img.complete && img.naturalWidth > 0)) {
        unlockMedia();
      } else {
        img.addEventListener('load',  unlockMedia, { once: true });
        img.addEventListener('error', unlockMedia, { once: true });
      }
    });

    /* 5. deferred-media: remover data-loading para esconder o spinner giratório
          CSS: deferred-media[data-loading] > .deferred-media__loading { display:flex } */
    document.querySelectorAll('deferred-media[data-loading]').forEach(function (dm) {
      dm.removeAttribute('data-loading');
    });

    /* 6. masonry-component: remover max-height para mostrar todos os depoimentos */
    document.querySelectorAll('masonry-component').forEach(function (mc) {
      mc.style.maxHeight = 'none';
      mc.style.overflow = 'visible';
    });
    /* ocultar botão "Mostrar mais" pois agora tudo fica visível */
    document.querySelectorAll('[ref="showMoreButtonWrapper"]').forEach(function (btn) {
      btn.style.display = 'none';
    });

    /* 7. motion-component: revelar elementos presos em opacity:0 */
    document.querySelectorAll('motion-component:not([data-initialized])').forEach(function (mc) {
      mc.setAttribute('data-initialized', 'true');
      mc.style.opacity = '1';
      mc.style.transform = 'none';
      mc.style.willChange = 'auto';
    });

    /* 8. media-gallery: ativa thumbnails e imagem principal quando custom element não carrega */
    document.querySelectorAll('media-gallery').forEach(function (gallery) {
      /* Força a primeira imagem a aparecer */
      var firstSlide = gallery.querySelector('[data-index="0"]') || gallery.querySelector('.product__media-item');
      if (firstSlide) firstSlide.classList.add('is-active');

      /* Thumbnails: clicar troca a imagem principal */
      gallery.querySelectorAll('[data-thumbnail-id]').forEach(function (thumb) {
        thumb.style.cursor = 'pointer';
        thumb.addEventListener('click', function () {
          var id = thumb.getAttribute('data-thumbnail-id');
          gallery.querySelectorAll('.product__media-item').forEach(function (slide) {
            slide.classList.toggle('is-active', slide.getAttribute('data-media-id') === id);
          });
          gallery.querySelectorAll('[data-thumbnail-id]').forEach(function (t) {
            t.classList.toggle('media-gallery__thumbnail--active', t === thumb);
          });
        });
      });

      /* Garante imagens visíveis */
      gallery.querySelectorAll('img').forEach(function (img) {
        img.loading = 'eager';
        img.classList.remove('loading');
        img.classList.add('loaded');
      });
    });

    /* 9. variant-picker / quantity-selector: evita erros JS de custom elements não definidos */
    ['variant-picker', 'quantity-selector', 'product-form', 'cart-notification', 'cart-items',
     'sticky-header', 'announcement-bar', 'details-modal', 'product-recommendations'].forEach(function (tag) {
      if (!customElements.get(tag)) {
        customElements.define(tag, HTMLElement);
      }
    });

  }

  /* ── Polyfill: Kit Builder (products-bundle-selection) ── */
  function initKitBuilder() {
    var bundleEl = document.querySelector('products-bundle-selection');
    if (!bundleEl) return;

    var MAX            = parseInt(bundleEl.getAttribute('data-max-items') || '3', 10);
    var MIN            = parseInt(bundleEl.getAttribute('data-min-items') || '3', 10);
    var noDuplicates   = bundleEl.getAttribute('data-prevent-duplicate-items') === 'true';
    var msgDuplicate   = bundleEl.getAttribute('data-duplicate-message') || 'Produto já está no kit.';
    var msgLimit       = bundleEl.getAttribute('data-limit-message')     || 'Limite de ' + MAX + ' produtos atingido.';

    var kit      = []; /* [{variantId, nome, preco, img}] */
    var slots    = Array.from(bundleEl.querySelectorAll('.products-bundle-selection__bar-item'));
    var barCount = bundleEl.querySelector('[ref="bundleBarCount"]');
    var submitBtn= bundleEl.querySelector('[ref="bundleBarSubmit"]');
    var errorEl  = bundleEl.querySelector('[ref="addToCartTextError"]');

    /* Guarda o HTML original dos slots para restaurar ao remover */
    var slotOriginals = slots.map(function (s) {
      var c = s.querySelector('.products-bundle-selection__bar-item-content');
      return c ? c.innerHTML : '';
    });

    function showError(msg) {
      if (!errorEl) return;
      errorEl.textContent = msg;
      errorEl.classList.remove('hidden');
      setTimeout(function () { errorEl.classList.add('hidden'); }, 3000);
    }

    function updateUI() {
      if (barCount) barCount.textContent = kit.length;
      if (submitBtn) submitBtn.disabled = kit.length < MIN;

      slots.forEach(function (slot, i) {
        var content = slot.querySelector('.products-bundle-selection__bar-item-content');
        var item = kit[i];
        if (item) {
          slot.classList.remove('is-placeholder');
          if (content) {
            content.innerHTML = item.img
              ? '<img src="' + item.img + '" style="width:100%;height:100%;object-fit:cover;border-radius:10px;display:block;">'
              : '<div style="width:100%;height:100%;background:#f3e8ef;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:10px;color:#9d123f;font-weight:700;text-align:center;padding:4px;">' + item.nome.slice(0, 12) + '</div>';
          }
        } else {
          slot.classList.add('is-placeholder');
          if (content && slotOriginals[i]) content.innerHTML = slotOriginals[i];
        }
      });
    }

    /* Botões "Adicionar" de cada produto no kit */
    bundleEl.querySelectorAll('product-bundle-selection').forEach(function (pbEl) {
      var btn = pbEl.querySelector('[ref="addToBundleButton"]');
      if (!btn) return;

      btn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopImmediatePropagation();

        var select    = pbEl.querySelector('select[ref="variantSelect"]');
        var variantId = select ? select.value : null;
        if (!variantId || !PRODUTOS[variantId]) return;

        if (noDuplicates && kit.find(function (k) { return k.variantId === variantId; })) {
          showError(msgDuplicate); return;
        }
        if (kit.length >= MAX) {
          showError(msgLimit); return;
        }

        kit.push({
          variantId: variantId,
          nome:      PRODUTOS[variantId].nome,
          preco:     PRODUTOS[variantId].preco,
          img:       PRODUTOS[variantId].img || ''
        });
        updateUI();
      }, true);
    });

    /* Botões "Remover" nos slots */
    slots.forEach(function (slot, i) {
      var removeBtn = slot.querySelector('.products-bundle-selection__bar-item-remove');
      if (!removeBtn) return;
      removeBtn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopImmediatePropagation();
        kit.splice(i, 1);
        updateUI();
      });
    });

    /* Botão "Adicionar kit ao carrinho" */
    if (submitBtn) {
      submitBtn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (kit.length < MIN) return;

        var desconto = kit.length >= 3 ? 0.10 : 0;
        kit.forEach(function (item) {
          var precoFinal = parseFloat((item.preco * (1 - desconto)).toFixed(2));
          var prod = PRODUTOS[item.variantId] || {};
          var existente = cart.find(function (c) { return c.variantId === item.variantId; });
          if (existente) {
            existente.qty++;
          } else {
            cart.push({ variantId: item.variantId, nome: item.nome, preco: precoFinal, qty: 1, img: prod.img || '' });
          }
        });

        /* Limpa o kit visual */
        kit = [];
        updateUI();

        pzAtualizarBadge();
        pzRenderDrawer();
        pzAbrirDrawer();
      }, true);
    }

    updateUI();
  }

  /* ── Init ── */
  function init() {
    injectCSS();
    injectHTML();
    interceptShopifyCart();

    /* aguarda DOM estar pronto para bindings */
    var ready = function () {
      bindOverlay();
      bindMasks();
      fixShopifyComponents();
      initKitBuilder();

      /* Lisinha: corrige preços exibidos pelo kaching bundle (que re-renderiza via Storefront API) */
      fixLisinhaBundlePrices();
      setTimeout(fixLisinhaBundlePrices, 600);
      setTimeout(fixLisinhaBundlePrices, 1800);
      setTimeout(fixLisinhaBundlePrices, 4000);
      var _kEl = document.querySelector('kaching-bundle') || document.body;
      var _kObs = new MutationObserver(function () { fixLisinhaBundlePrices(); });
      _kObs.observe(_kEl, { childList: true, subtree: true });

      /* Lisinha: sincroniza preço nativo ao trocar bundle */
      initLisinhaNativePriceFix();
    };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', ready);
    } else {
      ready();
    }
  }

  init();
})();
