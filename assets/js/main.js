/* =========================================================================
   Realm of Knights: The Siege — site behaviour: nav, scroll reveal, trailer, soundtrack.
   No cookies, no storage. Nothing is requested from YouTube until the
   visitor actually presses play on the trailer.
   ========================================================================= */

(function () {
  "use strict";

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------------- Sticky nav ------------------------------------------ */
  const nav = document.querySelector(".site-nav");
  const progress = document.querySelector(".scroll-progress span");

  function onScroll() {
    const y = window.scrollY;
    if (nav) nav.classList.toggle("is-scrolled", y > 20);
    if (progress) {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      progress.style.transform = "scaleX(" + (max > 0 ? y / max : 0) + ")";
    }
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

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

  /* ---------------- Scroll reveal, staggered within each group ---------- */
  const revealables = document.querySelectorAll(".reveal");
  if (reduced) {
    revealables.forEach(function (el) { el.classList.add("is-visible"); });
  } else if (revealables.length && "IntersectionObserver" in window) {
    // siblings inside a .stagger container come in one after another
    document.querySelectorAll(".stagger").forEach(function (group) {
      group.querySelectorAll(".reveal").forEach(function (el, i) {
        el.style.setProperty("--reveal-delay", (i * 0.09).toFixed(2) + "s");
      });
    });

    const ro = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        ro.unobserve(entry.target);
      });
    }, { threshold: 0.14, rootMargin: "0px 0px -6% 0px" });
    revealables.forEach(function (el) { ro.observe(el); });
  }

  /* ---------------- Smooth anchor scrolling (user clicks only) ----------
     Done in JS rather than CSS scroll-behavior so programmatic jumps stay
     instant, and offset by the nav so targets aren't hidden under it.     */
  document.querySelectorAll('a[href^="#"]').forEach(function (a) {
    a.addEventListener("click", function (e) {
      const id = a.getAttribute("href").slice(1);
      const target = id && document.getElementById(id);
      if (!target) return;
      e.preventDefault();
      const offset = (nav ? nav.offsetHeight : 0) + 12;
      const top = target.getBoundingClientRect().top + window.scrollY - offset;
      window.scrollTo({ top: top, behavior: reduced ? "auto" : "smooth" });
      history.replaceState(null, "", "#" + id);
    });
  });

  /* ---------------- Hero parallax on the ambient backdrop --------------- */
  const ambient = document.querySelector(".hero-ambient");
  if (ambient && !reduced) {
    let ticking = false;
    window.addEventListener("scroll", function () {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () {
        ambient.style.setProperty("--parallax", window.scrollY * 0.18 + "px");
        ticking = false;
      });
    }, { passive: true });
  }

  /* ---------------- Pointer glow on cards -------------------------------- */
  if (!reduced && window.matchMedia("(hover: hover)").matches) {
    document.querySelectorAll(".card").forEach(function (card) {
      card.addEventListener("pointermove", function (e) {
        const r = card.getBoundingClientRect();
        card.style.setProperty("--mx", (e.clientX - r.left) + "px");
        card.style.setProperty("--my", (e.clientY - r.top) + "px");
      });
    });
  }

  /* ---------------- Trailer: click-to-load YouTube facade ---------------
     The poster and play button are ours; only on click do we swap in the
     privacy-friendly nocookie embed. Video id lives in links.js.         */
  document.querySelectorAll("[data-trailer]").forEach(function (wrap) {
    const frame = wrap.querySelector(".trailer-frame");
    if (!frame) return;

    frame.addEventListener("click", function () {
      const id = (window.KR_LINKS && window.KR_LINKS.trailerId) || "";
      if (!id) return;

      const embed = document.createElement("div");
      embed.className = "trailer-embed";
      const iframe = document.createElement("iframe");
      iframe.src = "https://www.youtube-nocookie.com/embed/" + encodeURIComponent(id) +
                   "?autoplay=1&rel=0&modestbranding=1";
      iframe.title = wrap.getAttribute("data-title") || "Trailer";
      iframe.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture";
      iframe.referrerPolicy = "strict-origin-when-cross-origin";
      iframe.allowFullscreen = true;
      embed.appendChild(iframe);
      wrap.replaceChild(embed, frame);
    });
  });

  /* ---------------- Soundtrack players ---------------------------------- */
  const tracks = document.querySelectorAll(".track");
  let stopCurrent = null;

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
    const name = trackEl.querySelector(".track-name");
    const label = name ? name.textContent.trim() : "track";

    function stop() {
      audio.pause();
      trackEl.classList.remove("is-playing");
      btn.setAttribute("aria-label", "Play " + label);
    }

    btn.addEventListener("click", function () {
      if (trackEl.classList.contains("is-playing")) { stop(); return; }
      if (stopCurrent && stopCurrent !== stop) stopCurrent();
      stopCurrent = stop;
      audio.play();
      trackEl.classList.add("is-playing");
      btn.setAttribute("aria-label", "Pause " + label);
    });

    audio.addEventListener("timeupdate", function () {
      if (!audio.duration) return;
      fill.style.width = (audio.currentTime / audio.duration) * 100 + "%";
      time.textContent = fmt(audio.currentTime) + " / " + fmt(audio.duration);
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
