import { createNavbar } from "./components/navbar";
import { createFooter } from "./components/footer";
import { createHome } from "./pages/home";
import { createAbout } from "./pages/about";
import { createWorks } from "./pages/works";
import { getContent, resolveLocale, resolvePage } from "./locales";
import { link } from "./dom";
import { createThemeController } from "./theme/controller";
import "./styles/index.css";

const theme = createThemeController();
const app = document.querySelector<HTMLElement>("#app");
if (!app) throw new Error("The v2 application mount is missing.");

const locale = resolveLocale(window.location.pathname);
const page = resolvePage(window.location.pathname);
app.replaceChildren(
  link(getContent(locale).skip, "#main-content", "skip-link"),
  createNavbar(locale, theme, page),
  page === "works" ? createWorks(locale) : page === "about" ? createAbout(locale) : createHome(locale),
  createFooter(locale),
);
