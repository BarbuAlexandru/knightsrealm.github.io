/* =========================================================================
   Knight's Realm — external links & contact configuration.

   This is the ONLY file you need to edit when the real store pages,
   social accounts, trailer or contact email go live. Leave a url empty ("")
   to keep that button in its "coming soon" placeholder state.
   ========================================================================= */

window.KR_LINKS = {
  steam:      { url: "", label: "Steam" },          // Steam store / wishlist page
  googleplay: { url: "", label: "Google Play" },    // Google Play store page
  appstore:   { url: "", label: "App Store" },      // Apple App Store page
  instagram:  { url: "", label: "Instagram" },      // Instagram profile
  youtube:    { url: "", label: "YouTube" },        // YouTube channel
  email:      "contact@knightsrealm.example",       // PLACEHOLDER — swap for the real game email

  /* PLACEHOLDER trailer — currently Blender Foundation's "Big Buck Bunny"
     (CC-BY), standing in until the real trailer is cut. Swap this id for the
     Knight's Realm trailer and drop the "Placeholder trailer" tag from the
     markup in index.html. */
  trailerId: "aqz-KE-bpKQ",
};

/* Wire every element carrying data-link="<key>" to its configured URL.
   Unconfigured links stay non-navigating and get a "coming soon" style. */
(function () {
  const KR_LINKS = window.KR_LINKS;

  document.querySelectorAll("[data-link]").forEach(function (el) {
    const key = el.getAttribute("data-link");

    if (key === "email") {
      el.setAttribute("href", "mailto:" + KR_LINKS.email);
      if (el.hasAttribute("data-link-text")) el.textContent = KR_LINKS.email;
      return;
    }

    const entry = KR_LINKS[key];
    if (!entry || typeof entry !== "object") return;

    if (entry.url) {
      el.setAttribute("href", entry.url);
      el.setAttribute("target", "_blank");
      el.setAttribute("rel", "noopener");
      el.classList.remove("is-placeholder");
    } else {
      el.setAttribute("href", "#");
      el.classList.add("is-placeholder");
      el.setAttribute("title", entry.label + " — coming soon");
      el.setAttribute("aria-disabled", "true");
      el.addEventListener("click", function (e) { e.preventDefault(); });
    }
  });
})();
