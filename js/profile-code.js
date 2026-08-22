window.HUIHUI_PROFILE_CODE = {
  zh: `# huihuidev.py

from __future__ import annotations
from typing import List

class HuiHui:
    """Developer profile object."""

    def __init__(self) -> None:
        self.name: str = "huihui"
        self.major: str = "Electronic Engineering"
        self.hobbies: List[str] = ["Photography", "Rhythm Games", "Galgame"]
        self.website: str = "huihui.dev"
        self.contact: str = "contact@huihui.dev"

        self.skills: List[str] = [
            "HTML",
            "CSS",
            "JavaScript",
            "Git",
            "GitHub",
        ]

        self.workflow: List[str] = [
            "Issues",
            "Branches",
            "Pull Requests",
            "GitHub Actions",
        ]

        self.projects: List[str] = [
            "huihui.dev (custom UI, code rendering, GitHub workflow)",
        ]

        self.favorite_composers: List[str] = [
            "Laur",
            "USAO",
            "Sakuzyo",
            "ak+q",
        ]

        self.favorite_bands: List[str] = [
            "Morfonica",
            "Ave Mujica",
        ]

        self.favorite_songs: List[str] = [
            "Grievous Lady -nothing is but what is not- · Team Grimoire & Laur",
            "One step at a time · Morfonica",
            "顏 · Ave Mujica",
            "雑踏、僕らの街 · TOGENASHI TOGEARI",
            "誰にもなれない私だから · TOGENASHI TOGEARI",
        ]

        self.favorite_illustrators: List[str] = [
            "@momoco_haru",
            "@horuhara",
            "@kurumi_lm",
        ]

    def about(self) -> str:
        return (
            "A personal dev space focused on web UI, code rendering, and embedded systems"
        )

huihui = HuiHui()
`,
  en: `# huihuidev.py

from __future__ import annotations
from typing import List

class HuiHui:
    """Developer profile object."""

    def __init__(self) -> None:
        self.name: str = "huihui"
        self.major: str = "Electronic Engineering"
        self.hobbies: List[str] = ["Photography", "Rhythm Games", "Galgame"]
        self.website: str = "huihui.dev"
        self.contact: str = "contact@huihui.dev"

        self.skills: List[str] = [
            "HTML",
            "CSS",
            "JavaScript",
            "Git",
            "GitHub",
        ]

        self.workflow: List[str] = [
            "Issues",
            "Branches",
            "Pull Requests",
            "GitHub Actions",
        ]

        self.projects: List[str] = [
            "huihui.dev (custom UI, code rendering, GitHub workflow)",
        ]

        self.favorite_composers: List[str] = [
            "Laur",
            "USAO",
            "Sakuzyo",
            "ak+q",
        ]

        self.favorite_bands: List[str] = [
            "Morfonica",
            "Ave Mujica",
        ]

        self.favorite_songs: List[str] = [
            "Grievous Lady -nothing is but what is not- · Team Grimoire & Laur",
            "One step at a time · Morfonica",
            "顏 · Ave Mujica",
            "雑踏、僕らの街 · TOGENASHI TOGEARI",
            "誰にもなれない私だから · TOGENASHI TOGEARI",
        ]

        self.favorite_illustrators: List[str] = [
            "@momoco_haru",
            "@horuhara",
            "@kurumi_lm",
        ]

    def about(self) -> str:
        return (
            "A personal dev space focused on web UI, code rendering, and embedded systems"
        )

huihui = HuiHui()
`,
  ja: `# huihuidev.py

from __future__ import annotations
from typing import List

class HuiHui:
    """Developer profile object."""

    def __init__(self) -> None:
        self.name: str = "huihui"
        self.major: str = "Electronic Engineering"
        self.hobbies: List[str] = ["Photography", "Rhythm Games", "Galgame"]
        self.website: str = "huihui.dev"
        self.contact: str = "contact@huihui.dev"

        self.skills: List[str] = [
            "HTML",
            "CSS",
            "JavaScript",
            "Git",
            "GitHub",
        ]

        self.workflow: List[str] = [
            "Issues",
            "Branches",
            "Pull Requests",
            "GitHub Actions",
        ]

        self.projects: List[str] = [
            "huihui.dev (custom UI, code rendering, GitHub workflow)",
        ]

        self.favorite_composers: List[str] = [
            "Laur",
            "USAO",
            "Sakuzyo",
            "ak+q",
        ]

        self.favorite_bands: List[str] = [
            "Morfonica",
            "Ave Mujica",
        ]

        self.favorite_songs: List[str] = [
            "Grievous Lady -nothing is but what is not- · Team Grimoire & Laur",
            "One step at a time · Morfonica",
            "顏 · Ave Mujica",
            "雑踏、僕らの街 · TOGENASHI TOGEARI",
            "誰にもなれない私だから · TOGENASHI TOGEARI",
        ]

        self.favorite_illustrators: List[str] = [
            "@momoco_haru",
            "@horuhara",
            "@kurumi_lm",
        ]

    def about(self) -> str:
        return (
            "A personal dev space focused on web UI, code rendering, and embedded systems"
        )

huihui = HuiHui()
`
}

function renderProfileCode() {
  const profileCode = document.getElementById("profileCode");
  if (!profileCode) return;

  const locale = typeof getCurrentLocale === "function" ? getCurrentLocale() : "zh";
  profileCode.textContent =
    window.HUIHUI_PROFILE_CODE?.[locale] ||
    window.HUIHUI_PROFILE_CODE?.zh ||
    "";
}
