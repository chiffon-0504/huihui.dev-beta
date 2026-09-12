import { createNavbar } from "./components/navbar";
import { createFooter } from "./components/footer";
import { createHome } from "./pages/home";
import { content, resolveLocale } from "./content";
import { link } from "./dom";
import "./styles/tokens.css";
import "./styles/reset.css";
import "./styles/base.css";
import "./styles/layout.css";
import "./styles/components/navbar.css";
import "./styles/components/footer.css";
import "./styles/pages/home.css";

const app = document.querySelector<HTMLElement>("#app");
if (!app) throw new Error("The v2 application mount is missing.");

const locale = resolveLocale(document.documentElement.lang);
app.replaceChildren(
  link(content[locale].skip, "#main-content", "skip-link"),
  createNavbar(locale),
  createHome(locale),
  createFooter(),
);
