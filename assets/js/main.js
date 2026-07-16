/* =========================================================================
   Knight's Realm — site behaviour: nav, scroll-reveal, team switcher,
   soundtrack players. No cookies, no storage, no external requests.
   ========================================================================= */

(function () {
  "use strict";

  /* ---------------- Sticky nav: solid background once scrolled ---------- */
  const nav = document.querySelector(".site-nav");
  if (nav) {
    const onScroll = function () {
      nav.classList.toggle("is-scrolled", window.scrollY > 24);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }

  /* ---------------- Mobile menu ----------------------------------------- */
  const burger = document.querySelector(".nav-burger");
  if (burger && nav) {
    burger.addEventListener("click", function () {
      const open = nav.classList.toggle("menu-open");
      burger.setAttribute("aria-expanded", open ? "true" : "false");
    });
    nav.querySelectorAll(".nav-links a").forEach(function (a) {
      a.addEventListener("click", function () {
        nav.classList.remove("menu-open");
        burger.setAttribute("aria-expanded", "false");
      });
    });
  }

  /* ---------------- Scroll reveal --------------------------------------- */
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const revealables = document.querySelectorAll(".reveal");
  if (reduced) {
    revealables.forEach(function (el) { el.classList.add("is-visible"); });
  } else if (revealables.length) {
    const ro = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          ro.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });
    revealables.forEach(function (el) { ro.observe(el); });
  }

  /* ---------------- Smooth anchor scrolling (user clicks only) ---------- */
  document.querySelectorAll('a[href^="#"]').forEach(function (a) {
    a.addEventListener("click", function (e) {
      const id = a.getAttribute("href").slice(1);
      const target = id && document.getElementById(id);
      if (!target) return;
      e.preventDefault();
      target.scrollIntoView({ behavior: reduced ? "auto" : "smooth" });
      history.replaceState(null, "", "#" + id);
    });
  });

  /* ---------------- Pause hero cloud animations while off-screen -------- */
  const hero = document.querySelector(".hero");
  if (hero && "IntersectionObserver" in window) {
    new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        hero.classList.toggle("is-offscreen", !entry.isIntersecting);
      });
    }).observe(hero);
  }

  /* ---------------- Team colour switcher --------------------------------
     Buttons: .team-switch [data-team="Blue|Red|Purple|Yellow"]
     Targets: [data-team-src] holding a template with {TEAM} tokens.
       - .sprite elements swap their data-sheet (re-inited via KRSprites)
       - <img> elements swap their src                                     */
  const teamButtons = document.querySelectorAll("[data-team]");
  function setTeam(team) {
    teamButtons.forEach(function (b) {
      b.classList.toggle("is-active", b.getAttribute("data-team") === team);
    });
    document.querySelectorAll("[data-team-src]").forEach(function (el) {
      const url = el.getAttribute("data-team-src").split("{TEAM}").join(team);
      if (el.classList.contains("sprite")) {
        if (el.getAttribute("data-sheet") !== url) {
          el.setAttribute("data-sheet", url);
          if (window.KRSprites) window.KRSprites.refresh(el);
        }
      } else if (el.tagName === "IMG") {
        el.src = url;
      }
    });
    document.querySelectorAll(".team-accent").forEach(function (el) {
      el.setAttribute("data-current-team", team);
    });
  }
  teamButtons.forEach(function (b) {
    b.addEventListener("click", function () { setTeam(b.getAttribute("data-team")); });
  });

  /* ---------------- Soundtrack players ----------------------------------
     Markup: .track (data-src) > .track-play, .track-bar > .track-fill,
     .track-time. Only one track plays at a time.                          */
  const tracks = document.querySelectorAll(".track");
  let current = null;

  function fmt(t) {
    if (!isFinite(t)) return "0:00";
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    return m + ":" + (s < 10 ? "0" : "") + s;
  }

  tracks.forEach(function (trackEl) {
    const audio = new Audio();
    audio.preload = "none";
    audio.src = trackEl.getAttribute("data-src");

    const btn = trackEl.querySelector(".track-play");
    const fill = trackEl.querySelector(".track-fill");
    const time = trackEl.querySelector(".track-time");
    const bar = trackEl.querySelector(".track-bar");

    function stop() {
      audio.pause();
      trackEl.classList.remove("is-playing");
      btn.setAttribute("aria-label", "Play");
    }

    btn.addEventListener("click", function () {
      if (trackEl.classList.contains("is-playing")) { stop(); return; }
      if (current && current !== stop) current();
      current = stop;
      audio.play();
      trackEl.classList.add("is-playing");
      btn.setAttribute("aria-label", "Pause");
    });

    audio.addEventListener("timeupdate", function () {
      if (audio.duration) {
        fill.style.width = (audio.currentTime / audio.duration) * 100 + "%";
        time.textContent = fmt(audio.currentTime) + " / " + fmt(audio.duration);
      }
    });
    audio.addEventListener("ended", function () {
      stop();
      fill.style.width = "0%";
    });

    if (bar) {
      bar.addEventListener("click", function (e) {
        if (!audio.duration) return;
        const rect = bar.getBoundingClientRect();
        audio.currentTime = ((e.clientX - rect.left) / rect.width) * audio.duration;
      });
    }
  });

  /* ---------------- Footer year ----------------------------------------- */
  document.querySelectorAll("[data-year]").forEach(function (el) {
    el.textContent = new Date().getFullYear();
  });
})();
