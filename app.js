/* =============================================================
 * Influencer Simulator - Core
 * Global State (Proxy) + View Router + Game Loop (Engine)
 * + Post Creation mini-game.
 * ============================================================= */
(function () {
  "use strict";

  /* ===========================================================
   * 1. GLOBAL STATE SCHEMA
   * ===========================================================
   * The initial shape of the entire game world. Anything the
   * simulation needs to persist lives here.
   */
  var initialState = {
    player: {
      username: "player1",
      niche: null,
      followers: 0,
      following: 0,
      balance: 500.0,
      energy: 100,
      mentalHealth: 100,
      reputation: 50,
      isVerified: false,
    },
    stats: {
      totalPosts: 0,
      highestEngagement: 0,
    },
    relationships: {
      activeSponsors: [],
      coFounders: [],
    },
    inventory: {
      unlockedGear: ["Basic Smartphone"],
    },
  };

  /* ===========================================================
   * 2. STATE CLASS (Reactive via Proxy)
   * ===========================================================
   * Wraps the state tree in deep Proxies. Any mutation notifies
   * subscribers and refreshes the DOM bindings automatically.
   */
  function State(seed) {
    this._subscribers = [];
    // Deep-clone the seed so the original template stays pristine.
    this.data = this._observe(JSON.parse(JSON.stringify(seed)));
  }

  /**
   * Register a callback fired on every state change.
   * @param {(path:string, value:*, fullState:object) => void} fn
   * @returns {() => void} unsubscribe handle
   */
  State.prototype.subscribe = function (fn) {
    this._subscribers.push(fn);
    var self = this;
    return function () {
      self._subscribers = self._subscribers.filter(function (s) {
        return s !== fn;
      });
    };
  };

  State.prototype._notify = function (path, value) {
    var self = this;
    this._subscribers.forEach(function (fn) {
      try {
        fn(path, value, self.data);
      } catch (err) {
        // A bad subscriber must never break the state pipeline.
        console.error("State subscriber error:", err);
      }
    });
  };

  /**
   * Recursively wrap an object/array in a Proxy so nested
   * mutations are observable. `basePath` tracks dotted keys
   * (e.g. "player.followers") for targeted DOM updates.
   */
  State.prototype._observe = function (target, basePath) {
    if (target === null || typeof target !== "object") {
      return target;
    }
    var self = this;

    // Recurse first so children are already reactive.
    Object.keys(target).forEach(function (key) {
      target[key] = self._observe(
        target[key],
        basePath ? basePath + "." + key : key
      );
    });

    return new Proxy(target, {
      get: function (obj, key) {
        return obj[key];
      },
      set: function (obj, key, value) {
        // Ignore Symbol keys and no-op writes.
        if (typeof key === "symbol") {
          obj[key] = value;
          return true;
        }
        if (obj[key] === value) {
          return true;
        }
        var path = basePath ? basePath + "." + key : key;
        // Make freshly assigned objects reactive too.
        obj[key] = self._observe(value, path);
        self._notify(path, value);
        return true;
      },
      deleteProperty: function (obj, key) {
        if (key in obj) {
          delete obj[key];
          var path = basePath ? basePath + "." + key : key;
          self._notify(path, undefined);
        }
        return true;
      },
    });
  };

  /* Helper: read a dotted path from the live state. */
  State.prototype.get = function (path) {
    return path.split(".").reduce(function (acc, key) {
      return acc == null ? acc : acc[key];
    }, this.data);
  };

  /* ===========================================================
   * 3. DOM BINDING
   * ===========================================================
   * Elements with [data-bind="player.followers"] mirror state.
   */
  function renderBinding(root, path, value) {
    var selector = '[data-bind="' + path + '"]';
    var nodes = (root || document).querySelectorAll(selector);
    nodes.forEach(function (node) {
      node.textContent = value;
    });
  }

  function renderAll(state) {
    var nodes = document.querySelectorAll("[data-bind]");
    nodes.forEach(function (node) {
      var path = node.getAttribute("data-bind");
      var value = state.get(path);
      if (value !== undefined && value !== null) {
        node.textContent = value;
      }
    });
  }

  /* ===========================================================
   * 4. VIEW ROUTER
   * ===========================================================
   * Toggles `.is-active` between views and their nav tabs.
   */
  function Router(options) {
    this.viewSelector = options.viewSelector;
    this.tabSelector = options.tabSelector;
    this.routeAttr = options.routeAttr || "data-route";
    this.viewAttr = options.viewAttr || "data-view";
    this.defaultRoute = options.defaultRoute || "home";
    this.current = null;
    this._listeners = [];
  }

  Router.prototype.init = function () {
    var self = this;
    var tabs = document.querySelectorAll(this.tabSelector);

    tabs.forEach(function (tab) {
      tab.addEventListener("click", function () {
        var route = tab.getAttribute(self.routeAttr);
        self.go(route);
      });
    });

    // Honour an initial hash, else fall back to the default route.
    var initial = (window.location.hash || "").replace("#", "");
    var startRoute = this._routeExists(initial) ? initial : this.defaultRoute;
    this.go(startRoute, { silent: true });

    return this;
  };

  Router.prototype._routeExists = function (route) {
    if (!route) return false;
    return !!document.querySelector(
      "[" + this.viewAttr + '="' + route + '"]'
    );
  };

  Router.prototype.onChange = function (fn) {
    this._listeners.push(fn);
    return this;
  };

  Router.prototype.go = function (route, opts) {
    opts = opts || {};
    if (!this._routeExists(route) || route === this.current) {
      return;
    }

    var views = document.querySelectorAll(this.viewSelector);
    var tabs = document.querySelectorAll(this.tabSelector);

    // Toggle views.
    views.forEach(function (view) {
      var isMatch = view.getAttribute("data-view") === route;
      view.classList.toggle("is-active", isMatch);
    });

    // Toggle nav tabs.
    tabs.forEach(function (tab) {
      var isMatch = tab.getAttribute("data-route") === route;
      tab.classList.toggle("is-active", isMatch);
    });

    this.current = route;
    if (!opts.silent) {
      window.location.hash = route;
    }

    this._listeners.forEach(function (fn) {
      fn(route);
    });
  };

  /* ===========================================================
   * 5. HELPERS
   * ===========================================================
   */
  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  // Thousands separator for big numbers (e.g. 12,480).
  function fmt(n) {
    return Math.round(n).toLocaleString("en-US");
  }

  /* ===========================================================
   * 6. CORE GAME LOOP (Engine)
   * ===========================================================
   * 1 real second === 1 in-game hour. Each tick applies passive
   * regeneration. Energy recovers slowly when burnt out.
   */
  var Engine = {
    state: null,
    intervalId: null,
    TICK_MS: 1000,

    init: function (state) {
      this.state = state;
      return this;
    },

    tick: function () {
      var p = this.state.data.player;

      // Passive Energy regen: +2/hr normally, +0.5/hr if burnt out.
      var regen = p.mentalHealth < 30 ? 0.5 : 2;
      var next = clamp(p.energy + regen, 0, 100);
      if (next !== p.energy) {
        p.energy = next; // proxy fires DOM update
      }
    },

    start: function () {
      var self = this;
      if (this.intervalId) return;
      this.intervalId = setInterval(function () {
        self.tick();
      }, this.TICK_MS);
    },

    stop: function () {
      clearInterval(this.intervalId);
      this.intervalId = null;
    },
  };

  /* ===========================================================
   * 7. POST HOOKS (mini-game content)
   * ===========================================================
   * Higher viralMultiplier == bigger reach; higher controversyRisk
   * == bigger chance of a Backlash event.
   */
  var HOOKS = [
    {
      text: "A calm, honest recap of today's events.",
      viralMultiplier: 0.9,
      controversyRisk: 0.05,
    },
    {
      text: "5 underrated tips nobody talks about.",
      viralMultiplier: 1.2,
      controversyRisk: 0.15,
    },
    {
      text: "Hot take on today's match... you won't agree.",
      viralMultiplier: 1.5,
      controversyRisk: 0.4,
    },
    {
      text: "Exposing the truth everyone is hiding.",
      viralMultiplier: 2.0,
      controversyRisk: 0.65,
    },
    {
      text: "I'm quitting. Here's the real reason why.",
      viralMultiplier: 2.6,
      controversyRisk: 0.85,
    },
  ];

  var POST_ENERGY_COST = 15;

  /* ===========================================================
   * 8. RESULTS MODAL
   * ===========================================================
   */
  var Modal = {
    el: null,
    init: function () {
      this.el = document.querySelector("[data-modal]");
      var closers = document.querySelectorAll("[data-modal-close]");
      var self = this;
      closers.forEach(function (btn) {
        btn.addEventListener("click", function () {
          self.hide();
        });
      });
      document.addEventListener("keydown", function (e) {
        if (e.key === "Escape") self.hide();
      });
      return this;
    },

    /**
     * @param {object} cfg { emoji, title, subtitle, backlash, rows[] }
     *  rows: { label, value, type: 'gain'|'loss'|'' }
     */
    show: function (cfg) {
      var card = this.el.querySelector(".modal__card");
      card.classList.toggle("modal__card--backlash", !!cfg.backlash);

      this.el.querySelector("[data-modal-emoji]").textContent = cfg.emoji;
      this.el.querySelector("[data-modal-title]").textContent = cfg.title;
      this.el.querySelector("[data-modal-subtitle]").textContent =
        cfg.subtitle || "";

      var body = this.el.querySelector("[data-modal-body]");
      body.innerHTML = "";
      cfg.rows.forEach(function (row) {
        var li = document.createElement("li");
        li.className = "result__item";

        var label = document.createElement("span");
        label.className = "result__label";
        label.textContent = row.label;

        var value = document.createElement("span");
        value.className =
          "result__value" +
          (row.type ? " result__value--" + row.type : "");
        value.textContent = row.value;

        li.appendChild(label);
        li.appendChild(value);
        body.appendChild(li);
      });

      this.el.hidden = false;
    },

    hide: function () {
      if (this.el) this.el.hidden = true;
    },
  };

  /* ===========================================================
   * 9. POST CREATION MINI-GAME
   * ===========================================================
   */
  var PostGame = {
    state: null,
    selectedIndex: null,

    init: function (state) {
      this.state = state;
      this.bodyEl = document.querySelector(".view__body--post");
      this.formEl = document.querySelector("[data-post-form]");
      this.listEl = document.querySelector("[data-hook-list]");
      this.submitEl = document.querySelector("[data-post-submit]");
      this.lockedEl = document.querySelector("[data-post-locked]");

      this.renderHooks();
      this.bindNiche();
      this.bindForm();

      // Re-evaluate the lock state whenever energy changes.
      var self = this;
      state.subscribe(function (path) {
        if (path === "player.energy") self.refresh();
      });

      this.refresh();
      return this;
    },

    /* Apply the niche modifier (Football boosts reach + risk). */
    nicheModifiers: function () {
      var niche = this.state.data.player.niche;
      if (niche === "Football") {
        return { engagement: 1.2, controversy: 1.3 };
      }
      return { engagement: 1.0, controversy: 1.0 };
    },

    riskClass: function (risk) {
      if (risk >= 0.5) return "hook__tag--risk-high";
      if (risk >= 0.2) return "hook__tag--risk-med";
      return "hook__tag--risk-low";
    },

    renderHooks: function () {
      var self = this;
      this.listEl.innerHTML = "";

      HOOKS.forEach(function (hook, index) {
        var label = document.createElement("label");
        label.className = "hook";
        label.setAttribute("data-hook-index", index);

        var input = document.createElement("input");
        input.className = "hook__input";
        input.type = "radio";
        input.name = "hook";
        input.value = index;

        var text = document.createElement("span");
        text.className = "hook__text";
        text.textContent = hook.text;

        var meta = document.createElement("span");
        meta.className = "hook__meta";

        var viral = document.createElement("span");
        viral.className = "hook__tag hook__tag--viral";
        viral.textContent = "Viral x" + hook.viralMultiplier.toFixed(1);

        var risk = document.createElement("span");
        risk.className = "hook__tag " + self.riskClass(hook.controversyRisk);
        risk.textContent =
          "Risk " + Math.round(hook.controversyRisk * 100) + "%";

        meta.appendChild(viral);
        meta.appendChild(risk);

        label.appendChild(input);
        label.appendChild(text);
        label.appendChild(meta);

        input.addEventListener("change", function () {
          self.select(index);
        });

        self.listEl.appendChild(label);
      });
    },

    select: function (index) {
      this.selectedIndex = index;
      var cards = this.listEl.querySelectorAll(".hook");
      cards.forEach(function (card) {
        var isSel = Number(card.getAttribute("data-hook-index")) === index;
        card.classList.toggle("is-selected", isSel);
      });
      this.refresh();
    },

    bindNiche: function () {
      var self = this;
      var chips = document.querySelectorAll("[data-niche-chips] .chip");
      chips.forEach(function (chip) {
        chip.addEventListener("click", function () {
          var niche = chip.getAttribute("data-niche");
          self.state.data.player.niche = niche; // proxy update
          chips.forEach(function (c) {
            c.classList.toggle("is-active", c === chip);
          });
        });
      });
    },

    bindForm: function () {
      var self = this;
      this.formEl.addEventListener("submit", function (e) {
        e.preventDefault();
        self.publish();
      });
    },

    /* Enable/disable based on energy + hook selection. */
    refresh: function () {
      var hasEnergy = this.state.data.player.energy >= POST_ENERGY_COST;
      this.bodyEl.classList.toggle("is-locked", !hasEnergy);
      this.lockedEl.hidden = hasEnergy;
      this.submitEl.disabled = !hasEnergy || this.selectedIndex === null;
    },

    /* Core mathematical evaluation of a post. */
    publish: function () {
      var p = this.state.data.player;
      if (p.energy < POST_ENERGY_COST || this.selectedIndex === null) return;

      var hook = HOOKS[this.selectedIndex];
      var mods = this.nicheModifiers();

      // --- Reach + engagement math ---
      var baseReach = Math.max(p.followers * 0.1, 100);
      var rng = Math.random() * (1.2 - 0.8) + 0.8; // 0.8 .. 1.2
      var viewResult = baseReach * hook.viralMultiplier * mods.engagement * rng;
      var followersGained = Math.round(viewResult * 0.05);

      // --- Controversy check ---
      var effectiveRisk = hook.controversyRisk * mods.controversy;
      var backlash = Math.random() < effectiveRisk;

      // --- Commit state changes (each fires a proxy DOM update) ---
      p.energy = clamp(p.energy - POST_ENERGY_COST, 0, 100);
      p.followers = p.followers + followersGained;
      this.state.data.stats.totalPosts = this.state.data.stats.totalPosts + 1;
      this.state.data.stats.highestEngagement = Math.max(
        this.state.data.stats.highestEngagement,
        Math.round(viewResult)
      );

      var mentalLoss = 0;
      var repLoss = 0;
      if (backlash) {
        mentalLoss = 15;
        repLoss = 5;
        p.mentalHealth = clamp(p.mentalHealth - mentalLoss, 0, 100);
        p.reputation = clamp(p.reputation - repLoss, 0, 100);
      }

      this.showResult({
        viewResult: viewResult,
        followersGained: followersGained,
        backlash: backlash,
        mentalLoss: mentalLoss,
        repLoss: repLoss,
      });

      // Reset selection for the next post.
      this.selectedIndex = null;
      var checked = this.formEl.querySelector("input:checked");
      if (checked) checked.checked = false;
      this.listEl
        .querySelectorAll(".hook.is-selected")
        .forEach(function (c) {
          c.classList.remove("is-selected");
        });
      this.refresh();
    },

    showResult: function (r) {
      var rows = [
        { label: "\uD83D\uDC41 Views gained", value: "+" + fmt(r.viewResult), type: "gain" },
        { label: "\uD83D\uDC65 Followers gained", value: "+" + fmt(r.followersGained), type: "gain" },
        { label: "\u26A1 Energy spent", value: "-" + POST_ENERGY_COST, type: "loss" },
      ];

      if (r.backlash) {
        rows.push({ label: "\uD83E\uDDE0 Mental Health", value: "-" + r.mentalLoss, type: "loss" });
        rows.push({ label: "\u2B50 Reputation", value: "-" + r.repLoss, type: "loss" });
      }

      Modal.show({
        emoji: r.backlash ? "\uD83D\uDD25" : "\uD83D\uDE80",
        title: r.backlash ? "Backlash!" : "Post Published!",
        subtitle: r.backlash
          ? "Your hot take stirred the pot. The comments are brutal."
          : "Your content is making the rounds.",
        backlash: r.backlash,
        rows: rows,
      });
    },
  };

  /* ===========================================================
   * 10. VITALS UI (formatted meters for Energy / Mental Health)
   * ===========================================================
   * Overrides the raw data-bind paint with rounded values and
   * drives the meter bar widths.
   */
  function updateVital(state, key) {
    var value = state.data.player[key];
    var rounded = Math.round(value);

    document
      .querySelectorAll('[data-bind="player.' + key + '"]')
      .forEach(function (node) {
        node.textContent = rounded;
      });

    var fill = document.querySelector('[data-meter="' + key + '"]');
    if (fill) {
      fill.style.width = clamp(value, 0, 100) + "%";
      var lowThreshold = key === "mentalHealth" ? 30 : 20;
      fill.classList.toggle("is-low", value < lowThreshold);
    }
  }

  /* ===========================================================
   * 11. BOOTSTRAP
   * ===========================================================
   */
  function boot() {
    // Instantiate global, reactive state.
    var state = new State(initialState);

    // Keep the DOM in sync with any state mutation.
    state.subscribe(function (path, value) {
      renderBinding(document, path, value);
    });

    // Formatted vitals + meter widths (runs after the generic paint).
    state.subscribe(function (path) {
      if (path === "player.energy") updateVital(state, "energy");
      if (path === "player.mentalHealth") updateVital(state, "mentalHealth");
    });

    // Initial paint from current values.
    renderAll(state);
    updateVital(state, "energy");
    updateVital(state, "mentalHealth");

    // Wire up navigation.
    var router = new Router({
      viewSelector: ".view",
      tabSelector: ".nav__tab",
      defaultRoute: "profile",
    }).init();

    // Initialise modal + post mini-game.
    Modal.init();
    var postGame = PostGame.init(state);

    // Refresh the post lock state each time the tab is opened.
    router.onChange(function (route) {
      if (route === "post") postGame.refresh();
    });

    // Start the core game loop (1s = 1 in-game hour).
    Engine.init(state).start();

    // Expose for debugging / future game-loop modules.
    window.IS = {
      state: state,
      router: router,
      engine: Engine,
      postGame: postGame,
    };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
