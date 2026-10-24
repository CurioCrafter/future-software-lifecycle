# Readiness checklist

Answer honestly before loosening human review. Any **No** in "The floor" means: build that first.

## The floor
- [ ] An agent can run the full test suite locally, with no human setup.
- [ ] New behaviour can ship behind a feature flag.
- [ ] Releases are staged (internal → small % → everyone).
- [ ] We can roll back a bad deploy in **under an hour**. (Target: minutes.)

## The stack
- [ ] Agents must show test/build output, not just claim "done".
- [ ] Every PR gets an AI review before a human looks.
- [ ] Every AI finding must be fixed or closed with a written reason.
- [ ] Automated security review blocks merge on open findings.
- [ ] Merge queue reruns all checks against latest main.
- [ ] Review loop is capped (3 rounds, then rethink).

## The rules
- [ ] Agent approval never counts as human approval (enforced in branch protection).
- [ ] Every PR names an accountable human (whoever prompted the agent).
- [ ] Risk tiers are written down ([risk-tiers.yml](risk-tiers.yml)).

## The measurements (weekly)
- [ ] Merged PRs per week
- [ ] Revert rate (% of merged PRs reverted)
- [ ] Incidents caused by changes
- [ ] % of PRs passing AI review in one round
- [ ] AI reviewer score on the incident test set

**Loosen a tier only when merged PRs go up and revert/incident rate does not.**
