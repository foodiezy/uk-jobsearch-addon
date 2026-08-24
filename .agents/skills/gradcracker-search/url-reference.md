# Gradcracker URL Reference

Public, unauthenticated pages of https://www.gradcracker.com (UK STEM
graduate careers board). Server-rendered HTML (Laravel + Livewire); all
parsing is chunked regex. Verified live 2026-07-12.

## robots.txt (checked 2026-07-12)

```
User-agent: *
Allow: /
Disallow: /out
Disallow: /campaign
Disallow: /download
Disallow: /keyword-search
Disallow: /hub/9000001
```

- `/search/...` (discipline browse) and `/hub/.../<type>/<jobId>/...` (detail)
  are **allowed**.
- `/keyword-search` (used by `--query`) is **disallowed** → personal,
  low-volume use only (warning in SKILL.md).
- `/out` (tracked apply redirects) is disallowed — the CLI **never fetches
  it**; the real employer URL is decoded from the link's `u=` parameter.

## Search surface 1: discipline browse (robots-allowed)

```
GET https://www.gradcracker.com/search/<discipline>/<facet>[?page=<n>]
```

- `<discipline>`: `computing-technology`, `aerospace`, `chemical-process`,
  `civil-building`, `electronic-electrical`, `mechanical-engineering`,
  `science-maths`, `all-disciplines`, … (see the site's discipline nav).
- `<facet>` (opportunity type):
  | CLI `--type` | facet slug |
  |---|---|
  | `all` (default) | `engineering-jobs` |
  | `graduate-jobs` | `graduate-jobs` |
  | `placements` | `work-placements-internships` |
  | `apprenticeships` | `degree-apprenticeships` |
- **Region filter**: append `-in-<region>` to the facet, e.g.
  `graduate-jobs-in-east-midlands` (verified: filters 202 → 12 results).
  Regions: `channel-islands`, `east-anglia`, `east-midlands`, `europe`,
  `london-and-south-east`, `north-east`, `north-wales`, `north-west`,
  `northern-ireland`, `republic-of-ireland`, `scotland`, `south-wales`,
  `south-west`, `west-midlands`, `yorkshire` (plus `rest-of-the-world`
  as `engineering-jobs-rest-of-the-world`).
- Sub-discipline facets also exist under `computing-technology`:
  `computer-science-jobs`, `software-systems-jobs`, `web-development-jobs`,
  `ai-machine-learning-jobs`, `data-science-jobs`, `cyber-security-jobs`,
  `hardware-engineering-jobs`, `information-technology-jobs` (not currently
  exposed as a CLI flag; pass via `--discipline`/hand-built URL if needed).
- Employer facets: `engineering-jobs-with-<employer-slug>`.
- Pagination: `?page=<n>` (1-indexed), ~16 cards/page.

## Search surface 2: keyword search (robots-DISALLOWED)

```
GET https://www.gradcracker.com/keyword-search?query=<text>[&jobs=1][&placements=1][&degree-apprenticeships=1][&page=<n>]
```

- `query`: free text (`civil engineer`). No location parameter exists.
- `jobs` / `placements` / `degree-apprenticeships` = `1`: opportunity-type
  toggles (CLI maps `--type`).
- `page`: 1-indexed, ~40 cards/page. Total shown as `NNN results` in the page.

## Result-card HTML anchors (identical on both surfaces)

One `<article>` per opportunity (browse cards also carry
`wire:key="<jobId>"`; keyword cards do not — don't rely on it). Per chunk
(split on `<article`):

| Field | Anchor |
|---|---|
| id / url / type | title anchor `href="https://www.gradcracker.com/hub/<hubId>/<company-slug>/<type>/<jobId>/<job-slug>"` with `data-mk-label="Job Title"` in the same tag. `<type>` ∈ `graduate-job` \| `work-placement-internship` \| `degree-apprenticeship`. CLI id = `<hubId>-<jobId>` |
| title | inner text of that anchor |
| company | `aria-label="Apply for the … opportunity with <Company>"` on the title anchor; fallback: logo `<img alt="<Company>">` |
| disciplines | first `<h3>` in the card (e.g. `Chemistry, Environmental Science, Civil Engineering.`) |
| deadline | badge text `Deadline: August 2nd, 2026` or `Deadline: Ongoing` |
| location / salary / degree / starting | `<dl>` pairs: `<dt>Location</dt><dd>…</dd>`, `<dt>Salary</dt>…`, `<dt>Degree required</dt>…`, `<dt>Starting</dt>…` |

**No posting date exists anywhere** — only deadlines. CLI emits `date: null`
plus a `deadline` field (ISO when parseable).

## Detail page

```
GET https://www.gradcracker.com/hub/<hubId>/<company-slug>/<type>/<jobId>/<job-slug>
```

URL flexibility (verified live):
- Missing/wrong company-slug, job-slug, or `<type>` segment → 301/302 to the
  canonical URL. So `hub/<hubId>/x/graduate-job/<jobId>/x` always works —
  this is how the CLI resolves composite ids.
- **Wrong `<hubId>` does NOT recover** — it lands on that employer's hub page
  (200, not a job). Bare job ids are therefore unresolvable; detail requires
  `<hubId>-<jobId>` or a full URL.
- Invalid job page detection: real opportunity pages contain
  `<h1 … itemprop="title">`; hub/directory fallbacks don't.

Anchors:

| Field | Anchor |
|---|---|
| title | `<h1 … itemprop="title">` |
| disciplines | the `<h2>` immediately after that h1 |
| company | `<title>` tag: `Job \| Section \| <Company> Hub \| Gradcracker…`; fallback: breadcrumb link `href=".../hub/<hubId>/<slug>">(Company) Hub</a>` |
| sidebar fields | `<li><div class="…tw-text-employer-500">Label</div> value</li>` for `Deadline`, `Salary`, `Degree required`, `Location`, `Starting` |
| description | balanced `<div class="body-content">…</div>`; strip embedded `not-body-content` widget divs (videos/promos), the `feedback-pledge` badge div, and the trailing `<p class="hash">md5</p>` checksum |
| apply link | `href="https://www.gradcracker.com/out/<hubId>?jobID=…&u=<double-URL-encoded employer URL>&signature=…"` — decode `u=` twice locally; never fetch `/out` |

`og:url` points at the employer **hub**, not the job — use the fetch's final
URL (after redirects) as canonical.

## Quirks

- **WAF/UA**: a Chrome User-Agent sent from a non-Chrome TLS stack gets
  `403 Forbidden` (spoof detection). A Firefox UA passes, as does sending no
  UA at all. The CLI uses a Firefox UA; if 403s reappear, try removing the
  `User-Agent` header in `helpers.ts`.
- Entities in descriptions include `&rsquo; &pound; &reg; &trade; &plus;` —
  decoded in `decodeHtmlEntities`.
- Deadline text format: `MonthName 2nd, 2026` or `Ongoing`.
- Some listings are outside the UK (e.g. CERN, Geneva) — Gradcracker targets
  UK students but lists `europe` / rest-of-world roles too.
