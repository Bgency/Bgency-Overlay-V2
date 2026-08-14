const API = "https://v3.football.api-sports.io";

let teamId = null;
let fixtureId = null;
let fixture = null;
let localClockTimer = null;
let eventTimer = null;
let lastEventIds = new Set();
let currentLeague = null;

const $ = (id) => document.getElementById(id);

function log(msg) {
  if (CONFIG.DEBUG) {
    $("debug").style.display = "block";
    $("debug").textContent = msg;
  }
}

async function api(path) {
  const res = await fetch(API + path, {
    method: "GET",
    headers: { "x-apisports-key": CONFIG.API_KEY }
  });

  const data = await res.json();

  if (!res.ok || (data.errors && Object.keys(data.errors).length)) {
    throw new Error(JSON.stringify(data.errors || {status: res.status}));
  }

  return data;
}

function setLogo(img, url) {
  if (url) {
    img.src = url;
    img.style.visibility = "visible";
  } else {
    img.removeAttribute("src");
    img.style.visibility = "hidden";
  }
}

function formatDateTime(timestamp) {
  if (!timestamp) return { date: "—", time: "—" };

  const d = new Date(timestamp * 1000);

  return {
    date: d.toLocaleDateString("fr-FR", {
      weekday: "long",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      timeZone: CONFIG.TIMEZONE
    }),
    time: d.toLocaleTimeString("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: CONFIG.TIMEZONE
    })
  };
}

function stateLabel(short) {
  const map = {
    NS:"AVANT-MATCH",
    TBD:"À CONFIRMER",
    "1H":"EN DIRECT",
    "2H":"EN DIRECT",
    ET:"PROLONGATIONS",
    P:"TIRS AU BUT",
    HT:"MI-TEMPS",
    FT:"FIN DU MATCH",
    AET:"FIN DU MATCH",
    PEN:"TIRS AU BUT",
    PST:"REPORTÉ",
    CANC:"ANNULÉ",
    ABD:"ARRÊTÉ"
  };
  return map[short] || "EN DIRECT";
}

function stateIsLive(short) {
  return ["1H","2H","ET","P"].includes(short);
}

function render(data) {
  fixture = data;
  currentLeague = data.league || null;

  const teams = data.teams;
  const home = teams.home;
  const away = teams.away;

  $("homeName").textContent =
    home.name === "FC Sochaux-Montbéliard" ? "SOCHAUX" : home.name;
  $("awayName").textContent =
    away.name === "FC Sochaux-Montbéliard" ? "SOCHAUX" : away.name;

  $("homeShort").textContent = home.name;
  $("awayShort").textContent = away.name;

  setLogo($("homeLogo"), home.logo);
  setLogo($("awayLogo"), away.logo);

  $("homeScore").textContent = data.goals.home ?? 0;
  $("awayScore").textContent = data.goals.away ?? 0;

  const short = data.fixture.status.short;
  $("matchState").textContent = stateLabel(short);
  $("liveTag").textContent = stateIsLive(short) ? "● EN DIRECT" : "● " + stateLabel(short);

  $("competition").textContent = data.league?.name || "—";
  $("round").textContent = data.league?.round || "—";

  $("stadium").textContent = data.fixture.venue?.name || "Stade Bonal";
  $("city").textContent = data.fixture.venue?.city || "Montbéliard";

  const dt = formatDateTime(data.fixture.timestamp);
  $("matchDate").textContent = dt.date;
  $("matchTime").textContent = dt.time;

  $("attendance").textContent =
    data.fixture.attendance != null
      ? Number(data.fixture.attendance).toLocaleString("fr-FR")
      : "—";

  startLocalClock(data.fixture.status);
  $("overlay").classList.remove("hidden");
}

function startLocalClock(status) {
  clearInterval(localClockTimer);

  const short = status.short;

  if (["FT","AET","PST","CANC","ABD"].includes(short)) {
    $("clock").textContent = "90:00";
    return;
  }

  if (short === "HT") {
    $("clock").textContent = "45:00";
    return;
  }

  if (["1H","2H","ET","P"].includes(short)) {
    const baseMinutes = Number(status.elapsed || 0);
    const startedAt = Date.now();

    const tick = () => {
      const seconds =
        baseMinutes * 60 +
        Math.floor((Date.now() - startedAt) / 1000);

      $("clock").textContent =
        String(Math.floor(seconds / 60)).padStart(2, "0") +
        ":" +
        String(seconds % 60).padStart(2, "0");
    };

    tick();
    localClockTimer = setInterval(tick, 1000);
  } else {
    $("clock").textContent = "00:00";
  }
}

function eventIcon(event) {
  if (event.type === "Goal") return "⚽";
  if (event.type === "Card") {
    return event.detail === "Red Card" ? "🟥" : "🟨";
  }
  if (event.type === "Subst") return "🔄";
  return "📣";
}

function eventText(event) {
  const minute = event.time?.elapsed ?? "";
  const extra = event.time?.extra ? "+" + event.time.extra : "";
  const minuteText = minute ? `${minute}${extra}'` : "";

  let text = "";

  if (event.type === "Goal") {
    const player = event.player?.name || "";
    text = player || "But";
  } else if (event.type === "Card") {
    text = event.detail || "Carton";
  } else if (event.type === "Subst") {
    const player = event.player?.name || "";
    text = player ? `Remplacement — ${player}` : "Remplacement";
  } else {
    text = event.detail || event.type || "Événement";
  }

  return { minuteText, text };
}

function renderEvents(events) {
  const container = $("eventsList");

  if (!events.length) {
    container.innerHTML = '<div class="empty">Aucun événement</div>';
    return;
  }

  const sorted = [...events]
    .sort((a,b) => {
      const am = Number(a.time?.elapsed || 0);
      const bm = Number(b.time?.elapsed || 0);
      return bm - am;
    })
    .slice(0, 7);

  container.innerHTML = sorted.map(ev => {
    const { minuteText, text } = eventText(ev);
    const teamClass =
      ev.team?.id === fixture?.teams?.home?.id ? "homeEvent" : "awayEvent";

    return `
      <div class="eventRow">
        <span class="eventMinute">${minuteText}</span>
        <span class="eventType ${teamClass}">${eventIcon(ev)}</span>
        <span class="eventPlayer">${escapeHtml(text)}</span>
        <img class="eventLogo" src="${escapeAttr(ev.team?.logo || "")}" alt="">
      </div>
    `;
  }).join("");
}

function showEvent(event) {
  const icon = eventIcon(event);
  const { minuteText, text } = eventText(event);

  $("eventIcon").textContent = icon;
  $("eventText").textContent =
    `${minuteText ? minuteText + " — " : ""}${text}`;

  $("eventBanner").classList.add("show");

  clearTimeout(eventTimer);
  eventTimer = setTimeout(
    () => $("eventBanner").classList.remove("show"),
    6000
  );
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value);
}

async function updateEvents() {
  if (!fixtureId || !CONFIG.SHOW_EVENTS) return;

  try {
    const data = await api(`/fixtures/events?fixture=${fixtureId}`);
    const events = data.response || [];

    renderEvents(events);

    for (const ev of events) {
      const id =
        `${ev.time?.elapsed}-${ev.time?.extra}-${ev.type}-${ev.detail}-${ev.player?.id}`;

      if (!lastEventIds.has(id)) {
        lastEventIds.add(id);

        // Ne déclenche le bandeau que pour un événement apparu après le premier chargement.
        if (lastEventIds.size > events.length) {
          showEvent(ev);
        }
      }
    }
  } catch (e) {
    log("Événements : " + e.message);
  }
}

async function updateStandings() {
  if (!teamId || !currentLeague || !CONFIG.SHOW_STANDINGS) return;

  try {
    const season =
      currentLeague.season || new Date().getFullYear();

    const data = await api(
      `/standings?league=${currentLeague.id}&season=${season}`
    );
log(`STANDINGS | league=${currentLeague?.id} | season=$
  {season} | response=$
    {data?.response?.length || 0}`);
    const standingsDebug = $("standingsList");

if (standingsDebug) {
  standingsDebug.innerHTML =
    `<div class="empty">
      DEBUG : Ligue ${currentLeague?.id || "-"}<br>
      Saison ${season}<br>
      Réponse API : ${data?.response?.length || 0}
    </div>`;
}
    return;
    // API-Football peut retourner plusieurs groupes selon la compétition
    const standings =
      data?.response?.[0]?.league?.standings ||
      data?.response?.[0]?.standings ||
      [];

    // On récupère toutes les équipes dans tous les groupes
    const table = Array.isArray(standings)
      ? standings.flat().filter(Boolean)
      : [];

    if (!table.length) {
      $("standingsList").innerHTML =
        '<div class="empty">Classement indisponible</div>';
      return;
    }

    // Recherche de Sochaux dans le classement
    const teamPosition = table.findIndex(
      row => String(row?.team?.id) === String(teamId)
    );

    // Si Sochaux est trouvé : 3 équipes avant + Sochaux + 3 après
    let start;

    if (teamPosition >= 0) {
      start = Math.max(0, teamPosition - 3);
    } else {
      start = 0;
    }

    const visible = table.slice(start, start + 7);

    const standingsEl = $("#standingsList");
    if (!standingsEl) return;
    standingsEl.innerHTML = visible.map(row => `
      <div class="standingRow ${
        String(row?.team?.id) === String(teamId)
          ? "currentTeam"
          : ""
      }">
        <span>${row?.rank ?? "-"}</span>

        <span class="standingTeam">
          <img
            src="${escapeAttr(row?.team?.logo || "")}"
            alt=""
          >
          ${escapeHtml(row?.team?.name || "-")}
        </span>

        <span>${row?.points ?? "-"}</span>

        <span>
          ${
            row?.goalsDiff > 0
              ? "+"
              : ""
          }${row?.goalsDiff ?? "-"}
        </span>
      </div>
    `).join("");

  } catch (err) {
  console.error("Erreur classement :", err);

  const standingsEl = $("standingsList");

  if (standingsEl) {
    standingsEl.innerHTML =
      '<div class="empty">Classement indisponible</div>';
  }

  log("Erreur classement : " + (err?.message || err));
  }
}     

async function updateNextMatch() {
  if (!teamId || !CONFIG.SHOW_NEXT_MATCH) return;

  try {
    const data = await api(
      `/fixtures?team=${teamId}&next=1&timezone=${encodeURIComponent(CONFIG.TIMEZONE)}`
    );

    const next = data.response?.[0];
    if (!next) return;

    setLogo($("nextHomeLogo"), next.teams.home.logo);
    setLogo($("nextAwayLogo"), next.teams.away.logo);

    $("nextHomeName").textContent =
      next.teams.home.name === "FC Sochaux-Montbéliard"
        ? "SOCHAUX"
        : next.teams.home.name;

    $("nextAwayName").textContent =
      next.teams.away.name === "FC Sochaux-Montbéliard"
        ? "SOCHAUX"
        : next.teams.away.name;

    const dt = formatDateTime(next.fixture.timestamp);
    $("nextDate").textContent = `${dt.date} • ${dt.time}`;

    $("nextVenue").textContent =
      next.fixture.venue?.name
        ? `${next.fixture.venue.name}${next.fixture.venue.city ? " • " + next.fixture.venue.city : ""}`
        : "—";
  } catch (e) {
    log("Prochain match : " + e.message);
  }
}

async function updateFixture() {
  if (!fixtureId) return;

  try {
    const data = await api(`/fixtures?id=${fixtureId}`);

    if (!data.response?.length) return;

    const current = data.response[0];
    const oldScore = fixture
      ? `${fixture.goals.home}-${fixture.goals.away}`
      : "";

    render(current);

    const newScore = `${current.goals.home}-${current.goals.away}`;

    if (oldScore && oldScore !== newScore) {
      const homeChanged =
        current.goals.home !== fixture.goals.home;

      const teamName = homeChanged
        ? current.teams.home.name
        : current.teams.away.name;

      showEvent({
        type: "Goal",
        team: { name: teamName },
        player: { name: "" },
        time: { elapsed: current.fixture.status.elapsed }
      });
    }

    if (CONFIG.SHOW_EVENTS) await updateEvents();
    log(`OK • ${new Date().toLocaleTimeString()}`);
  } catch (e) {
    log("Erreur API : " + e.message);
  }
}

async function findTeam() {
  const data = await api(
    `/teams?search=${encodeURIComponent(CONFIG.TEAM_SEARCH)}`
  );

  const found = (data.response || []).find(x =>
    /sochaux/i.test(x.team?.name || "")
  );

  if (!found) {
    throw new Error("FC Sochaux introuvable dans API-Football.");
  }

  teamId = found.team.id;
  log(`Sochaux trouvé : ${teamId}`);
}

async function findMatch() {
  const today = new Date().toISOString().slice(0,10);

  let data = await api(
    `/fixtures?team=${teamId}&season=2026&date=${today}&timezone=${encodeURIComponent(CONFIG.TIMEZONE)}`
  );

  if (!data.response?.length) {
    data = await api(
      `/fixtures?team=${teamId}&season=2026&next=1&timezone=${encodeURIComponent(CONFIG.TIMEZONE)}`
    );
  }

  if (!data.response?.length) {
    throw new Error("Aucun match Sochaux trouvé.");
  }

  const candidates = data.response.filter(x =>
    x.teams.home.id === teamId || x.teams.away.id === teamId
  );

  fixtureId = (candidates[0] || data.response[0]).fixture.id;

  await updateFixture();
  await updateEvents();
  await updateStandings();
  await updateNextMatch();
}

async function boot() {
  try {
    if (!CONFIG.API_KEY || CONFIG.API_KEY.includes("COLLE_TA_CLE")) {
      throw new Error("Ajoute ta clé API dans config.js");
    }

    await findTeam();
    await findMatch();

    setInterval(async () => {
      await updateFixture();

      // Ces données sont moins sensibles au temps :
      // on ne les recharge qu'une fois sur 5.
    }, CONFIG.REFRESH_MS);

  } catch (e) {
    $("overlay").classList.remove("hidden");
    $("matchState").textContent = "CONFIGURATION";
    $("clock").textContent = "--:--";
    log(e.message);

    if (!CONFIG.DEBUG) {
      $("debug").style.display = "block";
      $("debug").textContent = "BGency Overlay : " + e.message;
    }
  }
}

boot();
