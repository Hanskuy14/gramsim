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
    // Incoming sponsorship negotiations (DM tab).
    dm: {
      offers: [],
      nextId: 1,
    },
    // Late-game Apparel e-commerce tycoon module.
    ecommerce: {
      launched: false,
      subBrandName: null,
      coFounder: "Zacky",
      stockLevel: 0,
      adBudget: 0.0,
      customerRating: 5.0,
      totalReviews: 0,
      revenue: 0.0,
      disputeActive: false,
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

  // Currency formatter (e.g. $1,250 or $1,250.50).
  function money(n, decimals) {
    return (
      "$" +
      Number(n).toLocaleString("en-US", {
        minimumFractionDigits: decimals || 0,
        maximumFractionDigits: decimals || 0,
      })
    );
  }

  /* ===========================================================
   * 6. CORE GAME LOOP (Engine)
   * ===========================================================
   * 1 real second === 1 in-game hour. Each tick applies passive
   * regeneration then fans out to registered tick handlers
   * (negotiations, e-commerce, etc.).
   */
  var Engine = {
    state: null,
    intervalId: null,
    TICK_MS: 1000,
    _handlers: [],

    init: function (state) {
      this.state = state;
      return this;
    },

    // Register a callback invoked every tick: fn(state, engine).
    onTick: function (fn) {
      this._handlers.push(fn);
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

      // Fan out to subsystems.
      var self = this;
      this._handlers.forEach(function (fn) {
        try {
          fn(self.state, self);
        } catch (err) {
          console.error("Engine tick handler error:", err);
        }
      });
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
    selectedTrendId: null,

    init: function (state, trending) {
      this.state = state;
      this.trending = trending;
      this.bodyEl = document.querySelector(".view__body--post");
      this.formEl = document.querySelector("[data-post-form]");
      this.listEl = document.querySelector("[data-hook-list]");
      this.submitEl = document.querySelector("[data-post-submit]");
      this.lockedEl = document.querySelector("[data-post-locked]");
      this.trendEl = document.querySelector("[data-post-trends]");

      this.renderHooks();
      this.renderTrends();
      this.bindNiche();
      this.bindForm();

      // Re-evaluate the lock state whenever energy changes.
      var self = this;
      state.subscribe(function (path) {
        if (path === "player.energy") self.refresh();
      });

      // Refresh the trend chips whenever trends reroll.
      if (trending) {
        trending.onReroll(function () {
          self.renderTrends();
        });
      }

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

    // Render the optional "ride a trend" chips from active trends.
    renderTrends: function () {
      if (!this.trendEl || !this.trending) return;
      var self = this;
      var active = this.trending.getActive();

      // Drop a stale selection if that trend is no longer active.
      if (this.selectedTrendId && !this.trending.isActive(this.selectedTrendId)) {
        this.selectedTrendId = null;
      }

      this.trendEl.innerHTML = "";
      active.forEach(function (trend) {
        var chip = document.createElement("button");
        chip.type = "button";
        chip.className = "trend-chip";
        chip.classList.toggle("is-active", trend.id === self.selectedTrendId);
        chip.setAttribute("data-trend-id", trend.id);
        chip.innerHTML =
          '<span class="trend-chip__topic">#' +
          trend.topic.replace(/[^a-zA-Z0-9]+/g, "") +
          '</span><span class="trend-chip__boost">3x</span>';
        chip.addEventListener("click", function () {
          self.selectTrend(trend.id);
        });
        self.trendEl.appendChild(chip);
      });
    },

    // Toggle a trend on/off (selecting one deselects the rest).
    selectTrend: function (id) {
      this.selectedTrendId = this.selectedTrendId === id ? null : id;
      var chips = this.trendEl.querySelectorAll(".trend-chip");
      var self = this;
      chips.forEach(function (chip) {
        var cid = Number(chip.getAttribute("data-trend-id"));
        chip.classList.toggle("is-active", cid === self.selectedTrendId);
      });
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

      // --- Trend boost: riding an active trend grants 3.0x viral ---
      var ridingTrend =
        this.trending && this.selectedTrendId
          ? this.trending.findById(this.selectedTrendId)
          : null;
      var trendBoost = ridingTrend ? TREND_MULTIPLIER : 1.0;

      // --- Reach + engagement math ---
      var baseReach = Math.max(p.followers * 0.1, 100);
      var rng = Math.random() * (1.2 - 0.8) + 0.8; // 0.8 .. 1.2
      var viewResult =
        baseReach * hook.viralMultiplier * trendBoost * mods.engagement * rng;
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
        trend: ridingTrend,
      });

      // Reset selection for the next post.
      this.selectedIndex = null;
      this.selectedTrendId = null;
      this.renderTrends();
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
      var rows = [];
      if (r.trend) {
        rows.push({
          label: "\uD83D\uDD25 Trend boost",
          value: "x" + TREND_MULTIPLIER.toFixed(1),
          type: "gain",
        });
      }
      rows.push({ label: "\uD83D\uDC41 Views gained", value: "+" + fmt(r.viewResult), type: "gain" });
      rows.push({ label: "\uD83D\uDC65 Followers gained", value: "+" + fmt(r.followersGained), type: "gain" });
      rows.push({ label: "\u26A1 Energy spent", value: "-" + POST_ENERGY_COST, type: "loss" });

      if (r.backlash) {
        rows.push({ label: "\uD83E\uDDE0 Mental Health", value: "-" + r.mentalLoss, type: "loss" });
        rows.push({ label: "\u2B50 Reputation", value: "-" + r.repLoss, type: "loss" });
      }

      Modal.show({
        emoji: r.backlash ? "\uD83D\uDD25" : r.trend ? "\uD83D\uDCC8" : "\uD83D\uDE80",
        title: r.backlash ? "Backlash!" : r.trend ? "You're Trending!" : "Post Published!",
        subtitle: r.backlash
          ? "Your hot take stirred the pot. The comments are brutal."
          : r.trend
          ? "Riding " + r.trend.topic + " sent your reach soaring."
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
   * 11. CONSTANTS (tycoon / negotiation tuning)
   * ===========================================================
   */
  var OFFER_CHANCE_PER_TICK = 0.02; // 2% per tick
  var COUNTER_MULTIPLIER = 1.3; // +30%
  var ECOM_UNLOCK_FOLLOWERS = 500000;
  var APPAREL_UNIT_PRICE = 35; // $ per unit sold
  var RESTOCK_UNITS = 100;
  var RESTOCK_COST = 600; // $ per restock
  var AD_BUDGET_STEP = 50; // $ added per ad spend
  var DISPUTE_ENERGY_COST = 20; // energy to resolve a dispute
  var RATING_DROP = 0.2; // negative review damage
  var RATING_RESTORE = 0.3; // recovered on dispute resolve
  var NEGATIVE_REVIEW_CHANCE = 0.05; // 5% per tick

  // Content systems
  var TREND_CYCLE_HOURS = 24; // reroll trends every 24 in-game hours
  var TREND_COUNT = 3; // active trends at a time
  var TREND_MULTIPLIER = 3.0; // viral boost when a post rides a trend
  var FEED_INITIAL_POSTS = 6; // posts rendered on first Home load
  var FEED_BATCH = 3; // posts appended per infinite-scroll fetch
  var FEED_SCROLL_THRESHOLD = 320; // px from bottom that triggers a fetch

  // Brand pool for procedurally generated sponsorship offers.
  var BRAND_POOL = [
    { brandName: "Toko FDS", baseOffer: 5000, requirement: "Maintain 80+ Reputation" },
    { brandName: "NovaWear", baseOffer: 3200, requirement: "Post 3x this week" },
    { brandName: "HydroFuel", baseOffer: 7500, requirement: "Keep 50k+ Followers" },
    { brandName: "PixelKicks", baseOffer: 4200, requirement: "Maintain 70+ Reputation" },
    { brandName: "AuraSkincare", baseOffer: 6100, requirement: "1 dedicated Reel" },
    { brandName: "ByteSnacks", baseOffer: 2800, requirement: "Tag us in 2 stories" },
  ];

  /* ===========================================================
   * 12. PROFILE BIO SPONSORS
   * ===========================================================
   * Renders signed sponsors into the bio as blue mentions.
   */
  function renderSponsors(state) {
    var el = document.querySelector("[data-bio-sponsors]");
    if (!el) return;
    var sponsors = state.data.relationships.activeSponsors;

    if (!sponsors.length) {
      el.hidden = true;
      el.innerHTML = "";
      return;
    }

    el.hidden = false;
    el.innerHTML = "";
    var prefix = document.createTextNode("\uD83E\uDD1D Sponsored by ");
    el.appendChild(prefix);
    sponsors.forEach(function (s, i) {
      var span = document.createElement("span");
      span.className = "profile-bio__mention";
      span.textContent = "@" + s.brandName.replace(/\s+/g, "");
      el.appendChild(span);
      if (i < sponsors.length - 1) {
        el.appendChild(document.createTextNode(", "));
      }
    });
  }

  /* ===========================================================
   * 13. DM NEGOTIATION SYSTEM
   * ===========================================================
   * Generates sponsorship offers and resolves counter-offers.
   */
  var Negotiation = {
    state: null,

    init: function (state) {
      this.state = state;
      this.bodyEl = document.querySelector(".view__body--dm");
      this.emptyEl = document.querySelector("[data-dm-empty]");
      this.listEl = document.querySelector("[data-dm-list]");
      this.badgeEl = document.querySelector("[data-dm-badge]");
      this.render();
      return this;
    },

    // Engine tick handler: 2% chance to spawn a new offer.
    maybeGenerateOffer: function (state) {
      if (Math.random() >= OFFER_CHANCE_PER_TICK) return;

      var template = BRAND_POOL[Math.floor(Math.random() * BRAND_POOL.length)];
      var dm = state.data.dm;

      // Avoid duplicate live offers from the same brand.
      var exists = dm.offers.some(function (o) {
        return o.brandName === template.brandName;
      });
      if (exists) return;

      var offer = {
        id: dm.nextId,
        brandName: template.brandName,
        baseOffer: template.baseOffer,
        currentOffer: template.baseOffer,
        requirement: template.requirement,
        status: "pending", // pending | signed | rejected
      };
      dm.nextId = dm.nextId + 1;
      // push triggers a proxy notification on dm.offers
      dm.offers.push(offer);

      this.render();
    },

    findOffer: function (id) {
      return this.state.data.dm.offers.filter(function (o) {
        return o.id === id;
      })[0];
    },

    // Accept the current offer outright (no risk).
    accept: function (id) {
      var offer = this.findOffer(id);
      if (!offer || offer.status !== "pending") return;
      this.sign(offer, offer.currentOffer, false);
    },

    // Risky counter at +30%: success scales by reputation.
    counter: function (id) {
      var offer = this.findOffer(id);
      if (!offer || offer.status !== "pending") return;

      var rep = this.state.data.player.reputation;
      var success = (rep / 100) * 0.7 > Math.random();

      if (success) {
        var raised = Math.round(offer.currentOffer * COUNTER_MULTIPLIER);
        offer.currentOffer = raised;
        this.sign(offer, raised, true);
      } else {
        // Brand walks away: offer is deleted.
        this.removeOffer(id);
        this.render();
        Modal.show({
          emoji: "\uD83D\uDE2C",
          title: "Negotiation Failed",
          subtitle:
            offer.brandName + " didn't appreciate the counter and walked away.",
          backlash: true,
          rows: [
            { label: "\uD83D\uDCB8 Deal lost", value: money(offer.baseOffer), type: "loss" },
          ],
        });
      }
    },

    // Sign the deal: pay out, record sponsor, inject into bio.
    sign: function (offer, amount, wasCountered) {
      var state = this.state;
      offer.status = "signed";

      state.data.player.balance = state.data.player.balance + amount;
      state.data.relationships.activeSponsors.push({
        brandName: offer.brandName,
        amount: amount,
        requirement: offer.requirement,
      });

      this.removeOffer(offer.id);
      renderSponsors(state);
      this.render();

      Modal.show({
        emoji: "\uD83E\uDD1D",
        title: "Deal Signed!",
        subtitle:
          offer.brandName +
          (wasCountered ? " accepted your counter offer." : " is now a sponsor."),
        backlash: false,
        rows: [
          { label: "\uD83D\uDCB0 Payout", value: "+" + money(amount), type: "gain" },
          { label: "\uD83D\uDCDD Requirement", value: offer.requirement, type: "" },
        ],
      });
    },

    removeOffer: function (id) {
      var offers = this.state.data.dm.offers;
      var idx = -1;
      for (var i = 0; i < offers.length; i++) {
        if (offers[i].id === id) {
          idx = i;
          break;
        }
      }
      if (idx > -1) offers.splice(idx, 1);
    },

    updateBadge: function () {
      if (!this.badgeEl) return;
      var count = this.state.data.dm.offers.length;
      this.badgeEl.textContent = count;
      this.badgeEl.hidden = count === 0;
    },

    render: function () {
      var self = this;
      var offers = this.state.data.dm.offers;
      this.updateBadge();

      this.emptyEl.hidden = offers.length > 0;
      this.listEl.hidden = offers.length === 0;
      this.listEl.innerHTML = "";

      offers.forEach(function (offer) {
        self.listEl.appendChild(self.buildConversation(offer));
      });
    },

    // Build one IG-Direct-style conversation block.
    buildConversation: function (offer) {
      var convo = document.createElement("article");
      convo.className = "dm-convo";

      // Header: brand avatar + name
      var header = document.createElement("header");
      header.className = "dm-convo__header";

      var avatar = document.createElement("span");
      avatar.className = "dm-convo__avatar";
      avatar.textContent = offer.brandName.charAt(0);

      var nameWrap = document.createElement("div");
      nameWrap.className = "dm-convo__meta";
      var name = document.createElement("span");
      name.className = "dm-convo__name";
      name.textContent = offer.brandName;
      var sub = document.createElement("span");
      sub.className = "dm-convo__sub";
      sub.textContent = "Brand \u00B7 Active now";
      nameWrap.appendChild(name);
      nameWrap.appendChild(sub);

      header.appendChild(avatar);
      header.appendChild(nameWrap);

      // Message bubbles (incoming)
      var msg1 = document.createElement("p");
      msg1.className = "dm-bubble dm-bubble--in";
      msg1.textContent =
        "Hey! We're " + offer.brandName + " \uD83D\uDC4B We'd love to partner with you.";

      var msg2 = document.createElement("p");
      msg2.className = "dm-bubble dm-bubble--in";
      msg2.textContent =
        "Our offer is " + money(offer.currentOffer) + ". Requirement: " + offer.requirement + ".";

      // Action buttons
      var actions = document.createElement("div");
      actions.className = "dm-convo__actions";

      var acceptBtn = document.createElement("button");
      acceptBtn.type = "button";
      acceptBtn.className = "dm-btn dm-btn--accept";
      acceptBtn.textContent = "Accept " + money(offer.currentOffer);
      acceptBtn.addEventListener("click", function () {
        Negotiation.accept(offer.id);
      });

      var counterBtn = document.createElement("button");
      counterBtn.type = "button";
      counterBtn.className = "dm-btn dm-btn--counter";
      counterBtn.textContent = "Counter Offer (+30%)";
      counterBtn.addEventListener("click", function () {
        Negotiation.counter(offer.id);
      });

      actions.appendChild(acceptBtn);
      actions.appendChild(counterBtn);

      convo.appendChild(header);
      convo.appendChild(msg1);
      convo.appendChild(msg2);
      convo.appendChild(actions);
      return convo;
    },
  };

  /* ===========================================================
   * 14. E-COMMERCE TYCOON (engine-side simulation)
   * ===========================================================
   */
  var Ecommerce = {
    state: null,

    init: function (state) {
      this.state = state;
      return this;
    },

    isUnlocked: function () {
      return this.state.data.player.followers >= ECOM_UNLOCK_FOLLOWERS;
    },

    launch: function (brandName) {
      var e = this.state.data.ecommerce;
      if (e.launched) return;
      e.subBrandName = brandName || e.coFounder + " x " + this.state.data.player.username;
      e.launched = true;
      e.stockLevel = RESTOCK_UNITS;
      e.adBudget = 100;

      // Bring the co-founder NPC on board.
      var founders = this.state.data.relationships.coFounders;
      if (founders.indexOf(e.coFounder) === -1) {
        founders.push(e.coFounder);
      }
    },

    restock: function () {
      var e = this.state.data.ecommerce;
      var p = this.state.data.player;
      if (p.balance < RESTOCK_COST) return false;
      p.balance = p.balance - RESTOCK_COST;
      e.stockLevel = e.stockLevel + RESTOCK_UNITS;
      return true;
    },

    boostAds: function () {
      var e = this.state.data.ecommerce;
      var p = this.state.data.player;
      if (p.balance < AD_BUDGET_STEP) return false;
      p.balance = p.balance - AD_BUDGET_STEP;
      e.adBudget = e.adBudget + AD_BUDGET_STEP;
      return true;
    },

    resolveDispute: function () {
      var e = this.state.data.ecommerce;
      var p = this.state.data.player;
      if (!e.disputeActive || p.energy < DISPUTE_ENERGY_COST) return false;
      p.energy = clamp(p.energy - DISPUTE_ENERGY_COST, 0, 100);
      e.customerRating = clamp(e.customerRating + RATING_RESTORE, 1, 5);
      e.disputeActive = false;
      return true;
    },

    // Estimated revenue per tick at current settings.
    projectedSales: function () {
      var e = this.state.data.ecommerce;
      return e.adBudget * 0.5 * (e.customerRating / 5.0);
    },

    // Engine tick handler: passive sales + review RNG.
    tick: function (state) {
      var e = state.data.ecommerce;
      if (!e.launched || e.stockLevel <= 0) {
        // Even with no stock, a bad review can still land.
        if (e.launched) this.maybeNegativeReview(state);
        return;
      }

      // Sales = (adBudget * 0.5) * (customerRating / 5.0)
      var salesRevenue = e.adBudget * 0.5 * (e.customerRating / 5.0);
      var unitsSold = Math.min(
        e.stockLevel,
        Math.max(0, Math.round(salesRevenue / APPAREL_UNIT_PRICE))
      );

      if (unitsSold > 0) {
        var earned = unitsSold * APPAREL_UNIT_PRICE;
        e.stockLevel = e.stockLevel - unitsSold;
        e.revenue = e.revenue + earned;
        state.data.player.balance = state.data.player.balance + earned;

        // Reviews scale with sales (climbs toward 1500+ over time).
        var newReviews = Math.max(1, Math.round(unitsSold * 0.6));
        e.totalReviews = e.totalReviews + newReviews;
      }

      this.maybeNegativeReview(state);
    },

    maybeNegativeReview: function (state) {
      var e = state.data.ecommerce;
      if (Math.random() < NEGATIVE_REVIEW_CHANCE) {
        e.customerRating = clamp(e.customerRating - RATING_DROP, 1, 5);
        e.totalReviews = e.totalReviews + 1;
        e.disputeActive = true;
      }
    },
  };

  /* ===========================================================
   * 15. TYCOON DASHBOARD UI (full-screen overlay)
   * ===========================================================
   */
  var Tycoon = {
    state: null,
    isOpen: false,

    init: function (state, ecommerce) {
      this.state = state;
      this.ecommerce = ecommerce;
      this.el = document.querySelector("[data-tycoon]");
      this.bodyEl = document.querySelector("[data-tycoon-body]");

      var self = this;
      document.querySelectorAll("[data-tycoon-close]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          self.close();
        });
      });

      // Live-refresh while open.
      state.subscribe(function (path) {
        if (!self.isOpen) return;
        if (
          path.indexOf("ecommerce.") === 0 ||
          path === "player.balance" ||
          path === "player.energy" ||
          path === "player.followers"
        ) {
          self.render();
        }
      });
      return this;
    },

    open: function () {
      this.isOpen = true;
      this.el.hidden = false;
      this.render();
    },

    close: function () {
      this.isOpen = false;
      this.el.hidden = true;
    },

    stars: function (rating) {
      var full = Math.round(rating);
      var s = "";
      for (var i = 0; i < 5; i++) s += i < full ? "\u2605" : "\u2606";
      return s;
    },

    render: function () {
      if (!this.isOpen) return;
      this.bodyEl.innerHTML = "";

      if (!this.ecommerce.isUnlocked()) {
        this.bodyEl.appendChild(this.renderLocked());
      } else if (!this.state.data.ecommerce.launched) {
        this.bodyEl.appendChild(this.renderLaunch());
      } else {
        this.bodyEl.appendChild(this.renderDashboard());
      }
    },

    renderLocked: function () {
      var wrap = document.createElement("div");
      wrap.className = "tycoon-locked";
      var followers = this.state.data.player.followers;
      var remaining = Math.max(0, ECOM_UNLOCK_FOLLOWERS - followers);
      wrap.innerHTML =
        '<span class="tycoon-locked__icon">\uD83D\uDD12</span>' +
        '<h3 class="tycoon-locked__title">Apparel Empire Locked</h3>' +
        '<p class="tycoon-locked__text">The Professional E-Commerce suite unlocks at <strong>' +
        fmt(ECOM_UNLOCK_FOLLOWERS) +
        " followers</strong>.<br/>You have <strong>" +
        fmt(followers) +
        "</strong> \u2014 " +
        fmt(remaining) +
        " to go.</p>";
      return wrap;
    },

    renderLaunch: function () {
      var self = this;
      var e = this.state.data.ecommerce;
      var wrap = document.createElement("div");
      wrap.className = "tycoon-launch";
      wrap.innerHTML =
        '<span class="tycoon-launch__icon">\uD83D\uDC55</span>' +
        '<h3 class="tycoon-launch__title">Launch an Apparel Sub-brand</h3>' +
        '<p class="tycoon-launch__text">Partner with your co-founder <strong>' +
        e.coFounder +
        "</strong> to launch a clothing line. This starts you with " +
        RESTOCK_UNITS +
        " units of stock.</p>";

      var input = document.createElement("input");
      input.className = "tycoon-launch__input";
      input.type = "text";
      input.placeholder = "Sub-brand name (e.g. Zacky Threads)";

      var btn = document.createElement("button");
      btn.className = "tycoon-btn tycoon-btn--primary";
      btn.type = "button";
      btn.textContent = "Launch with " + e.coFounder;
      btn.addEventListener("click", function () {
        self.ecommerce.launch(input.value.trim() || null);
        self.render();
      });

      wrap.appendChild(input);
      wrap.appendChild(btn);
      return wrap;
    },

    renderDashboard: function () {
      var self = this;
      var e = this.state.data.ecommerce;
      var p = this.state.data.player;
      var frag = document.createDocumentFragment();

      // Brand banner
      var banner = document.createElement("div");
      banner.className = "tycoon-banner";
      banner.innerHTML =
        '<span class="tycoon-banner__logo">' +
        e.subBrandName.charAt(0) +
        "</span>" +
        '<div class="tycoon-banner__meta"><span class="tycoon-banner__name">' +
        e.subBrandName +
        '</span><span class="tycoon-banner__sub">Co-founded with ' +
        e.coFounder +
        "</span></div>";
      frag.appendChild(banner);

      // KPI grid
      var grid = document.createElement("div");
      grid.className = "kpi-grid";
      var kpis = [
        { label: "Balance", value: money(p.balance), accent: "green" },
        { label: "Revenue (total)", value: money(e.revenue), accent: "green" },
        { label: "Stock Level", value: fmt(e.stockLevel) + " u", accent: e.stockLevel > 0 ? "" : "red" },
        { label: "Ad Budget", value: money(e.adBudget), accent: "" },
        { label: "Rating", value: this.stars(e.customerRating) + " " + e.customerRating.toFixed(1), accent: e.customerRating < 4 ? "red" : "" },
        { label: "Reviews", value: fmt(e.totalReviews), accent: "" },
      ];
      kpis.forEach(function (k) {
        var card = document.createElement("div");
        card.className = "kpi" + (k.accent ? " kpi--" + k.accent : "");
        card.innerHTML =
          '<span class="kpi__value">' +
          k.value +
          '</span><span class="kpi__label">' +
          k.label +
          "</span>";
        grid.appendChild(card);
      });
      frag.appendChild(grid);

      // Projected sales line
      var proj = document.createElement("p");
      proj.className = "tycoon-proj";
      proj.innerHTML =
        "\uD83D\uDCC8 Projected sales: <strong>" +
        money(this.ecommerce.projectedSales(), 2) +
        "/hr</strong>" +
        (e.stockLevel <= 0 ? ' \u2014 <span class="tycoon-proj__warn">OUT OF STOCK</span>' : "");
      frag.appendChild(proj);

      // Dispute alert
      if (e.disputeActive) {
        var alert = document.createElement("div");
        alert.className = "tycoon-alert";
        alert.innerHTML =
          '<span class="tycoon-alert__icon">\u26A0\uFE0F</span>' +
          '<div class="tycoon-alert__body"><strong>Customer dispute!</strong> A negative review dropped your rating. Resolve it (costs ' +
          DISPUTE_ENERGY_COST +
          "\u26A1 energy) to recover.</div>";
        var resolveBtn = document.createElement("button");
        resolveBtn.className = "tycoon-btn tycoon-btn--danger";
        resolveBtn.type = "button";
        resolveBtn.textContent = "Resolve Dispute (" + DISPUTE_ENERGY_COST + "\u26A1)";
        resolveBtn.disabled = p.energy < DISPUTE_ENERGY_COST;
        resolveBtn.addEventListener("click", function () {
          self.ecommerce.resolveDispute();
          self.render();
        });
        alert.appendChild(resolveBtn);
        frag.appendChild(alert);
      }

      // Controls
      var controls = document.createElement("div");
      controls.className = "tycoon-controls";

      var restockBtn = document.createElement("button");
      restockBtn.className = "tycoon-btn";
      restockBtn.type = "button";
      restockBtn.innerHTML =
        "Restock +" + RESTOCK_UNITS + "<small>" + money(RESTOCK_COST) + "</small>";
      restockBtn.disabled = p.balance < RESTOCK_COST;
      restockBtn.addEventListener("click", function () {
        self.ecommerce.restock();
        self.render();
      });

      var adBtn = document.createElement("button");
      adBtn.className = "tycoon-btn";
      adBtn.type = "button";
      adBtn.innerHTML =
        "Boost Ads +" + money(AD_BUDGET_STEP) + "<small>" + money(AD_BUDGET_STEP) + "</small>";
      adBtn.disabled = p.balance < AD_BUDGET_STEP;
      adBtn.addEventListener("click", function () {
        self.ecommerce.boostAds();
        self.render();
      });

      controls.appendChild(restockBtn);
      controls.appendChild(adBtn);
      frag.appendChild(controls);

      var wrap = document.createElement("div");
      wrap.className = "tycoon-dash";
      wrap.appendChild(frag);
      return wrap;
    },
  };

  /* ===========================================================
   * 16. TRENDING SYSTEM (Search / Explore tab)
   * ===========================================================
   * Every TREND_CYCLE_HOURS in-game hours, reroll 3 trending
   * topics from a categorised database. A post that "rides" an
   * active trend gets a TREND_MULTIPLIER viral boost.
   */
  var TREND_DB = {
    "Finance / Trading": [
      "Aster Network breakout analysis",
      "SUI token drop",
      "BTEK technical analysis",
    ],
    "Law / Civics": [
      "Sidang Mahkamah Konstitusi update",
      "Analisis Astagatra dan Ketahanan Nasional",
    ],
    "Gaming / Sports": [
      "Football Manager 2024 broken tactics",
      "F1 Manager 24 setup guide",
    ],
  };

  // Flatten the DB into a pool of { topic, category } entries.
  var TREND_POOL = (function () {
    var pool = [];
    Object.keys(TREND_DB).forEach(function (category) {
      TREND_DB[category].forEach(function (topic) {
        pool.push({ topic: topic, category: category });
      });
    });
    return pool;
  })();

  var TrendingSystem = {
    state: null,
    active: [],
    hours: 0,
    _nextId: 1,
    _rerollListeners: [],

    init: function (state) {
      this.state = state;
      this.gridEl = document.querySelector("[data-trend-grid]");
      this.reroll(); // seed an initial set at hour 0
      return this;
    },

    onReroll: function (fn) {
      this._rerollListeners.push(fn);
      return this;
    },

    // Engine tick handler: advance the clock, reroll on cycle.
    tick: function () {
      this.hours += 1;
      if (this.hours % TREND_CYCLE_HOURS === 0) {
        this.reroll();
      }
    },

    // Pick TREND_COUNT distinct topics at random.
    reroll: function () {
      var copy = TREND_POOL.slice();
      var picked = [];
      var n = Math.min(TREND_COUNT, copy.length);
      for (var i = 0; i < n; i++) {
        var idx = Math.floor(Math.random() * copy.length);
        var entry = copy.splice(idx, 1)[0];
        picked.push({
          id: this._nextId++,
          topic: entry.topic,
          category: entry.category,
          heat: Math.floor(Math.random() * 400) + 50, // 50k-450k posts
        });
      }
      this.active = picked;
      this.render();
      this._rerollListeners.forEach(function (fn) {
        fn(picked);
      });
    },

    getActive: function () {
      return this.active;
    },

    isActive: function (id) {
      return this.active.some(function (t) {
        return t.id === id;
      });
    },

    findById: function (id) {
      return this.active.filter(function (t) {
        return t.id === id;
      })[0];
    },

    // Deterministic gradient per topic for the thumbnail.
    gradientFor: function (topic) {
      var hash = 0;
      for (var i = 0; i < topic.length; i++) {
        hash = (hash << 5) - hash + topic.charCodeAt(i);
        hash |= 0;
      }
      var h1 = Math.abs(hash) % 360;
      var h2 = (h1 + 40) % 360;
      return (
        "linear-gradient(135deg, hsl(" +
        h1 +
        ",70%,55%), hsl(" +
        h2 +
        ",75%,42%))"
      );
    },

    render: function () {
      if (!this.gridEl) return;
      var self = this;
      this.gridEl.innerHTML = "";

      this.active.forEach(function (trend) {
        var cell = document.createElement("article");
        cell.className = "trend";
        cell.style.backgroundImage = self.gradientFor(trend.topic);

        var overlay = document.createElement("div");
        overlay.className = "trend__overlay";

        var cat = document.createElement("span");
        cat.className = "trend__category";
        cat.textContent = trend.category;

        var topic = document.createElement("span");
        topic.className = "trend__topic";
        topic.textContent = trend.topic;

        var heat = document.createElement("span");
        heat.className = "trend__heat";
        heat.textContent = "\uD83D\uDD25 " + fmt(trend.heat) + "K posts";

        overlay.appendChild(cat);
        overlay.appendChild(topic);
        overlay.appendChild(heat);
        cell.appendChild(overlay);
        self.gridEl.appendChild(cell);
      });
    },
  };

  /* ===========================================================
   * 17. PROCEDURAL FEED (Home tab + infinite scroll)
   * ===========================================================
   * Generates an endless stream of rival-influencer NPC posts.
   */
  var NPC_NAMES = [
    "lifewithmaya", "thefitzone", "crypto.danny", "chef_ramzi",
    "wanderlust.kai", "techbyleo", "studio.aria", "the.daily.grind",
    "footy.tactics", "minimal.nina", "raw.frames", "urban.echo",
    "the_quietcoder", "saltandsugar", "midnight.motors",
  ];

  var NPC_CAPTIONS = [
    "New drop just landed. Thoughts? \uD83D\uDC40",
    "POV: you finally hit your goal after months of grind.",
    "Spent all weekend on this. Worth it.",
    "Saving this one for later. Trust me.",
    "Nobody talks about this enough.",
    "Day 47 of documenting the journey.",
    "Underrated spot, don't tell everyone \uD83E\uDD2B",
    "This took 3 tries to get right.",
    "Honestly didn't expect this result.",
    "Drop a \uD83D\uDD25 if you agree.",
    "Behind the scenes of today's shoot.",
    "Small wins still count.",
  ];

  var FeedSystem = {
    state: null,

    init: function (state, trending) {
      this.state = state;
      this.trending = trending;
      this.scrollEl = document.querySelector("[data-home-scroll]");
      this.feedEl = document.querySelector("[data-home-feed]");
      this.loaderEl = document.querySelector("[data-home-loader]");
      this._loading = false;

      this.appendPosts(FEED_INITIAL_POSTS);
      this.bindScroll();
      return this;
    },

    rand: function (arr) {
      return arr[Math.floor(Math.random() * arr.length)];
    },

    // Build a single NPC post matching the required schema.
    generatePost: function () {
      var username = this.rand(NPC_NAMES);
      var hue = Math.floor(Math.random() * 360);
      var mins = Math.floor(Math.random() * 58) + 1;
      var time = Math.random() < 0.4 ? mins + "m" : (Math.floor(Math.random() * 23) + 1) + "h";

      // Occasionally reference a live trend so the feed feels current.
      var caption = this.rand(NPC_CAPTIONS);
      var trends = this.trending ? this.trending.getActive() : [];
      if (trends.length && Math.random() < 0.35) {
        var t = trends[Math.floor(Math.random() * trends.length)];
        caption = caption + " #" + t.topic.replace(/[^a-zA-Z0-9]+/g, "");
      }

      var likes = Math.floor(Math.random() * 48000) + 120;
      var imgHue = (hue + 90) % 360;

      var post = document.createElement("article");
      post.className = "npc-post";

      // Header: colored avatar circle + username + time
      var header = document.createElement("header");
      header.className = "npc-post__header";
      header.innerHTML =
        '<span class="npc-post__avatar" style="background:hsl(' +
        hue +
        ',65%,55%)">' +
        username.charAt(0).toUpperCase() +
        "</span>" +
        '<span class="npc-post__user">' +
        username +
        "</span>" +
        '<span class="npc-post__time">\u00B7 ' +
        time +
        "</span>" +
        '<span class="npc-post__more" aria-hidden="true">\u22EF</span>';

      // Image block (procedural gradient)
      var image = document.createElement("div");
      image.className = "npc-post__image";
      image.style.backgroundImage =
        "linear-gradient(135deg, hsl(" +
        hue +
        ",60%,60%), hsl(" +
        imgHue +
        ",65%,45%))";

      // Action row
      var actions = document.createElement("div");
      actions.className = "npc-post__actions";
      actions.innerHTML =
        '<span class="npc-post__icon">\u2661</span>' +
        '<span class="npc-post__icon">\uD83D\uDCAC</span>' +
        '<span class="npc-post__icon">\u27A4</span>';

      // Likes
      var likesEl = document.createElement("p");
      likesEl.className = "npc-post__likes";
      likesEl.textContent = fmt(likes) + " likes";

      // Caption: username (bold) + text
      var captionEl = document.createElement("p");
      captionEl.className = "npc-post__caption";
      var strong = document.createElement("strong");
      strong.textContent = username + " ";
      captionEl.appendChild(strong);
      captionEl.appendChild(document.createTextNode(caption));

      post.appendChild(header);
      post.appendChild(image);
      post.appendChild(actions);
      post.appendChild(likesEl);
      post.appendChild(captionEl);
      return post;
    },

    appendPosts: function (count) {
      var frag = document.createDocumentFragment();
      for (var i = 0; i < count; i++) {
        frag.appendChild(this.generatePost());
      }
      this.feedEl.appendChild(frag);
    },

    bindScroll: function () {
      var self = this;
      this.scrollEl.addEventListener("scroll", function () {
        var el = self.scrollEl;
        var remaining = el.scrollHeight - el.scrollTop - el.clientHeight;
        if (remaining <= FEED_SCROLL_THRESHOLD && !self._loading) {
          self._loading = true;
          if (self.loaderEl) self.loaderEl.classList.add("is-active");
          // Tiny delay mimics a network fetch and avoids burst-appends.
          setTimeout(function () {
            self.appendPosts(FEED_BATCH);
            self._loading = false;
            if (self.loaderEl) self.loaderEl.classList.remove("is-active");
          }, 220);
        }
      });
    },
  };

  /* ===========================================================
   * 18. BOOTSTRAP
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

    // Content systems (trends must exist before the post game reads them).
    var trending = TrendingSystem.init(state);
    var postGame = PostGame.init(state, trending);
    var feed = FeedSystem.init(state, trending);

    // Initialise late-game / negotiation subsystems.
    var negotiation = Negotiation.init(state);
    var ecommerce = Ecommerce.init(state);
    var tycoon = Tycoon.init(state, ecommerce);

    // Paint any pre-existing sponsors into the bio.
    renderSponsors(state);

    // Open the Tycoon dashboard from the profile button.
    var dashboardBtn = document.querySelector(".profile-actions__btn--dashboard");
    if (dashboardBtn) {
      dashboardBtn.addEventListener("click", function () {
        tycoon.open();
      });
    }

    // Refresh the post lock state each time the tab is opened.
    router.onChange(function (route) {
      if (route === "post") postGame.refresh();
      if (route === "dm") negotiation.render();
    });

    // Register subsystem tick handlers, then start the loop.
    Engine.init(state)
      .onTick(function (s) {
        negotiation.maybeGenerateOffer(s);
      })
      .onTick(function (s) {
        ecommerce.tick(s);
      })
      .onTick(function () {
        trending.tick();
      });
    Engine.start();

    // Expose for debugging / future game-loop modules.
    window.IS = {
      state: state,
      router: router,
      engine: Engine,
      postGame: postGame,
      negotiation: negotiation,
      ecommerce: ecommerce,
      tycoon: tycoon,
      trending: trending,
      feed: feed,
    };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
