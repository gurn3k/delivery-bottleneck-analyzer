---
name: Delivery Bottleneck Analyzer
description: A research-report page showing where Kubernetes pull requests wait.
colors:
  page: "#ffffff"
  ink: "#16181b"
  ink-secondary: "#4f555d"
  ink-tertiary: "#6b717a"
  rule: "#dfe3e8"
  rule-strong: "#b9c0c9"
  figure-wash: "#f2f6fc"
  link: "#1a4f94"
  bar-median: "#1c5cab"
  bar-p90: "#6da7ec"
  bar-track: "#e4edf9"
  focus: "#1a73e8"
typography:
  title:
    fontFamily: "Public Sans, system-ui, sans-serif"
    fontSize: "clamp(34px, 4.6vw, 54px)"
    fontWeight: 700
    lineHeight: 1.06
    letterSpacing: "-0.025em"
  section:
    fontFamily: "Public Sans, system-ui, sans-serif"
    fontSize: "28px"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "-0.015em"
  figure-title:
    fontFamily: "Public Sans, system-ui, sans-serif"
    fontSize: "19px"
    fontWeight: 700
    lineHeight: 1.15
  summary:
    fontFamily: "Public Sans, system-ui, sans-serif"
    fontSize: "19px"
    fontWeight: 400
    lineHeight: 1.55
  body:
    fontFamily: "Public Sans, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: 1.6
  caption:
    fontFamily: "Public Sans, system-ui, sans-serif"
    fontSize: "13.5px"
    fontWeight: 400
    lineHeight: 1.5
rounded:
  bar-end: "3px"
  control: "4px"
spacing:
  section: "56px"
  figure-pad: "24px"
  gutter: "24px"
  gutter-phone: "16px"
components:
  figure:
    backgroundColor: "{colors.figure-wash}"
    padding: "24px 24px 18px"
  evidence-number:
    textColor: "{colors.link}"
  evidence-panel:
    backgroundColor: "{colors.page}"
    rounded: "{rounded.control}"
    padding: "18px 20px 12px"
  theme-toggle:
    textColor: "{colors.ink-secondary}"
    rounded: "{rounded.control}"
    padding: "3px 10px"
---

# Design System: Delivery Bottleneck Analyzer

## Overview

The page is a short research report in the manner of the DORA State of DevOps reports. The finding is the title, evidence comes as numbered figures and tables with captions and source lines, and the method closes the page. It reads like a careful analyst's report, not a product dashboard: no KPI tiles, no cards, no decoration. Every number with PRs behind it is a control that opens them inline.

## Colors

A white sheet with near-black ink, cool grays for secondary text and rules, and one report blue. Blue is reserved for data marks and for links and evidence numbers, so anything blue is either measured or clickable. The pale blue figure wash marks a figure as a figure. Dark mode is its own ramp (see `.impeccable/design.json`): the median bar becomes the lighter blue and the p90 extent the darker one, so the median still reads as the stronger mark against the dark ground.

## Typography

One self-hosted face, Public Sans (OFL, in `site/fonts/`), at a report scale: a large tight title, section heads at 28px, figure titles at 19px, a 19px summary, 17px body and 13.5px captions. Tables and every column of numbers use tabular figures. Body text stays within 60 to 78 characters per line.

## Layout

A 1160px column with a 24px gutter (16px on phones). The opening is a 7:5 grid, with title, byline, summary and key findings on the left and Figure 1 on the right, stacking below 900px. Sections are separated by a 56px gap above a hairline rule, never by boxes. Wide tables scroll inside their own wrapper, and the ranked-queues table restacks as labeled rows below 560px. The masthead is sticky.

## Elevation & Depth

None. The page is flat: hairline rules and the figure wash do all the separating.

## Shapes

Square figures and tables. Data bars end in a 3px rounded corner on the data end only, square at the baseline. Controls (theme toggle, show-all, evidence panel) use a 4px radius.

## Components

- **Figure:** blue wash, "Figure n." title, a one-line subtitle, a key when there are two series, and a caption beginning "Source:" under a rule.
- **Range bar:** a track, then the p90 extent in light blue, then the median in dark blue over it, with both values written as "median 4.1 d · p90 49 d". The whole row is a button that opens its PRs.
- **Evidence number:** a bold blue number with a dotted underline. Clicking it opens an evidence panel after its figure or table, moves focus to the panel's heading, and returns focus on Close or Escape. Panels list 25 PRs, then "Show all".
- **Table:** caption at the bottom ("Table n. Source: …"), hairline rows, right-aligned tabular numbers, the first column a row header.
- **Brief list:** the model-written bullets with their PR citations below each, and a provenance line saying who wrote it and who reviewed it.

## Do's and Don'ts

- Do write every finding as a sentence with its number in it.
- Do give every figure a number, a caption and a source line.
- Do link every number that has PRs behind it.
- Do name teams and stages, never people.
- Don't use cards, KPI tiles, kickers above headings, or shadows.
- Don't use blue for anything that isn't data or a link.
- Don't let color carry meaning alone; every bar has its value written beside it.
