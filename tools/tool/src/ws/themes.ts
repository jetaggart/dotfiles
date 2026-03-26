const themes = [
  { aB: "#4c6a8c", aF: "#f2f4f8", iB: "#3d5570", iF: "#d8dce4" },
  { aB: "#5c7a5c", aF: "#f5faf3", iB: "#4a634a", iF: "#dce6dc" },
  { aB: "#7a5c8c", aF: "#faf5fc", iB: "#634a70", iF: "#e6dce8" },
  { aB: "#8c6a4c", aF: "#fffaf5", iB: "#705540", iF: "#e8e0dc" },
  { aB: "#4c7a8c", aF: "#f3fafc", iB: "#3d6270", iF: "#dce8ec" },
  { aB: "#6a5c8c", aF: "#f6f4fc", iB: "#554a70", iF: "#e2dce8" },
  { aB: "#5c6a7a", aF: "#f6f8fa", iB: "#4a5563", iF: "#dce0e6" },
  { aB: "#7a6a4c", aF: "#faf8f2", iB: "#635540", iF: "#e8e4dc" },
  { aB: "#5b6e8a", aF: "#f0f4fa", iB: "#495a73", iF: "#d4dae6" },
  { aB: "#6b8a5b", aF: "#f4faf0", iB: "#567047", iF: "#dae6d4" },
  { aB: "#8a5b6e", aF: "#faf0f4", iB: "#704956", iF: "#e6d4da" },
  { aB: "#5e8a7a", aF: "#f0faf7", iB: "#4b7063", iF: "#d4e6df" },
]

export function randomTheme() {
  const t = themes[Math.floor(Math.random() * themes.length)]
  return { activeBG: t.aB, activeFG: t.aF, inactiveBG: t.iB, inactiveFG: t.iF }
}
