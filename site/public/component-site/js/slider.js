(function () {
    const text = document.querySelector("[data-review-text]");
    const name = document.querySelector("[data-review-name]");
    const country = document.querySelector("[data-review-country]");
    const prev = document.querySelector("[data-review-prev]");
    const next = document.querySelector("[data-review-next]");
    const dotsWrap = document.querySelector("[data-review-dots]");

    if (!text || !name || !country || !prev || !next || !dotsWrap) return;

    const reviews = [
        { text: "One of the best hosting services on the market. The panel is simple and the free tier is great for friends.", name: "Parth Sharma", country: "India" },
        { text: "Server starts fast, backups are easy, and performance is stable even with plugins.", name: "Mikael T.", country: "Sweden" },
        { text: "Great for testing modpacks before upgrading. Support answered quickly in Discord.", name: "Alex K.", country: "Ukraine" },
        { text: "Pricing is clear, the dashboard is clean, and the setup is basically one click.", name: "Sophie L.", country: "Germany" }
    ];

    let i = 0;

    function renderDots() {
        dotsWrap.innerHTML = "";
        reviews.forEach((_, idx) => {
            const d = document.createElement("span");
            d.className = "dot" + (idx === i ? " is-active" : "");
            d.addEventListener("click", () => { i = idx; render(); });
            dotsWrap.appendChild(d);
        });
    }

    function render() {
        text.textContent = reviews[i].text;
        name.textContent = reviews[i].name;
        country.textContent = reviews[i].country;
        renderDots();
    }

    prev.addEventListener("click", () => {
        i = (i - 1 + reviews.length) % reviews.length;
        render();
    });

    next.addEventListener("click", () => {
        i = (i + 1) % reviews.length;
        render();
    });

    render();
})();