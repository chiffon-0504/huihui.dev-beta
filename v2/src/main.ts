import { createNavbar } from "./components/navbar";
import { createFooter } from "./components/footer";
import { createHome } from "./pages/home";
import { createAbout } from "./pages/about";
import { createPosts } from "./pages/posts";
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
const navbar = createNavbar(locale, theme, page);
app.replaceChildren(
  link(getContent(locale).skip, "#main-content", "skip-link"),
  navbar,
  page === "posts" ? createPosts(locale) : page === "works" ? createWorks(locale) : page === "about" ? createAbout(locale) : createHome(locale),
  createFooter(locale),
);

// Set the offset before initial fragment scrolling; observe wrapping/zoom afterward.
// This measures layout only: the browser retains native fragment and focus scrolling.
const updateHeaderHeight = () => {
  document.documentElement.style.setProperty("--header-height", `${navbar.getBoundingClientRect().height}px`);
};
updateHeaderHeight();
new ResizeObserver(updateHeaderHeight).observe(navbar);
