document.addEventListener("DOMContentLoaded", () => {
  const WEEKS_PER_MONTH = 52 / 12;

  const suffix = {
    weekly: "/wk",
    monthly: "/mo",
    quarterly: "/qtr",
    yearly: "/yr",
  };

  const money = (n) => (Math.round(n * 100) / 100).toFixed(2);

  document.querySelectorAll("[data-pricing]").forEach((root) => {
    const pills = root.querySelectorAll("[data-billing]");
    if (!pills.length) return;

    const targetSel = root.dataset.pricingTarget;
    const target = targetSel ? document.querySelector(targetSel) : root;
    const plans = target ? target.querySelectorAll("[data-plan]") : [];
    if (!plans.length) return;

    const basePeriod = (root.dataset.basePeriod || "monthly").toLowerCase();

    const weeklySurcharge = Number(root.dataset.weeklySurcharge || "0");
    const monthlyDiscount = Number(root.dataset.monthlyDiscount || "0");
    const quarterlyDiscount = Number(root.dataset.quarterlyDiscount || "0");
    const yearlyDiscount = Number(root.dataset.yearlyDiscount || "0");

    function calc(base, key) {
      if (basePeriod === "monthly") {
        const monthly = base;
        if (key === "monthly") return monthly;
        if (key === "quarterly") return monthly * 3 * (1 - quarterlyDiscount);
        if (key === "yearly") return monthly * 12 * (1 - yearlyDiscount);
        if (key === "weekly") return (monthly / WEEKS_PER_MONTH) * (1 + weeklySurcharge);
      } else {
        const weekly = base;
        const monthlyFull = weekly * WEEKS_PER_MONTH;
        if (key === "weekly") return weekly;
        if (key === "monthly") return monthlyFull * (1 - monthlyDiscount);
        if (key === "quarterly") return monthlyFull * 3 * (1 - quarterlyDiscount);
        if (key === "yearly") return monthlyFull * 12 * (1 - yearlyDiscount);
      }
      return base;
    }

    function setActive(key) {
      pills.forEach((p) => {
        const active = p.dataset.billing === key;
        p.classList.toggle("is-active", active);
        p.setAttribute("aria-selected", active ? "true" : "false");
      });

      plans.forEach((card) => {
        const base = Number(card.getAttribute("data-base-price") || "0");
        if (!isFinite(base) || base <= 0) return;

        const price = calc(base, key);

        const priceEl = card.querySelector("[data-price]");
        const sufEl = card.querySelector("[data-price-suffix]");
        if (priceEl) priceEl.textContent = money(price);
        if (sufEl) sufEl.textContent = suffix[key] || "/mo";
      });
    }

    pills.forEach((p) => p.addEventListener("click", () => setActive(p.dataset.billing)));
    setActive(root.dataset.defaultBilling || "yearly");
  });
});
