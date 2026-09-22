# Submission checklist

Tracks the bounty's actual requirements against repo state. Code-reachable work
is done (see `ARCHITECTURE.md` for the detailed status list); everything below
needs your device/accounts and can't be done from within an agent session.

- [ ] `npm install && ./scripts/setup-models.sh` (downloads + verifies ~2.3GB of models)
- [ ] `npx expo prebuild -p android && npx expo run:android` on a connected device
- [ ] Push model weights via the `adb`/`run-as` commands `setup-models.sh` prints
- [ ] Confirm the app launches, loads both models, and answers a query end-to-end
- [ ] Try the queries in `docs/EVAL_QUERIES.md` and capture the responses
- [ ] Spot-check RAM via the in-app monitor (`ram-monitor` module) stays under 12GB,
      and storage (`assets/models` + app data) stays under 50GB
- [ ] Turn off networking entirely (airplane mode) and re-verify the app still works —
      the real test of the "zero connectivity" requirement
- [ ] Create a public GitHub repo and push this history
- [ ] Post a public demo (X or Farcaster): offline proof, example queries incl. ones
      a 1B model would fail on, repo link, brief approach explanation
- [ ] Submit a screenshot + links to poidh
- [ ] Make sure the GitHub repo's current state matches what's in the demo/claim
