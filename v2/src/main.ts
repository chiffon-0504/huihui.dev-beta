import { createNavbar } from "./components/navbar";
import { createFooter } from "./components/footer";
import { createHome } from "./pages/home";
import { content, resolveLocale } from "./content";
import { link } from "./dom";
import { createThemeController } from "./theme/controller";
import "./styles/index.css";

const theme = createThemeController();
const app = document.querySelector<HTMLElement>("#app");
if (!app) throw new Error("The v2 application mount is missing.");

const locale = resolveLocale(document.documentElement.lang);
app.replaceChildren(
  link(content[locale].skip, "#main-content", "skip-link"),
  createNavbar(locale, theme),
  createHome(locale),
  createFooter(),
);
