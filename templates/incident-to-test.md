# Incident → reviewer test case

Every past incident becomes a test case. Score your AI reviewer against all of them every day. Start with your **worst outage ever**: nobody else has your incidents, so nobody else can build this set.

## For each incident, record

```yaml
id: INC-2024-017
title: Checkout down 47 min after cache key change
date: 2024-03-12
change_that_caused_it: <commit SHA or PR link>
what_a_reviewer_should_have_said: >
  The new cache key drops the currency, so EUR and USD carts collide.
severity: high
category: [caching, payments]
```

## Daily scoring
1. Replay each `change_that_caused_it` diff through the AI reviewer.
2. Did it flag the problem in `what_a_reviewer_should_have_said`? (yes / partly / no)
3. Track: % caught, overall and by category. Watch the trend, not the single run.

## Also turn repeat review comments into rules
If the same review comment has come up many times, it shouldn't be a review anymore. Make it a lint rule, a test, or a tool, and record it here:

| Repeated comment | Became | Date |
|---|---|---|
| "Missing null check on user lookup" | lint rule `no-unchecked-lookup` | |
