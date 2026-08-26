import assert from "node:assert/strict";
import test from "node:test";
import { demoCandidates } from "@openmatch/matching";
import { Accounts } from "../src/accounts.ts";
import type { Store } from "../src/store.ts";

const setup = (store: Store, candidate: (typeof demoCandidates)[number]) => {
  const { id: _id, distanceKm: _distanceKm, ...profile } = candidate.profile;
  store.completeSetup({
    version: "setup-0.1",
    profile,
    preferences: candidate.preferences,
    adultConfirmed: true,
    prototypeDataUseAccepted: true,
    joinDirectory: true,
  });
};

test("loads the hosted candidate directory from one account-scoped snapshot", () => {
  const accounts = new Accounts(":memory:", { dataDirectory: null });
  try {
    const viewer = accounts.register(
      "viewer@example.org",
      "a sufficiently long viewer password",
    );
    const candidate = accounts.register(
      "candidate@example.org",
      "a sufficiently long candidate password",
    );
    setup(viewer.store, demoCandidates[0]);
    setup(candidate.store, demoCandidates[1]);
    candidate.store.updateProfile({ city: viewer.store.profile().city });

    viewer.store.db.directoryCandidateSnapshots = () => [
      {
        accountId: candidate.accountId,
        state: {
          profile: JSON.stringify(candidate.store.profile()),
          preferences: JSON.stringify(candidate.store.preferences()),
          onboarding_complete: JSON.stringify(
            candidate.store.onboardingComplete(),
          ),
          consent_receipt: JSON.stringify(candidate.store.consentReceipt()),
          directory_consent_receipt: JSON.stringify(
            candidate.store.directoryConsentReceipt(),
          ),
          account_status: JSON.stringify(candidate.store.accountStatus()),
        },
      },
      {
        accountId: "00000000-0000-4000-8000-000000000000",
        state: {},
      },
    ];

    const candidates = accounts.candidatesFor(viewer.accountId);
    assert.equal(candidates.length, 1);
    assert.equal(candidates[0]?.profile.id, candidate.accountId);
    assert.equal(candidates[0]?.profile.name, demoCandidates[1].profile.name);
  } finally {
    accounts.close();
  }
});
