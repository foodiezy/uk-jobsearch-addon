// Offline unit tests for the pure helpers (no network).
import { describe, expect, test } from "bun:test";
import { parseJobCards, toIsoDate, removeNotBodyContent } from "../src/helpers";
import { buildUrl, regionSlug } from "../src/commands/search";
import { buildDetailUrl } from "../src/commands/detail";

const CARD_FIXTURE = `
<article wire:key="78925" class="tw-relative">
  <figure><a href="https://www.gradcracker.com/hub/973/example-engineering"><img alt="Example Engineering" src="x.png"/></a></figure>
  <h2><a
    href="https://www.gradcracker.com/hub/973/example-engineering/graduate-job/78925/graduate-sustainability-consultant"
    class="tw-block"
    aria-label="Apply for the Graduate Sustainability Consultant opportunity with Example Engineering"
    data-mk-section="Job Card"
    data-mk-label="Job Title"
  >
    Graduate Sustainability Consultant
  </a></h2>
  <h3 class="tw-mt-1.5">Environmental Science, Chemistry, Civil Engineering.</h3>
  <div>Deadline: August 2nd, 2026</div>
  <dl>
    <div><dt>Salary</dt><dd>&pound;30,000</dd></div>
    <div><dt>Location</dt><dd>Multiple UK Locations</dd></div>
  </dl>
</article>
<article>
  <p>malformed card with no job link — must not break parsing</p>
</article>
<article>
  <a href="https://www.gradcracker.com/hub/820/example-labs/work-placement-internship/71257/laboratory-internship"
     aria-label="Apply for the Laboratory Internship opportunity with Example Labs"
     data-mk-label="Job Title">Laboratory Internship</a>
  <div>Deadline: Ongoing</div>
</article>
`;

describe("parseJobCards", () => {
  test("parses fields and survives a malformed card", () => {
    const cards = parseJobCards(CARD_FIXTURE);
    expect(cards.length).toBe(2);

    const [a, b] = cards;
    expect(a.id).toBe("973-78925");
    expect(a.title).toBe("Graduate Sustainability Consultant");
    expect(a.company).toBe("Example Engineering");
    expect(a.location).toBe("Multiple UK Locations");
    expect(a.salary).toBe("£30,000");
    expect(a.deadline).toBe("2026-08-02");
    expect(a.date).toBeNull();
    expect(a.type).toBe("graduate-job");
    expect(a.disciplines).toBe("Environmental Science, Chemistry, Civil Engineering");
    expect(a.url).toBe(
      "https://www.gradcracker.com/hub/973/example-engineering/graduate-job/78925/graduate-sustainability-consultant"
    );

    expect(b.id).toBe("820-71257");
    expect(b.type).toBe("work-placement-internship");
    expect(b.deadline).toBe("Ongoing");
    expect(b.location).toBeNull();
  });
});

describe("toIsoDate", () => {
  test("parses Gradcracker deadline strings", () => {
    expect(toIsoDate("August 2nd, 2026")).toBe("2026-08-02");
    expect(toIsoDate("December 4th, 2026")).toBe("2026-12-04");
    expect(toIsoDate("July 1st, 2026")).toBe("2026-07-01");
    expect(toIsoDate("Ongoing")).toBeNull();
  });
});

describe("removeNotBodyContent", () => {
  test("removes nested promo widgets", () => {
    const html = `<p>Keep</p><div class="x not-body-content"><div>promo</div><div><div>video</div></div></div><p>Also keep</p>`;
    expect(removeNotBodyContent(html)).toBe("<p>Keep</p><p>Also keep</p>");
  });
});

describe("buildUrl", () => {
  const base = { discipline: "all-disciplines", type: "all" as const, page: 1, format: "json" as const };

  test("keyword mode hits /keyword-search with all type toggles", () => {
    const url = buildUrl({ ...base, query: "civil engineer" });
    expect(url).toContain("/keyword-search?");
    expect(url).toContain("query=civil+engineer");
    expect(url).toContain("jobs=1");
    expect(url).toContain("placements=1");
    expect(url).toContain("degree-apprenticeships=1");
  });

  test("browse mode builds discipline/facet paths", () => {
    expect(buildUrl(base)).toBe("https://www.gradcracker.com/search/all-disciplines/engineering-jobs");
    expect(buildUrl({ ...base, type: "graduate-jobs", location: "East Midlands" })).toBe(
      "https://www.gradcracker.com/search/all-disciplines/graduate-jobs-in-east-midlands"
    );
    expect(buildUrl({ ...base, type: "placements", page: 3 })).toBe(
      "https://www.gradcracker.com/search/all-disciplines/work-placements-internships?page=3"
    );
  });
});

describe("regionSlug", () => {
  test("normalizes and aliases", () => {
    expect(regionSlug("East Midlands")).toBe("east-midlands");
    expect(regionSlug("london")).toBe("london-and-south-east");
    expect(regionSlug("Bristol")).toBeNull();
  });
});

describe("buildDetailUrl", () => {
  test("accepts composite ids and full URLs, rejects bare numbers", () => {
    expect(buildDetailUrl("1088-81498")).toBe(
      "https://www.gradcracker.com/hub/1088/x/graduate-job/81498/x"
    );
    expect(
      buildDetailUrl("https://www.gradcracker.com/hub/820/example-group/graduate-job/72110/civil-engineer")
    ).toBe("https://www.gradcracker.com/hub/820/example-group/graduate-job/72110/civil-engineer");
    expect(buildDetailUrl("81498")).toBeNull();
  });
});
