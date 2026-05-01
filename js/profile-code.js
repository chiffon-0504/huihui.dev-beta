window.HUIHUI_PROFILE_CODE = {
  zh: `# profile.py

from __future__ import annotations
from typing import List, Optional

class HuiHui:
    """Developer profile object."""

    def __init__(self) -> None:
        self.name: str = "huihui"
        self.major: str = "Electronic Engineering"
        self.hobbies: List[str] = ["Photography", "Rhythm Games", "Galgame"]
        self.website: str = "huihui.dev"
        self.contact: str = "contact@huihui.dev"

        self.skills: List[str] = [
            "Python (OpenCV, Computer Vision, ML basics)",
            "SwiftUI (basic)",
            "JavaScript (basic)",
            "HTML & CSS (basic)",
        ]

        self.projects: List[str] = [
            "huihui.dev (personal website with custom UI and code rendering system)",
            "Multimodal Health Analysis Prototype (Raspberry Pi + OpenCV)",
        ]

        self.favorite_composers: List[str] = ["Laur", "USAO", "Sakuzyo", "ak+q"]
        self.favorite_bands: List[str] = ["Morfonica", "Ave Mujica"]

    def about(self) -> str:
        return (
            "A personal dev space focused on embedded systems, "
            "computer vision, and experimental projects"
        )

huihui = HuiHui()
`,
  en: `# profile.py

from __future__ import annotations
from typing import List, Optional

class HuiHui:
    """Developer profile object."""

    def __init__(self) -> None:
        self.name: str = "huihui"
        self.major: str = "Electronic Engineering"
        self.hobbies: List[str] = ["Photography", "Rhythm Games", "Galgame"]
        self.website: str = "huihui.dev"
        self.contact: str = "contact@huihui.dev"

        self.skills: List[str] = [
            "Python (OpenCV, Computer Vision, ML basics)",
            "SwiftUI (basic)",
            "JavaScript (basic)",
            "HTML & CSS (basic)",
        ]

        self.projects: List[str] = [
            "huihui.dev (personal website with custom UI and code rendering system)",
            "Multimodal Health Analysis Prototype (Raspberry Pi + OpenCV)",
        ]

        self.favorite_composers: List[str] = ["Laur", "USAO", "Sakuzyo", "ak+q"]
        self.favorite_bands: List[str] = ["Morfonica", "Ave Mujica"]

    def about(self) -> str:
        return (
            "A personal dev space focused on embedded systems, "
            "computer vision, and experimental projects"
        )

huihui = HuiHui()
`,
  ja: `# profile.py

from __future__ import annotations
from typing import List, Optional

class HuiHui:
    """Developer profile object."""

    def __init__(self) -> None:
        self.name: str = "huihui"
        self.major: str = "Electronic Engineering"
        self.hobbies: List[str] = ["Photography", "Rhythm Games", "Galgame"]
        self.website: str = "huihui.dev"
        self.contact: str = "contact@huihui.dev"

        self.skills: List[str] = [
            "Python (OpenCV, Computer Vision, ML basics)",
            "SwiftUI (basic)",
            "JavaScript (basic)",
            "HTML & CSS (basic)",
        ]

        self.projects: List[str] = [
            "huihui.dev (personal website with custom UI and code rendering system)",
            "Multimodal Health Analysis Prototype (Raspberry Pi + OpenCV)",
        ]

        self.favorite_composers: List[str] = ["Laur", "USAO", "Sakuzyo", "ak+q"]
        self.favorite_bands: List[str] = ["Morfonica", "Ave Mujica"]

    def about(self) -> str:
        return (
            "A personal dev space focused on embedded systems, "
            "computer vision, and experimental projects"
        )

huihui = HuiHui()
`
};

function renderProfileCode() {
  const profileCode = document.getElementById("profileCode");
  if (!profileCode) return;

  const locale = typeof getCurrentLocale === "function" ? getCurrentLocale() : "zh";
  profileCode.textContent = window.HUIHUI_PROFILE_CODE?.[locale] || window.HUIHUI_PROFILE_CODE?.zh || "";

  if (window.Prism) {
    Prism.highlightElement(profileCode);
  }
}

renderProfileCode();
