function getServers() {
  return JSON.parse(localStorage.getItem("servers") || "[]");
}

function saveServers(arr) {
  localStorage.setItem("servers", JSON.stringify(arr));
}

function uid() {
  return (window.crypto && crypto.randomUUID)
    ? crypto.randomUUID()
    : String(Date.now()) + Math.random().toString(16).slice(2);
}

function slugify(str) {
  return (str || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 16) || "server";
}

function makeDomain(planName) {
  const base = slugify(planName);
  const suffix = Math.floor(Math.random() * 900 + 100);
  return `${base}${suffix}.ncsh.io`;
}

function getBillingCycle() {
  const active = document.querySelector('.billing .pill[aria-selected="true"]');
  return active?.dataset.billing || "monthly";
}

function addServerLocal({ planName, planType }) {
  const server = {
    id: uid(),
    name: `${planName} Server`,
    plan: planType,
    planName,
    billing: getBillingCycle(),
    domain: makeDomain(planName),
    status: "stopped",
    created_at: Date.now(),
  };

  const arr = getServers();
  arr.unshift(server);
  saveServers(arr);

  location.href = "./servers.html";
}

document.addEventListener("DOMContentLoaded", () => {
  document.addEventListener("click", (e) => {
    const btn = e.target.closest(".cs-btn");
    if (!btn) return;

    e.preventDefault();

    const card = btn.closest(".cs-plan");
    const planName = card?.querySelector(".cs-plan__name")?.textContent?.trim() || "Server";

    const isFree = !!card?.querySelector(".cs-tag--free");
    const planType = isFree ? "free" : "paid";

    addServerLocal({ planName, planType });
  });
});
