import { createRoot } from "react-dom/client";
import App from "../app.jsx";

const view = document.getElementById("view");
const nav = document.getElementById("nav");

const API = "http://localhost:7000";

function getToken() {
  return localStorage.getItem("token");
}

function setToken(t) {
  if (t) localStorage.setItem("token", t);
  else localStorage.removeItem("token");
}

function renderNav() {
  if (getToken()) {
    nav.innerHTML = `
      <a href="/servers">Home</a>
      <a href="/account">Account</a>
      <a href="/servers">Servers</a>
      <a href="#" id="logout">Sign Out</a>
    `;
    document.getElementById("logout").onclick = () => {
      setToken(null);
      navigate("/login");
    };
  } else {
    nav.innerHTML = `<a href="/login">Login</a>`;
  }

  nav.querySelectorAll("a").forEach(a => {
    a.onclick = e => {
      e.preventDefault();
      navigate(a.getAttribute("href"));
    };
  });
}

function navigate(path) {
  history.pushState({}, "", path);
  renderRoute(path);
}

async function login(username, password) {
  const res = await fetch(API + "/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password })
  });

  const data = await res.json();
  if (data.token) {
    setToken(data.token);
    navigate("/servers");
  }
}

function renderRoute(path) {
  renderNav();

  if (!getToken() && path !== "/login") {
    navigate("/login");
    return;
  }

  if (path === "/login") {
    view.innerHTML = `
      <div class="formBox">
        <h2>Login</h2>
        <input id="user" placeholder="Username" />
        <input id="pass" type="password" placeholder="Password" />
        <button id="btnLogin" class="btn primary">Login</button>
      </div>
    `;
    document.getElementById("btnLogin").onclick = () => {
      login(
        document.getElementById("user").value,
        document.getElementById("pass").value
      );
    };
  }

  if (path === "/servers") {
    view.innerHTML = `
      <div class="serversHead">
        <div>
          <div class="serversHead__title">Your Servers</div>
          <div class="serversHead__sub">Manage your servers</div>
        </div>
      </div>

      <div class="srv">
        <div>My Minecraft Server</div>
        <button id="open" class="srv__btn">Open Console</button>
      </div>
    `;

    document.getElementById("open").onclick = () => {
      navigate("/console");
    };
  }

  if (path === "/console") {
    view.innerHTML = `<div id="react-root"></div>`;
    const root = createRoot(document.getElementById("react-root"));
    root.render(<App />);
  }
}

window.onpopstate = () => renderRoute(location.pathname);

renderRoute(location.pathname || "/login");
