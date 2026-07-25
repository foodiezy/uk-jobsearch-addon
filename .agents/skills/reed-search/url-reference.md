# Reed.co.uk Jobseeker API — endpoint reference

Investigated 2026-07-12 from https://www.reed.co.uk/developers/jobseeker (official docs).
Unlike the HTML-scraping portal skills, this skill uses Reed's **official, free Jobseeker
API** — structured JSON, no markup parsing, but an API key is required.

## Endpoints

| Purpose | URL | Method |
|---------|-----|--------|
| Search  | `https://www.reed.co.uk/api/1.0/search` | GET |
| Detail  | `https://www.reed.co.uk/api/1.0/jobs/{jobId}` | GET |

Current version number is `1.0` (docs example: `https://www.reed.co.uk/api/1.0/search?keywords=accountant&location=london&employerid=123&distancefromlocation=15`).

## Authentication

HTTP **Basic** auth with the API key as the **username** and an **empty password**:

```
Authorization: Basic base64("<API_KEY>:")
```

- Keys are free: register at https://www.reed.co.uk/developers/jobseeker
- Unauthenticated requests return **`401 Unauthorized`** with `WWW-Authenticate: Basic`
  (verified live 2026-07-12 — confirms the endpoint URL and auth scheme).
- The CLI reads the key from the `REED_API_KEY` environment variable.

## Search parameters (from the official docs, verbatim names)

| Parameter | Type | Notes |
|-----------|------|-------|
| `keywords` | string | Free-text keywords |
| `locationName` | string | Location free text (e.g. `Nottingham`, `London`) |
| `distanceFromLocation` | int | Distance from `locationName` in **miles**; default 10 |
| `employerId` | int | Filter to one employer |
| `employerProfileId` | int | Filter to one employer profile |
| `permanent` | bool | `true`/`false` |
| `contract` | bool | |
| `temp` | bool | |
| `partTime` | bool | |
| `fullTime` | bool | |
| `minimumSalary` | int | e.g. `20000` |
| `maximumSalary` | int | |
| `postedByRecruitmentAgency` | bool | |
| `postedByDirectEmployer` | bool | |
| `graduate` | bool | **Exists** — graduate positions filter (used by `--graduate`) |
| `resultsToTake` | int | Max results per request — **defaults to and is capped at 100** |
| `resultsToSkip` | int | Pagination offset |

**No posting-age / date filter parameter exists server-side.** The CLI therefore
implements `--jobage <days>` as a **client-side** filter on the `date` field of each
result (jobs whose date cannot be parsed are dropped when `--jobage` is used).

## Pagination

`resultsToTake` (≤100) + `resultsToSkip`. The CLI always requests 100 (the max) and
maps `--page <n>` (1-indexed) to `resultsToSkip = (n-1) * 100`, so one page = up to
100 raw results; `--limit` caps output client-side.

## Response shape

The docs list response fields descriptively ("Job Id", "Job Title", …) **without an
example JSON body**, so the exact key casing is not documented. The live API is
well-known (all published client libraries agree) to return **camelCase**:

### Search response

```json
{
  "results": [
    {
      "jobId": 55555555,
      "employerId": 12345,
      "employerName": "Acme Ltd",
      "employerProfileId": null,
      "employerProfileName": null,
      "jobTitle": "Graduate Software Engineer",
      "locationName": "Nottingham",
      "minimumSalary": 28000,
      "maximumSalary": 32000,
      "currency": "GBP",
      "expirationDate": "20/08/2026",
      "date": "10/07/2026",
      "jobDescription": " ... truncated snippet ... ",
      "applications": 25,
      "jobUrl": "https://www.reed.co.uk/jobs/graduate-software-engineer/55555555"
    }
  ],
  "totalResults": 1234
}
```

- **Dates are `DD/MM/YYYY` strings** (UK format), not ISO. The CLI normalizes them to
  `YYYY-MM-DD` and falls back to `Date.parse` / raw passthrough for safety.
- `jobDescription` in search results is a truncated plain-ish snippet; the full HTML
  description comes from the detail endpoint.

### Detail response (`/jobs/{jobId}`)

Fields per docs (camelCase live): `employerId`, `employerName`, `jobId`, `jobTitle`,
`locationName`, `minimumSalary`, `maximumSalary`, `yearlyMinimumSalary`,
`yearlyMaximumSalary`, `currency`, `salaryType`, `salary`, `datePosted`,
`expirationDate`, `externalUrl`, `jobUrl`, `partTime`, `fullTime`, `contractType`,
`jobDescription` (**full HTML** — the CLI strips tags / decodes entities for
`--format plain`), `applicationCount`.

A non-existent `jobId` returns 404 (CLI maps it to a `NOT_FOUND` error).

> ⚠️ **Casing/format caveat:** the camelCase keys and `DD/MM/YYYY` dates above match
> the live API as observed by every public client library, but could not be verified
> first-hand because no API key was available at build time. If the first
> authenticated run returns nulls for populated jobs, check the raw response keys
> against `normalizeSearchResult()` in `cli/src/helpers.ts`.

## Errors / limits

- `401` → bad/missing key (CLI: `INVALID_API_KEY`).
- Docs specify no rate limits; the CLI still retries `429`/`5xx` with exponential
  backoff + jitter (max 6 retries).
- Usage is subject to Reed's API terms shown on the developers page at registration.
