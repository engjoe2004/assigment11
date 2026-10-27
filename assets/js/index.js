// =====================================================================
// COSMOS - Space Dashboard
// Sections: 1) Today in Space (NASA APOD)  2) Launches (The Space Devs)
//           3) Planets (Solar System OpenData + Wikipedia descriptions)
// Each section loads on its own, so one failing API never breaks the rest.
// =====================================================================

// ---------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------
// DEMO_KEY is NASA's public demo key (limited requests). Get a free key at
// https://api.nasa.gov and paste it here to avoid the limit.
const NASA_API_KEY = "DEMO_KEY";

const APOD_URL = "https://api.nasa.gov/planetary/apod";
const LAUNCHES_URL = "https://ll.thespacedevs.com/2.3.0/launches/upcoming/?limit=10&mode=detailed";
const PLANETS_URL = "https://api.le-systeme-solaire.net/rest/bodies/?filter[]=isPlanet,eq,true";
const WIKI_URL = "https://en.wikipedia.org/api/rest_v1/page/summary/";

const AU_IN_KM = 149597870.7;

// The planets API has no colour or type, so we keep them here (same values
// the original design used).
const PLANET_STYLE = {
  mercury: { color: "#eab308", type: "Terrestrial", badge: "bg-orange-500/50 text-orange-200", wiki: "Mercury_(planet)" },
  venus:   { color: "#f97316", type: "Terrestrial", badge: "bg-orange-500/50 text-orange-200", wiki: "Venus" },
  earth:   { color: "#3b82f6", type: "Terrestrial", badge: "bg-blue-500/50 text-blue-200", wiki: "Earth" },
  mars:    { color: "#ef4444", type: "Terrestrial", badge: "bg-red-500/50 text-red-200", wiki: "Mars" },
  jupiter: { color: "#fb923c", type: "Gas Giant", badge: "bg-purple-500/50 text-purple-200", wiki: "Jupiter" },
  saturn:  { color: "#facc15", type: "Gas Giant", badge: "bg-yellow-500/50 text-yellow-200", wiki: "Saturn" },
  uranus:  { color: "#06b6d4", type: "Ice Giant", badge: "bg-cyan-500/50 text-cyan-200", wiki: "Uranus" },
  neptune: { color: "#2563eb", type: "Ice Giant", badge: "bg-blue-500/50 text-blue-200", wiki: "Neptune" },
};

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------
const $ = (id) => document.getElementById(id);

// fetch + JSON, and turn bad HTTP statuses into errors we can read
async function getJSON(url) {
  const response = await fetch(url);
  if (!response.ok) {
    const error = new Error("Request failed: " + response.status);
    error.status = response.status;
    throw error;
  }
  return response.json();
}

// Make text safe before placing it inside innerHTML
function safe(text) {
  const div = document.createElement("div");
  div.textContent = text == null ? "" : String(text);
  return div.innerHTML;
}

function isNumber(value) {
  return typeof value === "number" && isFinite(value);
}

function superscript(number) {
  const digits = { "-": "⁻", 0: "⁰", 1: "¹", 2: "²", 3: "³", 4: "⁴", 5: "⁵", 6: "⁶", 7: "⁷", 8: "⁸", 9: "⁹" };
  return String(number).split("").map((c) => digits[c] || c).join("");
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

// "2024-03-14" -> "March 14, 2024" (UTC so the day never shifts)
function longDate(iso) {
  const date = new Date(iso + "T00:00:00Z");
  if (isNaN(date)) return "Invalid Date";
  return date.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
}

function shortDate(iso) {
  const date = new Date(iso + "T00:00:00Z");
  if (isNaN(date)) return "Invalid Date";
  return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}

function messageHTML(icon, text, retryId) {
  return `
    <div class="text-center p-6 text-slate-400">
      <i class="fas ${icon} text-3xl text-yellow-400 mb-3"></i>
      <p class="mb-3">${safe(text)}</p>
      ${retryId ? `<button id="${retryId}" class="px-4 py-2 bg-slate-700 rounded-lg hover:bg-slate-600 transition-colors text-sm font-semibold">Try again</button>` : ""}
    </div>`;
}

function spinnerHTML(text) {
  return `
    <div class="col-span-full text-center p-10 text-slate-400">
      <i class="fas fa-spinner fa-spin text-4xl text-blue-400 mb-4"></i>
      <p>${safe(text)}</p>
    </div>`;
}

// ---------------------------------------------------------------------
// Navigation: sidebar links, section switching, mobile menu
// ---------------------------------------------------------------------
function setupNavigation() {
  const links = document.querySelectorAll(".nav-link");
  const sections = document.querySelectorAll(".app-section");
  const sidebar = $("sidebar");
  const menuButton = $("sidebar-toggle");

  function showSection(name) {
    sections.forEach((section) => {
      section.classList.toggle("hidden", section.dataset.section !== name);
    });
    links.forEach((link) => {
      const active = link.dataset.section === name;
      link.classList.toggle("bg-blue-500/10", active);
      link.classList.toggle("text-blue-400", active);
      link.classList.toggle("text-slate-300", !active);
      link.classList.toggle("hover:bg-slate-800", !active);
    });
    window.scrollTo({ top: 0 });
  }

  links.forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      showSection(link.dataset.section);
      sidebar.classList.remove("sidebar-open");
    });
  });

  menuButton.addEventListener("click", (event) => {
    event.stopPropagation();
    sidebar.classList.toggle("sidebar-open");
  });

  // Clicking outside the sidebar closes it (mobile)
  document.addEventListener("click", (event) => {
    if (!sidebar.contains(event.target)) sidebar.classList.remove("sidebar-open");
  });
}

// =====================================================================
// 1) TODAY IN SPACE - NASA APOD
// =====================================================================
let apodFullImage = "";

// Remove anything we added to the image box earlier (video, error text)
function clearApodExtras() {
  document.querySelectorAll("#apod-image-container .apod-extra").forEach((el) => el.remove());
}

function showApodLoading() {
  clearApodExtras();
  $("apod-image").classList.add("hidden");
  $("apod-loading").classList.remove("hidden");
}

function showApodError(message) {
  $("apod-loading").classList.add("hidden");
  $("apod-image").classList.add("hidden");
  clearApodExtras();

  const box = document.createElement("div");
  box.className = "apod-extra";
  box.innerHTML = messageHTML("fa-exclamation-triangle", message, "apod-retry");
  $("apod-image-container").prepend(box);
  $("apod-retry").addEventListener("click", () => loadApod($("apod-date-input").value));

  // Fill the text areas so the page doesn't show stale data
  $("apod-title").textContent = "Unavailable";
  $("apod-date-detail").innerHTML = '<i class="far fa-calendar mr-2"></i>--';
  $("apod-explanation").textContent = "";
  $("apod-copyright").textContent = "";
  $("apod-date-info").textContent = "--";
  $("apod-media-type").textContent = "--";
}

function showApod(data) {
  $("apod-loading").classList.add("hidden");
  clearApodExtras();

  const image = $("apod-image");
  const container = $("apod-image-container");
  const isVideo = data.media_type === "video";
  apodFullImage = data.hdurl || data.url || "";

  if (!isVideo) {
    // Normal picture
    image.src = data.url;
    image.alt = data.title || "Astronomy Picture of the Day";
    image.onerror = () => showApodError("Failed to load image");
    image.classList.remove("hidden");
  } else {
    // Video: embed YouTube/Vimeo, otherwise show thumbnail or a link
    image.classList.add("hidden");
    const canEmbed = /youtube\.com|youtu\.be|vimeo\.com/.test(data.url || "");
    const extra = document.createElement("div");
    extra.className = "apod-extra w-full h-full flex items-center justify-center";

    if (canEmbed) {
      extra.innerHTML = `<iframe class="w-full h-full" src="${safe(data.url)}" title="${safe(data.title)}" allowfullscreen></iframe>`;
    } else if (data.thumbnail_url) {
      extra.innerHTML = `<a href="${safe(data.url)}" target="_blank" rel="noopener" class="block w-full h-full">
        <img class="w-full h-full object-cover" src="${safe(data.thumbnail_url)}" alt="${safe(data.title)}" /></a>`;
    } else {
      extra.innerHTML = messageHTML("fa-video", "Today's APOD is a video.") +
        `<a href="${safe(data.url)}" target="_blank" rel="noopener" class="text-blue-400 underline">Watch it here</a>`;
    }
    container.prepend(extra);
  }

  $("apod-title").textContent = data.title || "Untitled";
  $("apod-date").textContent = "Astronomy Picture of the Day - " + longDate(data.date);
  $("apod-date-detail").innerHTML = `<i class="far fa-calendar mr-2"></i>${safe(data.date)}`;
  $("apod-explanation").textContent = data.explanation || "No description available.";
  $("apod-copyright").innerHTML = data.copyright
    ? "&copy; " + safe(data.copyright.replace(/\s+/g, " ").trim())
    : "Public domain (NASA)";
  $("apod-date-info").textContent = data.date;
  $("apod-media-type").textContent = isVideo ? "Video" : "Image";
}

async function loadApod(date) {
  showApodLoading();
  try {
    let url = APOD_URL + "?api_key=" + NASA_API_KEY;
    if (date) url += "&date=" + encodeURIComponent(date);
    const data = await getJSON(url);
    if (!data || !data.date) throw new Error("Empty response");
    showApod(data);
  } catch (error) {
    if (error.status === 429) showApodError("NASA request limit reached. Try again later or use your own API key.");
    else if (error.status === 400) showApodError("No picture exists for that date.");
    else showApodError("Could not load the Astronomy Picture of the Day.");
  }
}

function setupApod() {
  const dateInput = $("apod-date-input");
  const dateLabel = dateInput.closest("label").querySelector("span");

  function updateLabel() {
    dateLabel.textContent = dateInput.value ? shortDate(dateInput.value) : "Select date";
  }

  dateInput.max = todayISO();
  dateInput.value = todayISO();
  updateLabel();

  dateInput.addEventListener("change", updateLabel);

  $("load-date-btn").addEventListener("click", () => {
    if (dateInput.value) loadApod(dateInput.value);
  });

  $("today-apod-btn").addEventListener("click", () => {
    dateInput.value = todayISO();
    updateLabel();
    loadApod();
  });

  // "View Full Resolution" button on top of the picture
  $("apod-image-container").querySelector("button").addEventListener("click", () => {
    if (apodFullImage) window.open(apodFullImage, "_blank", "noopener");
  });

  loadApod();
}

// =====================================================================
// 2) LAUNCHES - The Space Devs (Launch Library 2)
// =====================================================================
let launches = [];
let favorites = [];

try {
  favorites = JSON.parse(localStorage.getItem("cosmos-favorites") || "[]");
} catch (error) {
  favorites = [];
}

function saveFavorites() {
  try {
    localStorage.setItem("cosmos-favorites", JSON.stringify(favorites));
  } catch (error) {
    // storage not available - favourites just won't persist
  }
}

// Turn one raw API launch into a simple object (handles null values)
function simplifyLaunch(raw) {
  const pad = raw.pad || {};
  const place = pad.location || {};
  const status = raw.status || {};
  const image = typeof raw.image === "string" ? raw.image : raw.image && raw.image.image_url;
  const date = raw.net ? new Date(raw.net) : null;
  const validDate = date && !isNaN(date) ? date : null;

  return {
    id: raw.id,
    name: raw.name || "Unnamed launch",
    status: status.abbrev || status.name || "TBD",
    statusFull: status.name || "To be determined",
    provider: (raw.launch_service_provider && raw.launch_service_provider.name) || "Unknown provider",
    rocket: (raw.rocket && raw.rocket.configuration && raw.rocket.configuration.name) || "Unknown rocket",
    location: place.name || pad.name || "Location unknown",
    country: (place.country && place.country.name) || place.country_code || "Unknown",
    description: (raw.mission && raw.mission.description) || "No mission description available yet.",
    image: image || "",
    date: validDate,
  };
}

function launchDate(launch, long) {
  if (!launch.date) return "TBD";
  const options = long
    ? { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "UTC" }
    : { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" };
  return launch.date.toLocaleDateString("en-US", options);
}

function launchTime(launch) {
  if (!launch.date) return "TBD";
  const time = launch.date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "UTC" });
  return time + " UTC";
}

function daysUntil(launch) {
  if (!launch.date) return "TBD";
  return Math.max(0, Math.ceil((launch.date - Date.now()) / 86400000));
}

// Colours for the status badge
function statusColors(status) {
  const s = status.toLowerCase();
  if (s === "go" || s === "success") return { solid: "bg-green-500/90", soft: "bg-green-500/20 text-green-400" };
  if (s === "tbc") return { solid: "bg-yellow-500/90", soft: "bg-yellow-500/20 text-yellow-400" };
  if (s.includes("fail")) return { solid: "bg-red-500/90", soft: "bg-red-500/20 text-red-400" };
  return { solid: "bg-blue-500/90", soft: "bg-blue-500/20 text-blue-400" };
}

function heartClass(launch) {
  return (favorites.includes(launch.id) ? "fas text-red-400" : "far") + " fa-heart";
}

// Image with the rocket icon behind it, so a broken image never shows
function launchPicture(launch, imageClass, iconClass) {
  const icon = `<i class="fas fa-rocket ${iconClass} text-slate-700"></i>`;
  if (!launch.image) return icon;
  return icon + `<img src="${safe(launch.image)}" alt="${safe(launch.name)}" loading="lazy" class="${imageClass}" onerror="this.remove()" />`;
}

function featuredHTML(launch) {
  const colors = statusColors(launch.status);
  return `
  <div data-launch-id="${safe(launch.id)}" class="relative bg-slate-800/30 border border-slate-700 rounded-3xl overflow-hidden group hover:border-blue-500/50 transition-all">
    <div class="absolute inset-0 bg-linear-to-r from-blue-500/10 via-purple-500/10 to-pink-500/10 opacity-0 group-hover:opacity-100 transition-opacity"></div>
    <div class="relative grid grid-cols-1 lg:grid-cols-2 gap-6 p-8">
      <div class="flex flex-col justify-between">
        <div>
          <div class="flex items-center gap-3 mb-4">
            <span class="px-4 py-1.5 bg-blue-500/20 text-blue-400 rounded-full text-sm font-semibold flex items-center gap-2"><i class="fas fa-star"></i>Featured Launch</span>
            <span class="px-4 py-1.5 ${colors.soft} rounded-full text-sm font-semibold">${safe(launch.status)}</span>
          </div>
          <h3 class="text-3xl font-bold mb-3 leading-tight">${safe(launch.name)}</h3>
          <div class="flex flex-col xl:flex-row xl:items-center gap-4 mb-6 text-slate-400">
            <div class="flex items-center gap-2"><i class="fas fa-building"></i><span>${safe(launch.provider)}</span></div>
            <div class="flex items-center gap-2"><i class="fas fa-rocket"></i><span>${safe(launch.rocket)}</span></div>
          </div>
          <div class="inline-flex items-center gap-3 px-6 py-3 bg-linear-to-r from-blue-500/20 to-purple-500/20 rounded-xl mb-6">
            <i class="fas fa-clock text-2xl text-blue-400"></i>
            <div>
              <p class="text-2xl font-bold text-blue-400">${safe(daysUntil(launch))}</p>
              <p class="text-xs text-slate-400">Days Until Launch</p>
            </div>
          </div>
          <div class="grid xl:grid-cols-2 gap-4 mb-6">
            <div class="bg-slate-900/50 rounded-xl p-4"><p class="text-xs text-slate-400 mb-1 flex items-center gap-2"><i class="fas fa-calendar"></i>Launch Date</p><p class="font-semibold">${safe(launchDate(launch, true))}</p></div>
            <div class="bg-slate-900/50 rounded-xl p-4"><p class="text-xs text-slate-400 mb-1 flex items-center gap-2"><i class="fas fa-clock"></i>Launch Time</p><p class="font-semibold">${safe(launchTime(launch))}</p></div>
            <div class="bg-slate-900/50 rounded-xl p-4"><p class="text-xs text-slate-400 mb-1 flex items-center gap-2"><i class="fas fa-map-marker-alt"></i>Location</p><p class="font-semibold text-sm">${safe(launch.location)}</p></div>
            <div class="bg-slate-900/50 rounded-xl p-4"><p class="text-xs text-slate-400 mb-1 flex items-center gap-2"><i class="fas fa-globe"></i>Country</p><p class="font-semibold">${safe(launch.country)}</p></div>
          </div>
          <p class="text-slate-300 leading-relaxed mb-6">${safe(launch.description)}</p>
        </div>
        <div class="flex flex-col md:flex-row gap-3">
          <button data-action="details" class="flex-1 self-start md:self-center px-6 py-3 bg-blue-500 rounded-xl hover:bg-blue-600 transition-colors font-semibold flex items-center justify-center gap-2"><i class="fas fa-info-circle"></i>View Full Details</button>
          <div class="icons self-end md:self-center">
            <button data-action="favorite" class="px-4 py-3 bg-slate-700 rounded-xl hover:bg-slate-600 transition-colors"><i class="${heartClass(launch)}"></i></button>
            <button data-action="bell" class="px-4 py-3 bg-slate-700 rounded-xl hover:bg-slate-600 transition-colors"><i class="fas fa-bell"></i></button>
          </div>
        </div>
      </div>
      <div class="relative">
        <div class="relative h-full min-h-[400px] rounded-2xl overflow-hidden bg-slate-900/50">
          <div class="flex items-center justify-center h-full min-h-[400px] bg-slate-800">
            ${launchPicture(launch, "absolute inset-0 w-full h-full object-cover", "text-9xl")}
          </div>
          <div class="absolute inset-0 bg-linear-to-t from-slate-900 via-transparent to-transparent"></div>
        </div>
      </div>
    </div>
  </div>`;
}

function cardHTML(launch) {
  const colors = statusColors(launch.status);
  return `
  <div data-launch-id="${safe(launch.id)}" class="bg-slate-800/50 border border-slate-700 rounded-2xl overflow-hidden hover:border-blue-500/30 transition-all group cursor-pointer">
    <div class="relative h-48 bg-slate-900/50 flex items-center justify-center overflow-hidden">
      ${launchPicture(launch, "absolute inset-0 w-full h-full object-cover", "text-5xl")}
      <div class="absolute top-3 right-3">
        <span class="px-3 py-1 ${colors.solid} text-white backdrop-blur-sm rounded-full text-xs font-semibold">${safe(launch.status)}</span>
      </div>
    </div>
    <div class="p-5">
      <div class="mb-3">
        <h4 class="font-bold text-lg mb-2 line-clamp-2 group-hover:text-blue-400 transition-colors">${safe(launch.name)}</h4>
        <p class="text-sm text-slate-400 flex items-center gap-2"><i class="fas fa-building text-xs"></i>${safe(launch.provider)}</p>
      </div>
      <div class="space-y-2 mb-4">
        <div class="flex items-center gap-2 text-sm"><i class="fas fa-calendar text-slate-500 w-4"></i><span class="text-slate-300">${safe(launchDate(launch, false))}</span></div>
        <div class="flex items-center gap-2 text-sm"><i class="fas fa-clock text-slate-500 w-4"></i><span class="text-slate-300">${safe(launchTime(launch))}</span></div>
        <div class="flex items-center gap-2 text-sm"><i class="fas fa-rocket text-slate-500 w-4"></i><span class="text-slate-300">${safe(launch.rocket)}</span></div>
        <div class="flex items-center gap-2 text-sm"><i class="fas fa-map-marker-alt text-slate-500 w-4"></i><span class="text-slate-300 line-clamp-1">${safe(launch.location)}</span></div>
      </div>
      <div class="flex items-center gap-2 pt-4 border-t border-slate-700">
        <button data-action="details" class="flex-1 px-4 py-2 bg-slate-700 rounded-lg hover:bg-slate-600 transition-colors text-sm font-semibold">Details</button>
        <button data-action="favorite" class="px-3 py-2 bg-slate-700 rounded-lg hover:bg-slate-600 transition-colors"><i class="${heartClass(launch)}"></i></button>
      </div>
    </div>
  </div>`;
}

function showLaunches() {
  const count = launches.length;
  $("launches-count").textContent = count + " Launches";
  $("launches-count-mobile").textContent = String(count);

  if (count === 0) {
    $("featured-launch").innerHTML = "";
    $("launches-grid").innerHTML = `<div class="col-span-full">${messageHTML("fa-rocket", "No upcoming launches found.", "launches-retry")}</div>`;
    $("launches-retry").addEventListener("click", loadLaunches);
    return;
  }

  // First launch is featured, the grid shows the rest
  $("featured-launch").innerHTML = featuredHTML(launches[0]);
  $("launches-grid").innerHTML = launches.slice(1).map(cardHTML).join("");
}

function openLaunchDetails(launch) {
  closeLaunchDetails();
  const modal = document.createElement("div");
  modal.id = "launch-modal";
  modal.className = "fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm";
  modal.innerHTML = `
    <div class="bg-slate-900 border border-slate-700 rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-6">
      <div class="flex justify-between items-start gap-4 mb-4">
        <h3 class="text-xl font-bold">${safe(launch.name)}</h3>
        <button data-close class="w-8 h-8 bg-slate-800 rounded-lg hover:bg-slate-700 shrink-0"><i class="fas fa-times"></i></button>
      </div>
      <div class="space-y-2 text-sm mb-4">
        <p><span class="text-slate-400">Status:</span> ${safe(launch.statusFull)}</p>
        <p><span class="text-slate-400">Provider:</span> ${safe(launch.provider)}</p>
        <p><span class="text-slate-400">Rocket:</span> ${safe(launch.rocket)}</p>
        <p><span class="text-slate-400">Date:</span> ${safe(launchDate(launch, true))}, ${safe(launchTime(launch))}</p>
        <p><span class="text-slate-400">Location:</span> ${safe(launch.location)}, ${safe(launch.country)}</p>
      </div>
      <p class="text-slate-300 leading-relaxed text-sm">${safe(launch.description)}</p>
    </div>`;
  modal.addEventListener("click", (event) => {
    if (event.target === modal || event.target.closest("[data-close]")) closeLaunchDetails();
  });
  document.body.appendChild(modal);
}

function closeLaunchDetails() {
  const modal = $("launch-modal");
  if (modal) modal.remove();
}

// One click listener per container (works even after the cards are re-drawn)
function onLaunchClick(event) {
  const card = event.target.closest("[data-launch-id]");
  if (!card) return;
  const launch = launches.find((l) => String(l.id) === card.dataset.launchId);
  if (!launch) return;

  const button = event.target.closest("[data-action]");
  const action = button ? button.dataset.action : "details";

  if (action === "favorite") {
    const index = favorites.indexOf(launch.id);
    if (index === -1) favorites.push(launch.id);
    else favorites.splice(index, 1);
    saveFavorites();
    button.querySelector("i").className = heartClass(launch);
  } else if (action === "details") {
    openLaunchDetails(launch);
  }
}

async function loadLaunches() {
  $("featured-launch").innerHTML = "";
  $("launches-grid").innerHTML = spinnerHTML("Loading upcoming launches...");

  try {
    const data = await getJSON(LAUNCHES_URL);
    // Remember the answer: the free API allows only ~15 requests per hour
    try { sessionStorage.setItem("cosmos-launches", JSON.stringify(data)); } catch (e) {}
    launches = (data.results || []).map(simplifyLaunch);
    showLaunches();
  } catch (error) {
    // If we are rate limited, fall back to the last saved answer
    let saved = null;
    try { saved = JSON.parse(sessionStorage.getItem("cosmos-launches")); } catch (e) {}
    if (saved && saved.results) {
      launches = saved.results.map(simplifyLaunch);
      showLaunches();
      return;
    }
    const text = error.status === 429
      ? "SpaceDevs request limit reached. Please try again in a few minutes."
      : "Could not load upcoming launches.";
    $("launches-grid").innerHTML = `<div class="col-span-full">${messageHTML("fa-exclamation-triangle", text, "launches-retry")}</div>`;
    $("launches-retry").addEventListener("click", loadLaunches);
  }
}

function setupLaunches() {
  $("featured-launch").addEventListener("click", onLaunchClick);
  $("launches-grid").addEventListener("click", onLaunchClick);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeLaunchDetails();
  });
  loadLaunches();
}

// =====================================================================
// 3) PLANETS - Solar System OpenData (+ Wikipedia for the description)
// =====================================================================
let planets = []; // sorted from the Sun outwards
let selectedPlanetId = "";
let earthMass = 0;
const descriptions = {}; // planet id -> text (cache, so we only ask once)

function planetMass(planet) {
  if (!planet.mass || !isNumber(planet.mass.massValue)) return 0;
  return planet.mass.massValue * Math.pow(10, planet.mass.massExponent);
}

function massText(planet) {
  if (!planet.mass || !isNumber(planet.mass.massValue)) return "N/A";
  return planet.mass.massValue + " × 10^" + planet.mass.massExponent + " kg";
}

function volumeText(planet) {
  if (!planet.vol || !isNumber(planet.vol.volValue)) return "N/A";
  return planet.vol.volValue + " × 10^" + planet.vol.volExponent + " km³";
}

function millionKm(km) {
  return isNumber(km) && km > 0 ? (km / 1e6).toFixed(1) + "M km" : "N/A";
}

function moonCount(planet) {
  return Array.isArray(planet.moons) ? planet.moons.length : 0; // null = no moons
}

function orbitInYears(days) {
  if (!isNumber(days)) return "N/A";
  return days >= 730 ? (days / 365.25).toFixed(1) + " years" : Math.round(days) + " days";
}

// ----- Planet cards (top grid) and comparison table -----
function drawPlanetCards() {
  $("planets-grid").innerHTML = planets.map((planet) => {
    const style = PLANET_STYLE[planet.id];
    const au = isNumber(planet.semimajorAxis) ? (planet.semimajorAxis / AU_IN_KM).toFixed(2) + " AU" : "N/A";
    return `
    <div class="planet-card bg-slate-800/50 border border-slate-700 rounded-2xl p-4 transition-all cursor-pointer group"
         data-planet-id="${planet.id}" style="--planet-color: ${style.color}"
         onmouseover="this.style.borderColor='${style.color}80'" onmouseout="this.style.borderColor='#334155'">
      <div class="relative mb-3 h-24 flex items-center justify-center">
        <img class="w-20 h-20 object-contain group-hover:scale-110 transition-transform" src="./assets/images/${planet.id}.png" alt="${safe(planet.englishName)}" />
      </div>
      <h4 class="font-semibold text-center text-sm">${safe(planet.englishName)}</h4>
      <p class="text-xs text-slate-400 text-center">${au}</p>
    </div>`;
  }).join("");
}

function drawComparisonTable() {
  const cell = "px-4 md:px-6 py-3 md:py-4 text-slate-300 text-sm md:text-base whitespace-nowrap";
  $("planet-comparison-tbody").innerHTML = planets.map((planet) => {
    const style = PLANET_STYLE[planet.id];
    const au = isNumber(planet.semimajorAxis) ? (planet.semimajorAxis / AU_IN_KM).toFixed(2) : "N/A";
    const diameter = isNumber(planet.meanRadius) ? Math.round(planet.meanRadius * 2).toLocaleString("en-US") : "N/A";
    const ratio = earthMass && planetMass(planet) ? planetMass(planet) / earthMass : null;
    const mass = ratio === null ? "N/A" : ratio.toFixed(ratio < 1 ? 3 : 1);
    const highlight = planet.id === selectedPlanetId ? "bg-blue-500/5" : "";
    return `
    <tr class="hover:bg-slate-800/30 transition-colors ${highlight}">
      <td class="px-4 md:px-6 py-3 md:py-4 sticky left-0 bg-slate-800 z-10">
        <div class="flex items-center space-x-2 md:space-x-3">
          <div class="w-6 h-6 md:w-8 md:h-8 rounded-full flex-shrink-0" style="background-color: ${style.color}"></div>
          <span class="font-semibold text-sm md:text-base whitespace-nowrap">${safe(planet.englishName)}</span>
        </div>
      </td>
      <td class="${cell}">${au}</td>
      <td class="${cell}">${diameter}</td>
      <td class="${cell}">${mass}</td>
      <td class="${cell}">${orbitInYears(planet.sideralOrbit)}</td>
      <td class="${cell}">${moonCount(planet)}</td>
      <td class="px-4 md:px-6 py-3 md:py-4 whitespace-nowrap"><span class="px-2 py-1 rounded text-xs ${style.badge}">${style.type}</span></td>
    </tr>`;
  }).join("");
}

// ----- Detail panel -----
function showPlanet(id) {
  const planet = planets.find((p) => p.id === id);
  if (!planet) return;
  selectedPlanetId = id;

  $("planet-detail-image").src = "./assets/images/" + id + ".png";
  $("planet-detail-image").alt = planet.englishName;
  $("planet-detail-name").textContent = planet.englishName;

  $("planet-distance").textContent = millionKm(planet.semimajorAxis);
  $("planet-radius").textContent = isNumber(planet.meanRadius) ? Math.round(planet.meanRadius) + " km" : "N/A";
  $("planet-mass").textContent = massText(planet);
  $("planet-density").textContent = isNumber(planet.density) ? planet.density.toFixed(2) + " g/cm³" : "N/A";
  $("planet-orbital-period").textContent = isNumber(planet.sideralOrbit) ? planet.sideralOrbit.toFixed(2) + " days" : "N/A";
  $("planet-rotation").textContent = isNumber(planet.sideralRotation) && planet.sideralRotation !== 0
    ? Math.abs(planet.sideralRotation).toFixed(2) + " hours"
    : "N/A";
  $("planet-moons").textContent = String(moonCount(planet));
  $("planet-gravity").textContent = isNumber(planet.gravity) ? planet.gravity + " m/s²" : "N/A";

  const discoverer = (planet.discoveredBy || "").trim();
  const discoveryDate = (planet.discoveryDate || "").trim();
  $("planet-discoverer").textContent = discoverer || "Known since antiquity";
  $("planet-discovery-date").textContent = discoveryDate || "Ancient times";
  $("planet-body-type").textContent = planet.bodyType || "Planet";
  $("planet-volume").textContent = volumeText(planet);

  $("planet-perihelion").textContent = millionKm(planet.perihelion);
  $("planet-aphelion").textContent = millionKm(planet.aphelion);
  $("planet-eccentricity").textContent = isNumber(planet.eccentricity) ? planet.eccentricity.toFixed(4) : "N/A";
  $("planet-inclination").textContent = isNumber(planet.inclination) ? planet.inclination.toFixed(2) + "°" : "N/A";
  $("planet-axial-tilt").textContent = isNumber(planet.axialTilt) ? planet.axialTilt + "°" : "N/A";
  $("planet-temp").textContent = isNumber(planet.avgTemp) && planet.avgTemp > 0
    ? Math.round(planet.avgTemp - 273.15) + "°C"
    : "N/A";
  $("planet-escape").textContent = isNumber(planet.escape) ? (planet.escape / 1000).toFixed(1) + " km/s" : "N/A";

  // Quick facts are built from the API data
  const facts = [
    "Mass: " + massText(planet),
    "Surface gravity: " + (isNumber(planet.gravity) ? planet.gravity + " m/s²" : "N/A"),
    "Density: " + (isNumber(planet.density) ? planet.density + " g/cm³" : "N/A"),
    "Axial tilt: " + (isNumber(planet.axialTilt) ? planet.axialTilt + "°" : "N/A"),
  ];
  $("planet-facts").innerHTML = facts.map((fact) => `
    <li class="flex items-start">
      <i class="fas fa-check text-green-400 mt-1 mr-2"></i>
      <span class="text-slate-300">${safe(fact)}</span>
    </li>`).join("");

  // Highlight the selected card and table row
  document.querySelectorAll(".planet-card").forEach((card) => {
    card.classList.toggle("ring-2", card.dataset.planetId === id);
    card.style.setProperty("--tw-ring-color", PLANET_STYLE[card.dataset.planetId].color);
  });
  drawComparisonTable();

  showDescription(planet);
}

// Description comes from Wikipedia (the planets API has none)
async function showDescription(planet) {
  const box = $("planet-detail-description");
  const id = planet.id;

  if (descriptions[id]) {
    box.textContent = descriptions[id];
    return;
  }

  box.textContent = "Loading description...";
  let text = "";
  try {
    const data = await getJSON(WIKI_URL + PLANET_STYLE[id].wiki);
    text = data.extract || "";
  } catch (error) {
    text = "";
  }
  descriptions[id] = text || "No description available for " + planet.englishName + ".";

  // The user may have clicked another planet while we were loading
  if (selectedPlanetId === id) box.textContent = descriptions[id];
}

async function loadPlanets() {
  $("planet-detail-description").innerHTML = '<i class="fas fa-spinner fa-spin text-blue-400 mr-2"></i>Loading planets...';
  try {
    const data = await getJSON(PLANETS_URL);
    const bodies = (data && data.bodies) || [];

    planets = bodies
      .map((body) => Object.assign({}, body, { id: (body.englishName || "").toLowerCase() }))
      .filter((body) => PLANET_STYLE[body.id])
      .sort((a, b) => a.semimajorAxis - b.semimajorAxis);

    if (planets.length === 0) throw new Error("No planets returned");

    const earth = planets.find((p) => p.id === "earth");
    earthMass = earth ? planetMass(earth) : 0;

    drawPlanetCards();
    showPlanet(earth ? "earth" : planets[0].id);
  } catch (error) {
    $("planet-detail-description").innerHTML = messageHTML("fa-exclamation-triangle", "Could not load planets from the Solar System OpenData API.", "planets-retry");
    $("planets-retry").addEventListener("click", loadPlanets);
  }
}

function setupPlanets() {
  // One listener on the grid - cards are re-drawn from the API data
  $("planets-grid").addEventListener("click", (event) => {
    const card = event.target.closest(".planet-card");
    if (!card) return;
    showPlanet(card.dataset.planetId);
    $("planet-detail-name").scrollIntoView({ behavior: "smooth", block: "center" });
  });
  loadPlanets();
}

// =====================================================================
// Start. Each setup is separate so an error in one can't stop the others.
// =====================================================================
document.addEventListener("DOMContentLoaded", () => {
  [setupNavigation, setupApod, setupLaunches, setupPlanets].forEach((setup) => {
    try {
      setup();
    } catch (error) {
      console.error(setup.name + " failed:", error);
    }
  });
});