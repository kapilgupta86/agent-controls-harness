# agent-controls-harness

A small, fully mocked set of tests that show how to enforce **autonomy levels, approvals, budgets and release gates outside the model**. It accompanies the article *Autonomy is earned* on [keshavaai.in](https://keshavaai.in).

Nothing here calls a model or a network. The "model" in the tests is a stand-in that proposes actions; the code in `src/controls.js` decides whether they happen. The code is written to be read in one sitting. It is illustrative, not a production library.

## Run it

```
npm test        # or: node --test      (Node 18 or newer, no dependencies)
```

## What the tests show

| Test | The point |
|---|---|
| Approval is bound to the exact action | Change the amount or payee and the approval no longer verifies |
| The agent's level limits what it may do | Even a valid approval does not let an L2 agent execute |
| A timeout after the write does not cause a second write | Idempotency key plus "did it already happen?" before retrying |
| Budgets stop a loop that never converges | Hard step and cost limits |
| Hidden instructions cannot cause a payment | The policy lives outside the model, so an obedient model changes nothing |
| Fail closed | Policy service down: writes refused, reads still work |
| Release gate: one critical failure blocks | A 98% pass rate does not override a failed critical test; a blocked gate drops the agent one level |
| Zero failures in a small sample is weak evidence | 50 clean runs still allow a true failure rate near 5.8% (rule of three) |

I also broke three of the controls on purpose (ignore the level, ignore critical failures, ignore the payee) and confirmed the tests fail each time. A test that cannot fail proves nothing.

## Levels used here (a working convention, not a standard)

`L0` observe, `L1` recommend, `L2` prepare for review, `L3` execute approved actions, `L4` bounded autonomy.

## Limits

- No test suite proves a system safe. A clean suite is evidence, not proof.
- The examples are invented. Thresholds must be set for your own use case, before you see the results.
- High-impact domains (health, finance, safety-critical, employment, legal) need domain experts, legal review and independent testing on top of this.

## Author

Kapil Kumar Gupta. Views are my own. No employer, client or customer material is used.

## License

Apache License 2.0. See [LICENSE](LICENSE).
