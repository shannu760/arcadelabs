/* Page tags: canonical/OG/Twitter meta, the consent + error-report scripts and
   the sitemap. Idempotent — run it after adding a page and it rewrites only the
   blocks it owns, marked `si:meta` and `si:client`.

     node scripts/page-tags.mjs

   The site origin can be overridden with SITE_URL (used for local runs so the
   committed files keep the production URLs).
*/
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';

const ROOT = resolve('public');
const ORIGIN = (process.env.SITE_URL || 'https://arcadelabs-eight.vercel.app').replace(/\/+$/, '');
const OG_IMAGE = `${ORIGIN}/assets/img/og.png`;

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(path)));
    else if (entry.name.endsWith('.html')) out.push(path);
  }
  return out;
}

const escape = (value) =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

const canonicalPath = (file) => {
  const rel = relative(ROOT, file).split(sep).join('/');
  if (rel === 'index.html') return '/';
  if (rel.endsWith('/index.html')) return `/${rel.slice(0, -'index.html'.length)}`;
  return `/${rel}`;
};

const prefixFor = (file) => {
  const depth = relative(ROOT, file).split(sep).length - 1;
  return depth === 0 ? './' : '../'.repeat(depth);
};

const strip = (html, pattern) => html.replace(pattern, '');

function metaBlock({ title, description, url }) {
  const t = escape(title);
  const d = escape(description);
  return `<!-- si:meta -->
<link rel="canonical" href="${url}">
<meta property="og:site_name" content="Student Icon">
<meta property="og:type" content="website">
<meta property="og:title" content="${t}">
<meta property="og:description" content="${d}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${OG_IMAGE}">
<meta property="og:image:alt" content="Student Icon — start in a classroom, finish as an icon">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${t}">
<meta name="twitter:description" content="${d}">
<meta name="twitter:image" content="${OG_IMAGE}">
<!-- /si:meta -->`;
}

function clientBlock(prefix) {
  return `<!-- si:client -->
<script src="${prefix}assets/js/consent.js" defer></script>
<script src="${prefix}assets/js/monitor.js" defer></script>
<!-- /si:client -->`;
}

const files = (await walk(ROOT)).sort();
const urls = [];

for (const file of files) {
  let html = await readFile(file, 'utf8');
  const url = ORIGIN + canonicalPath(file);

  const title = (html.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || 'Student Icon').trim();
  const description = (
    html.match(/<meta name="description" content="([^"]*)"/i)?.[1] || 'Student Icon.'
  ).trim();

  // The AdSense loader is now created by consent.js, after a choice.
  html = strip(html, /\n?<script async src="https:\/\/pagead2\.googlesyndication\.com[\s\S]*?<\/script>/);
  html = strip(html, /\n?<!-- si:meta -->[\s\S]*?<!-- \/si:meta -->/);
  html = strip(html, /\n?<!-- si:client -->[\s\S]*?<!-- \/si:client -->/);
  html = strip(html, /\n?<link rel="canonical"[^>]*>/);

  const anchor = html.match(/<meta name="description" content="[^"]*">/i);
  if (!anchor) {
    console.warn(`skip (no description): ${relative(ROOT, file)}`);
    continue;
  }
  html = html.replace(anchor[0], `${anchor[0]}\n${metaBlock({ title, description, url })}`);

  if (/<\/body>/i.test(html)) {
    html = html.replace(/<\/body>/i, `${clientBlock(prefixFor(file))}\n</body>`);
  }

  await writeFile(file, html);
  urls.push({ url, lastmod: new Date().toISOString().slice(0, 10) });
}

await writeFile(
  join(ROOT, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (entry) => `  <url>
    <loc>${entry.url}</loc>
    <lastmod>${entry.lastmod}</lastmod>
  </url>`
  )
  .join('\n')}
</urlset>
`
);

await writeFile(
  join(ROOT, 'robots.txt'),
  `# Student Icon
User-agent: *
Allow: /

# Signed-in-only surfaces are not useful to a crawler.
Disallow: /api/

Sitemap: ${ORIGIN}/sitemap.xml
`
);

await mkdir(join(ROOT, 'assets/img'), { recursive: true });

console.log(`updated ${files.length} pages, wrote sitemap.xml (${urls.length} urls) and robots.txt`);
