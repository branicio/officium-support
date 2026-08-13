(function () {
  // Set first: style.css only hides [data-lang] sections once this attribute
  // is present, so a script error degrades to all three languages rendered
  // stacked — never to none. Everything after this line runs inside the
  // try/catch below, whose catch removes the attribute again: any failure to
  // complete setup withdraws the stylesheet's authorisation to hide content.
  // Showing the wrong language is cosmetic; showing none would hide a legal
  // document from a user or an App Store reviewer.
  document.documentElement.dataset.js = "on";

  try {
    // #en / #pt / #es is the deep-link contract: the iOS app links to
    // privacy.html#pt, terms.html#es, and so on. The hashes double as the
    // hand-authored section ids, so a no-JS visitor following a deep link
    // still lands on the right language in the stacked fallback.
    var HASH = { en: "en", pt: "pt", es: "es" };
    var LANG_ATTR = { en: "en", pt: "pt-BR", es: "es-419" };
    var FRAGMENT = { en: "", pt: "#pt", es: "#es" };
    var STORE_KEY = "officium.lang";
    // The three real pages of this site, keyed by filename. Everything else
    // an <a> can point at — mailto:, apple.com/legal — is deliberately
    // absent: a language fragment on those would break the target.
    var PAGES = { "index.html": true, "privacy.html": true, "terms.html": true };

    // A function rather than a map lookup, so no inherited Object property
    // ("constructor", "toString", ...) can masquerade as a stored language.
    function isLang(v) { return v === "en" || v === "pt" || v === "es"; }

    var sections = Array.prototype.slice.call(document.querySelectorAll("[data-lang]"));
    var tabs = Array.prototype.slice.call(document.querySelectorAll('[role="tab"]'));

    // Structural wiring stamped at load time; the HTML only hand-authors
    // data-lang / id / lang on sections and role="tab" + data-lang-target on
    // the controls. role="tabpanel", aria-controls and aria-hidden are never
    // hand-authored.
    var firstSectionIdForLang = {};
    sections.forEach(function (s, i) {
      s.setAttribute("role", "tabpanel");
      if (!s.id) s.id = "lang-panel-" + (s.dataset.lang || i) + "-" + i;
      if (!(s.dataset.lang in firstSectionIdForLang)) {
        firstSectionIdForLang[s.dataset.lang] = s.id;
      }
    });
    tabs.forEach(function (t) {
      var id = firstSectionIdForLang[t.dataset.langTarget];
      if (id) t.setAttribute("aria-controls", id);
    });

    // Capture each translatable chrome element's authored text once, before
    // any switch can overwrite it, so a language with no data-i18n-* value
    // restores the English baseline instead of leaving stale text on screen.
    var i18nEls = Array.prototype.slice.call(document.querySelectorAll("[data-i18n-en]"));
    i18nEls.forEach(function (el) { el.dataset.i18nBaseline = el.textContent; });

    // Same channel for aria-label, which is an attribute rather than
    // textContent. Only shared chrome needs it — inside a [data-lang] section
    // a label is already translated by duplication.
    var i18nAriaEls = Array.prototype.slice.call(document.querySelectorAll("[data-i18n-aria-en]"));
    i18nAriaEls.forEach(function (el) {
      el.dataset.i18nAriaBaseline = el.getAttribute("aria-label") || "";
    });

    // Head metadata uses attributes rather than textContent. Keeping this as
    // a separate channel makes the visible copy and search/share metadata
    // change together without special-casing individual pages.
    var i18nContentEls = Array.prototype.slice.call(
      document.querySelectorAll("[data-i18n-content-en]")
    );
    i18nContentEls.forEach(function (el) {
      el.dataset.i18nContentBaseline = el.getAttribute("content") || "";
    });

    // In-site page links, collected once; apply() rewrites their fragment so
    // the reader's language survives the click. Absolute and scheme-bearing
    // hrefs (mailto:, https:, protocol-relative //host) drop out before the
    // filename test, so an external URL is never rewritten.
    var pageLinks = [];
    Array.prototype.slice.call(document.querySelectorAll("a[href]")).forEach(function (a) {
      var href = a.getAttribute("href") || "";
      if (href.indexOf("//") === 0 || /^[a-z][a-z0-9+.\-]*:/i.test(href)) return;
      var path = href.split("#")[0];
      var file = path.substring(path.lastIndexOf("/") + 1).toLowerCase();
      if (PAGES[file] === true) pageLinks.push({ el: a, path: path });
    });

    // Storage is probed behind its OWN try/catch, never the outer one:
    // Safari private mode can throw on mere access, and a storage failure
    // must degrade to "no memory", not to the stacked no-JS presentation.
    function openStore(name) {
      try {
        var s = window[name];
        var probe = "officium.probe";
        s.setItem(probe, "1");
        s.removeItem(probe);
        return s;
      } catch (e) {
        return null;
      }
    }
    var store = openStore("localStorage") || openStore("sessionStorage") || null;

    function readStored() {
      if (!store) return null;
      try {
        var v = store.getItem(STORE_KEY);
        // Anything that is not one of the three languages is ignored.
        return isLang(v) ? v : null;
      } catch (e) {
        return null;
      }
    }

    function remember(lang) {
      if (!store || !isLang(lang)) return;
      try { store.setItem(STORE_KEY, lang); } catch (e) { /* no memory, no harm */ }
    }

    function pick() {
      // A language named in the URL outranks the stored preference on
      // purpose: #pt / #es / #en is an explicit, per-visit request — that
      // link was shared precisely to land the reader in that language —
      // while the stored value only records what this browser chose last
      // time. Then storage, then browser locale, then English.
      var h = (location.hash || "").replace("#", "").toLowerCase();
      if (HASH[h]) return HASH[h];
      var stored = readStored();
      if (stored) return stored;
      var n = (navigator.language || "en").toLowerCase();
      if (n.indexOf("pt") === 0) return "pt";
      if (n.indexOf("es") === 0) return "es";
      return "en";
    }

    // A requested language with no section falls back to "en"; if even "en"
    // has no section, the first [data-lang] wins. Zero active sections is
    // therefore impossible.
    function resolveLang(lang) {
      var i;
      for (i = 0; i < sections.length; i++) {
        if (sections[i].dataset.lang === lang) return lang;
      }
      for (i = 0; i < sections.length; i++) {
        if (sections[i].dataset.lang === "en") return "en";
      }
      return sections.length ? sections[0].dataset.lang : "en";
    }

    function apply(lang, updateHash) {
      lang = resolveLang(lang);

      var activated = false;
      sections.forEach(function (s) {
        // Two sections sharing one data-lang (a markup bug) must still yield
        // exactly one active panel: only the first match wins.
        var on = !activated && s.dataset.lang === lang;
        if (on) activated = true;
        s.toggleAttribute("data-lang-active", on);
        if (on) s.removeAttribute("aria-hidden");
        else s.setAttribute("aria-hidden", "true");
      });

      tabs.forEach(function (t) {
        var on = t.dataset.langTarget === lang;
        t.setAttribute("aria-selected", on ? "true" : "false");
        t.tabIndex = on ? 0 : -1;
      });

      i18nEls.forEach(function (el) {
        var v = el.getAttribute("data-i18n-" + lang);
        el.textContent = v != null ? v : el.dataset.i18nBaseline;
      });

      i18nAriaEls.forEach(function (el) {
        var v = el.getAttribute("data-i18n-aria-" + lang);
        var next = v != null ? v : el.dataset.i18nAriaBaseline;
        // An empty label is worse than none; remove the attribute instead.
        if (next) el.setAttribute("aria-label", next);
        else el.removeAttribute("aria-label");
      });

      i18nContentEls.forEach(function (el) {
        var v = el.getAttribute("data-i18n-content-" + lang);
        el.setAttribute(
          "content",
          v != null ? v : el.dataset.i18nContentBaseline
        );
      });

      document.documentElement.lang = LANG_ATTR[lang] || lang;

      // Carry the language on to the next page. English is the site default,
      // so its links carry no fragment — a clean URL is the better thing to
      // copy, and pick() reaches "en" once nothing else claims the page.
      var linkFrag = FRAGMENT[lang] != null ? FRAGMENT[lang] : "";
      pageLinks.forEach(function (l) {
        l.el.setAttribute("href", l.path + linkFrag);
      });

      if (updateHash) {
        history.replaceState(null, "", lang === "en" ? "#en" : FRAGMENT[lang]);
      }

      // Returned so callers acting on an explicit signal persist the language
      // that actually took effect, not the one they asked for.
      return lang;
    }

    // A tab click and an arrow-key move are both explicit choices, so both
    // are remembered.
    tabs.forEach(function (t, i) {
      t.addEventListener("click", function () { remember(apply(t.dataset.langTarget, true)); });
      t.addEventListener("keydown", function (e) {
        var d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
        if (!d) return;
        e.preventDefault();
        var next = tabs[(i + d + tabs.length) % tabs.length];
        next.focus(); remember(apply(next.dataset.langTarget, true));
      });
    });

    var initialHash = (location.hash || "").replace("#", "").toLowerCase();
    var initialLang = apply(pick(), false);
    // Persist only what the reader actually asked for: a URL that names a
    // language counts; a language merely inferred from navigator.language
    // does not, and is never written back.
    if (HASH[initialHash]) remember(initialLang);
    // Only re-derive the language when the new hash names one of the three
    // language anchors; any other in-page anchor leaves the reader's current
    // language alone. Arriving at a language anchor is an explicit signal,
    // so it is remembered on the same terms as a tab click.
    window.addEventListener("hashchange", function () {
      var h = (location.hash || "").replace("#", "").toLowerCase();
      if (HASH[h]) remember(apply(HASH[h], false));
    });

  } catch (err) {
    // Setup did not complete, so withdraw the authorisation data-js grants
    // the stylesheet to hide content: the no-JS branch takes over and all
    // three languages render stacked. Never rethrow past here.
    document.documentElement.removeAttribute("data-js");
    console.error("site.js: language-tab setup failed, falling back to no-JS presentation", err);
  }
})();
