const ALLOWED_ORIGIN = process.env.APP_ORIGIN || "*";

function slugify(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function htmlEscape(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
}

module.exports = async function handler(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const {
      title,
      category = "Peinture",
      technique = "",
      dimensions = "",
      year = "",
      descriptionFr = "",
      descriptionEn = ""
    } = req.body || {};

    if (!title || !String(title).trim()) {
      return res.status(400).json({ error: "Le nom de l'œuvre est obligatoire." });
    }

    const slug = slugify(title);
    if (!slug) {
      return res.status(400).json({ error: "Nom d'œuvre invalide." });
    }

    const token = process.env.GITHUB_TOKEN;
    const repo = process.env.GITHUB_REPO || "kalopsyana-site/main";
    const branch = process.env.GITHUB_BRANCH || "main";

    if (!token) {
      return res.status(500).json({ error: "GITHUB_TOKEN n'est pas configuré sur Vercel." });
    }

    const safeTitle = htmlEscape(title);
    const safeCategory = htmlEscape(category);
    const safeTechnique = htmlEscape(technique);
    const safeDimensions = htmlEscape(dimensions);
    const safeYear = htmlEscape(year);
    const safeFr = htmlEscape(descriptionFr).replace(/\n/g, "<br>");
    const safeEn = htmlEscape(descriptionEn).replace(/\n/g, "<br>");

    const filePath = `${category.toLowerCase().startsWith("sculpt") ? "sculpture" : "peinture"}-${slug}.html`;

    const html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${safeTitle} — KALOPSYANA</title>
<style>
*{box-sizing:border-box}
body{margin:0;font-family:Arial,Helvetica,sans-serif;color:#222;background:#fafafa;line-height:1.7}
header{position:sticky;top:0;background:#fff;border-bottom:1px solid #ddd;z-index:10}
.nav{max-width:1100px;margin:auto;padding:18px 24px;display:flex;align-items:center;justify-content:space-between;gap:20px}
.logo{font-size:1.2rem;font-weight:bold;letter-spacing:.12em}
.menu{display:flex;gap:18px;flex-wrap:wrap}
.menu a{color:#222;text-decoration:none}.menu a:hover{opacity:.55}
main{max-width:1000px;margin:auto;padding:70px 24px}
.image-placeholder{height:500px;background:#ddd;display:flex;align-items:center;justify-content:center;color:#777;margin-bottom:40px}
h1{font-weight:400;font-size:2.4rem;margin-bottom:8px}
.meta{color:#666;margin-bottom:35px}
.description{max-width:800px}
.back{display:inline-block;margin-top:40px;color:#222}
</style>
</head>
<body>
<header><nav class="nav">
<div class="logo">KALOPSYANA</div>
<div class="menu">
<a href="index.html">Accueil</a>
<a href="peintures.html">Peintures</a>
<a href="sculptures.html">Sculptures</a>
<a href="music.html">Music</a>
<a href="videos.html">Vidéos</a>
</div>
</nav></header>
<main>
<div class="image-placeholder">PHOTO DE L'ŒUVRE</div>
<h1>${safeTitle}</h1>
<div class="meta">${safeCategory} · ${safeTechnique} · ${safeDimensions} · ${safeYear}</div>
<div class="description">
<h2>Description</h2>
<p>${safeFr}</p>
<h2>Description (English)</h2>
<p>${safeEn}</p>
</div>
<a class="back" href="${category.toLowerCase().startsWith("sculpt") ? "sculptures.html" : "peintures.html"}">← Retour à la galerie</a>
</main>
</body>
</html>`;

    const apiUrl = `https://api.github.com/repos/${repo}/contents/${filePath}`;
    const headers = {
      "Authorization": `Bearer ${token}`,
      "Accept": "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json"
    };

    const existing = await fetch(`${apiUrl}?ref=${encodeURIComponent(branch)}`, { headers });
    let existingSha = null;
    if (existing.ok) {
      const data = await existing.json();
      existingSha = data.sha;
    } else if (existing.status !== 404) {
      const detail = await existing.text();
      return res.status(502).json({ error: "GitHub a refusé la vérification du fichier.", detail });
    }

    const body = {
      message: `${existingSha ? "Mise à jour" : "Création"} de l'œuvre : ${title}`,
      content: Buffer.from(html, "utf8").toString("base64"),
      branch
    };

    if (existingSha) body.sha = existingSha;

    const githubResponse = await fetch(apiUrl, {
      method: existingSha ? "PUT" : "PUT",
      headers,
      body: JSON.stringify(body)
    });

    const githubData = await githubResponse.json();

    if (!githubResponse.ok) {
      return res.status(502).json({
        error: "GitHub n'a pas accepté la publication.",
        detail: githubData.message || "Erreur GitHub"
      });
    }

    return res.status(200).json({
      success: true,
      path: filePath,
      commit: githubData.commit?.sha || null,
      url: `https://kalopsyana-site.github.io/main/${filePath}`
    });
  } catch (error) {
    return res.status(500).json({
      error: "Erreur serveur.",
      detail: error.message
    });
  }
};
