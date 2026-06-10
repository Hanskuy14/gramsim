/* =============================================================
 * Influencer Simulator - Core
 * Contains ONLY: Global State (Proxy) + View Router.
 * No game loops yet.
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
   * 5. BOOTSTRAP
   * ===========================================================
   */
  function boot() {
    // Instantiate global, reactive state.
    var state = new State(initialState);

    // Keep the DOM in sync with any state mutation.
    state.subscribe(function (path, value) {
      renderBinding(document, path, value);
    });

    // Initial paint from current values.
    renderAll(state);

    // Wire up navigation.
    var router = new Router({
      viewSelector: ".view",
      tabSelector: ".nav__tab",
      defaultRoute: "profile",
    }).init();

    // Expose for debugging / future game-loop modules.
    window.IS = { state: state, router: router };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
