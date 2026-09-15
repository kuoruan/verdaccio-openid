const ZH_MARKER = "<!-- zh-CN -->";

function normalize(text = "") {
  return String(text)
    .replace(/\r\n/g, "\n")
    .replace(/^\n+/, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function splitSummary(summary = "") {
  const raw = normalize(summary);
  if (!raw) {
    return { english: "", chinese: "" };
  }

  const markerIndex = raw.indexOf(ZH_MARKER);
  if (markerIndex === -1) {
    return { english: raw, chinese: "" };
  }

  const english = normalize(raw.slice(0, markerIndex));
  const chinese = normalize(raw.slice(markerIndex + ZH_MARKER.length));

  return { english, chinese };
}

export async function getReleaseLine(changeset) {
  const { english, chinese } = splitSummary(changeset.summary);

  if (!english && !chinese) {
    return "";
  }

  const text = [english, chinese]
    .filter(Boolean)
    .map((part) => part.replace(/\n+/g, " "))
    .join("\n  ");

  return `- ${text}`;
}

export async function getDependencyReleaseLine() {
  return "";
}
