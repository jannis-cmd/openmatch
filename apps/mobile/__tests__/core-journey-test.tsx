import { fireEvent, render, waitFor } from "@testing-library/react-native";
import {
  createIntroductions,
  defaultPreferences,
  demoCandidates,
  demoUser,
} from "@openmatch/matching";
import App from "../app/index";

const response = (body: unknown, status = 200) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }) as Response;

test("first run uses explicit accessible controls and opens introductions", async () => {
  let onboardingComplete = false;
  let profile = structuredClone(demoUser);
  let preferences = structuredClone(defaultPreferences);
  let accountStatus = "active";
  let batchSize: 1 | 2 | 3 | 4 | 5 = 5;
  let consentAccepted = false;
  let researchParticipating: boolean | null = null;
  const savedIds = new Set<string>();
  let reportPayload: { reason?: string; details?: string } | null = null;
  const reportRecords: Array<Record<string, unknown>> = [];
  global.fetch = jest.fn(async (input, init = {}) => {
    const path = new URL(String(input)).pathname;
    const body = init.body ? JSON.parse(String(init.body)) : {};
    if (path === "/v1/me" && init.method === "PATCH")
      return response((profile = { ...profile, ...body, id: "me" }));
    if (path === "/v1/me") return response(profile);
    if (path === "/v1/preferences" && init.method === "PATCH")
      return response(
        (preferences = {
          ...preferences,
          ...body,
          weights: { ...preferences.weights, ...body.weights },
        }),
      );
    if (path === "/v1/preferences/suggestions")
      return response({
        items: [],
        minimumObservations: 20,
        automaticChanges: false,
      });
    if (path === "/v1/preferences") return response(preferences);
    if (path === "/v1/account/status" && init.method === "PATCH") {
      accountStatus = body.status;
      return response({ status: accountStatus });
    }
    if (path === "/v1/account/status")
      return response({ status: accountStatus });
    if (path === "/v1/delivery" && init.method === "PATCH") {
      batchSize = body.batchSize;
      return response({ batchSize });
    }
    if (path === "/v1/delivery") return response({ batchSize });
    if (path === "/v1/consents" && init.method === "PATCH") {
      consentAccepted = true;
      return response({
        adultConfirmed: true,
        prototypeDataUseAccepted: true,
        noticeVersion: "prototype-0.1",
        acceptedAt: "2026-08-12T12:00:00.000Z",
      });
    }
    if (path === "/v1/consents")
      return response({ receipt: consentAccepted ? {} : null });
    if (path === "/v1/consents/research" && init.method === "PATCH") {
      researchParticipating = body.participating;
      return response({
        participating: researchParticipating,
        noticeVersion: "research-prototype-0.1",
        updatedAt: "2026-08-12T12:00:00.000Z",
      });
    }
    if (path === "/v1/consents/research")
      return response({
        receipt:
          researchParticipating === null
            ? null
            : {
                participating: researchParticipating,
                noticeVersion: "research-prototype-0.1",
                updatedAt: "2026-08-12T12:00:00.000Z",
              },
      });
    if (path === "/v1/transparency/version")
      return response({
        matching: "v0.1.0",
        hiddenFactors: false,
        privatePersonalInputsMayBeRedacted: true,
        status: "prototype",
        objective: "useful introductions, not engagement",
        deployedCommit: null,
        buildStatus: "development-unpinned",
      });
    if (path === "/v1/introductions/saved")
      return response({
        items: createIntroductions(profile, demoCandidates, preferences).filter(
          (item) => savedIds.has(item.profile.id),
        ),
      });
    const saved = path.match(/^\/v1\/introductions\/([^/]+)\/saved$/);
    if (saved && init.method === "POST") {
      savedIds.add(saved[1]);
      return response(
        { profileId: saved[1], saved: true, createdAt: "now" },
        201,
      );
    }
    if (saved && init.method === "DELETE") {
      savedIds.delete(saved[1]);
      return response(null, 204);
    }
    if (path === "/v1/introductions")
      return response({
        items: createIntroductions(profile, demoCandidates, preferences)
          .filter((item) => !savedIds.has(item.profile.id))
          .slice(0, batchSize),
        finite: true,
        remaining: 3,
      });
    if (path === "/v1/connections") return response({ items: [] });
    if (path === "/v1/reports" && init.method === "POST") {
      reportPayload = body;
      reportRecords.unshift({
        id: reportRecords.length + 1,
        profileId: body.profileId,
        reason: body.reason,
        details: body.details,
        status: "received",
        createdAt: "2026-08-12T12:00:00.000Z",
      });
      return response({ id: 1, status: "received" }, 201);
    }
    if (path === "/v1/reports") return response({ items: reportRecords });
    if (path === "/v1/onboarding/complete") {
      onboardingComplete = true;
      return response({ complete: true });
    }
    if (path === "/v1/onboarding")
      return response({ complete: onboardingComplete });
    throw new Error(`Unhandled test request: ${path}`);
  }) as typeof fetch;

  const screen = await render(<App />);
  expect(await screen.findByText("Set your boundaries.")).toBeTruthy();
  await fireEvent.changeText(screen.getByLabelText("Name"), "Taylor");
  await fireEvent.changeText(
    screen.getByLabelText("Approximate city or region"),
    "Winterthur",
  );
  expect(screen.getByLabelText("Lower proximity priority")).toBeTruthy();
  expect(screen.getByLabelText("Raise proximity priority")).toBeTruthy();
  await fireEvent.press(
    screen.getByText("I confirm that I am at least 18 years old."),
  );
  await fireEvent.press(
    screen.getByText(/I understand this local prototype stores what I enter/),
  );
  await fireEvent.press(screen.getByText("Ready to meet in person"));
  await fireEvent.press(screen.getByText("See my introductions"));
  await waitFor(() =>
    expect(screen.getByText("Your introductions")).toBeTruthy(),
  );
  expect(screen.getByText("Mara, 30")).toBeTruthy();
  await fireEvent.press(screen.getByText("Save for later"));
  await waitFor(() => expect(screen.getByText("Noah, 34")).toBeTruthy());
  await fireEvent.press(screen.getByText("Saved (1)"));
  expect(screen.getByText("Mara, 30")).toBeTruthy();
  await fireEvent.press(screen.getByText("Return to batch"));
  await waitFor(() => expect(screen.getByText("Mara, 30")).toBeTruthy());
  expect(screen.getByText("Report this profile")).toBeTruthy();
  expect(screen.getByText("Block Mara")).toBeTruthy();
  await fireEvent.press(screen.getByText("Report this profile"));
  await fireEvent.press(screen.getByText("Scam"));
  await fireEvent.changeText(
    screen.getByLabelText("Report details optional"),
    "Suspicious profile context",
  );
  await fireEvent.press(screen.getByText("Submit report"));
  await waitFor(() => expect(screen.getByText(/Report received/)).toBeTruthy());
  expect(reportPayload).toMatchObject({
    reason: "scam",
    details: "Suspicious profile context",
  });
  expect(profile.name).toBe("Taylor");
  expect(profile.city).toBe("Winterthur");
  expect(profile.readiness).toBe("Ready to meet in person");
  expect(onboardingComplete).toBe(true);
  expect(consentAccepted).toBe(true);
  await fireEvent.press(screen.getByText("Preferences"));
  await fireEvent.press(screen.getByLabelText("1 introductions per batch"));
  await waitFor(() => expect(batchSize).toBe(1));
  await fireEvent.press(screen.getByLabelText("Lower youngest age"));
  await waitFor(() => expect(preferences.ageMin).toBe(26));
  await fireEvent.press(screen.getByText("Still figuring it out"));
  await waitFor(() =>
    expect(preferences.intents).toContain("Still figuring it out"),
  );
  await fireEvent.press(screen.getByText("Profile"));
  expect(screen.getByText(/Not enrolled/)).toBeTruthy();
  await fireEvent.press(
    screen.getByText("Opt in to future prototype research"),
  );
  await waitFor(() => expect(researchParticipating).toBe(true));
  expect(
    screen.getByText(/Opted in under research-prototype-0.1/),
  ).toBeTruthy();
  await fireEvent.press(screen.getByText("Withdraw research consent"));
  await waitFor(() => expect(researchParticipating).toBe(false));
  expect(
    screen.getByText(/Opted out under research-prototype-0.1/),
  ).toBeTruthy();
  expect(screen.getByText("Your safety reports")).toBeTruthy();
  expect(screen.getByText("Report #1")).toBeTruthy();
  await fireEvent.press(screen.getByText("Edit profile"));
  await fireEvent.changeText(
    screen.getByLabelText("Profile display name"),
    "Taylor Two",
  );
  await fireEvent.press(screen.getByText("Done"));
  await waitFor(() => expect(profile.name).toBe("Taylor Two"));
  await fireEvent.press(screen.getByText("Pause introductions"));
  await waitFor(() =>
    expect(screen.getByText("Introductions paused")).toBeTruthy(),
  );
  expect(accountStatus).toBe("paused");
  await fireEvent.press(screen.getByText("Method"));
  expect(screen.getByText("Reciprocal score calculator")).toBeTruthy();
  expect(
    screen.getByText("Deployed code: unpinned development build"),
  ).toBeTruthy();
  expect(screen.getByText("Final score: 69%")).toBeTruthy();
  await fireEvent.press(screen.getByLabelText("Lower your directed fit"));
  expect(screen.getByText("Final score: 65%")).toBeTruthy();
  await fireEvent.press(screen.getByText("Mutual boundaries are satisfied"));
  expect(screen.getByText("Final score: 0%")).toBeTruthy();
  expect(screen.getByText("Known limits")).toBeTruthy();
  expect(screen.getByText("Open matching source code")).toBeTruthy();
  expect(screen.getByText("Open data inventory")).toBeTruthy();
  expect(screen.getByText("Safer dating")).toBeTruthy();
  expect(screen.getByText("Open FTC romance-scam guidance")).toBeTruthy();
});
