---
version: 1
slug: "site-index-html"
primary_target: "site/index.html"
related_targets: ["site/app.js","site/app.css"]
---

# Surface: public dashboard (site/index.html)

Mode: Read, with drill-downs. The visitor understands a finding, then checks it.

Audience and job: a hiring manager for TPM roles, about 30 seconds, from a resume or LinkedIn link, judging whether the analysis is real and whether its author thinks like a TPM. Second reader: a TPM who opens the PR lists and the method.

Proof on hand: every number opens its PR list; the DevStats cross-check; the reviewed brief; the repo's method, eval and build report.

Constraints: static files only, strict CSP (self-hosted font, no CDNs), light and dark, 360px, keyboard-complete, no blame of people, fetch date always visible.

Memorable moment: Figure 1 shows a merged PR's 7.3 days as almost all review, with merging a sliver labeled "1.7 hours".

Unresolved: final headline wording is reviewed with the product owner at launch (deferred headline review).

## Direction contract

THESIS: The snapshot is a short research report in the manner of the DORA State of DevOps reports: the finding is the title, evidence comes as numbered figures with captions and source lines, and a methods section closes it. It refuses the KPI-tile analytics dashboard.

OWN-WORLD: A white report page with near-black ink, one report blue for data marks and links, a pale blue wash behind figures, and cool gray for secondary text. One self-hosted humanist sans (Public Sans) at a clear report scale. Hairline rules instead of cards, tabular numerals in tables, and "Figure n." captions with a source line under every chart.

STORY: The reader takes in the title ("A Kubernetes pull request waits 4 days for review, then merges in under 2 hours", written from the data), sees in Figure 1 that merging is a sliver of the wait, finds the two SIG review queues that hold most of it, and trusts it because any number opens its PRs, the method sits on the page, and the result agrees with Kubernetes' own DevStats. They leave knowing the finding and that its author measures carefully.

FIRST VIEWPORT: A thin masthead (project name left, section links and the repo link right). Below it, left-aligned over seven columns, the title at display size, a byline line (author, snapshot date, PR counts), a two-sentence summary, and three key findings as short sentences with their numbers in bold. Figure 1 sits in the right five columns on desktop, beneath the findings on phones: where a merged PR's time goes, stage by stage, with "1.7 hours" written on the merge bar. The primary action is any figure mark or number, each opening its PRs inline.

FORM: Research report (DORA style), first of three on the safer-register list after a bolder round; seed key 56408a1a.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
