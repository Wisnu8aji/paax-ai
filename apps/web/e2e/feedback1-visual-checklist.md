# Feedback 1 Real-Stack Visual Checklist

Record the run date, fixture SHA-256, browser version, viewport, DPR, run IDs, response codes, screenshot paths, and trace path. Provider keys must be absent.

- [ ] Authorized Range/ETag PDF response observed.
- [ ] First page paints before all 53 thumbnails/pages are rendered.
- [ ] Source aspect ratio is correct and text/linework remains sharp.
- [ ] Pan/zoom produces no browser `pageerror`.
- [ ] Minimap can be dragged, minimized, closed, and reopened.
- [ ] All 53 pages are reachable with real lightweight thumbnails.
- [ ] `Level`, `Classification`, and `Original order` preserve original page identity.
- [ ] Unknown classification shows reason, evidence, and manual action.
- [ ] Takeoff backend failure is visible and exact retry works.
- [ ] Mission failure/approval/replay/audit/budget states are visible.
- [ ] Every candidate appears once as ready/calculated/needs review/blocked.
- [ ] Quantity formula text is absent; source labels are concise `p.N`.
- [ ] Only `sourceAuthority = core_engine` rows show final quantities.
- [ ] Handoff rejects blocked, review, reference-only, and Measurement Fact-only rows.
- [ ] Desktop 1440 px and narrow 390 px screenshots reviewed.
