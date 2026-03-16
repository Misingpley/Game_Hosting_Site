document.addEventListener("DOMContentLoaded", () => {
  const list = document.querySelector("#serversList");
  const empty = document.querySelector("#emptyState");

  if (!list || !empty) {
    console.warn("servers.js: #serversList або #emptyState не знайдено");
    return;
  }

  function getServers() {
    return JSON.parse(localStorage.getItem("servers") || "[]");
  }

  function saveServers(arr) {
    localStorage.setItem("servers", JSON.stringify(arr));
  }

  function badgeText(planName, plan) {
    if (planName) return planName === "Bat" ? "Free Server" : planName;
    return plan === "free" ? "Free Server" : (plan || "Server");
  }

  function render() {
    const servers = getServers();

    if (!servers.length) {
      empty.hidden = false;
      list.innerHTML = "";
      return;
    }

    empty.hidden = true;

    list.innerHTML = servers.map((s) => `
      <article class="srv" data-id="${s.id}">
        <div class="srv__left">
          <div class="srv__icon"></div>

          <div class="srv__meta">
            <div class="srv__top">
              <div class="srv__name">${escapeHtml(s.name || "Server")}</div>
              <span class="srv__badge">${escapeHtml(badgeText(s.planName, s.plan))}</span>
            </div>
            <div class="srv__domain">${escapeHtml(s.domain || "")}</div>
          </div>
        </div>

        <div class="srv__right">
          <span class="srv__status">${escapeHtml(s.status || "stopped")}</span>

          <button class="srv__btn" data-action="start" title="Start" type="button">▶</button>
          <button class="srv__btn" data-action="restart" title="Restart" type="button">↻</button>
          <button class="srv__btn" data-action="stop" title="Stop" type="button">■</button>
        </div>
      </article>
    `).join("");
  }

  list.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;

    const card = btn.closest(".srv");
    if (!card) return;

    const id = card.dataset.id;
    const action = btn.dataset.action;

    const servers = getServers();
    const s = servers.find(x => x.id === id);
    if (!s) return;

    if (action === "start") s.status = "running";
    if (action === "stop") s.status = "stopped";
    if (action === "restart") s.status = "stopping";

    saveServers(servers);
    render();
  });

  function escapeHtml(str) {
    return String(str)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  render();
});
