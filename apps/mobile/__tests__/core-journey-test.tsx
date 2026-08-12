import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { Alert } from "react-native";
import {
  createIntroductions,
  defaultPreferences,
  demoCandidates,
  demoUser,
  toPublicProfile,
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
  let connectionActive = false;
  let meetingPreference = "not_asked";
  let demoSessionRequests = 0;
  let sentMessageBody: Record<string, unknown> | null = null;
  const reportRecords: Array<Record<string, unknown>> = [];
  global.fetch = jest.fn(async (input, init = {}) => {
    const path = new URL(String(input)).pathname;
    const body = init.body ? JSON.parse(String(init.body)) : {};
    if (path === "/v1/demo/session") {
      demoSessionRequests += 1;
      return response({
        token: "t".repeat(43),
        expiresAt: "2026-08-13T00:00:00.000Z",
        authentication: false,
      });
    }
    if (path === "/v1/me" && init.method === "DELETE") {
      onboardingComplete = false;
      consentAccepted = false;
      researchParticipating = null;
      savedIds.clear();
      reportRecords.length = 0;
      return response({
        deleted: true,
        completedAt: "2026-08-12T12:00:00.000Z",
        mode: "synchronous-local-prototype",
        applicationBackups: "none",
      });
    }
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
        items: createIntroductions(profile, demoCandidates, preferences, {
          weeklySeed: "s0",
          explorationSlots: 1,
          limit: 5,
        }).filter((item) => savedIds.has(item.profile.id)),
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
        items: createIntroductions(profile, demoCandidates, preferences, {
          weeklySeed: "s0",
          explorationSlots: 1,
          limit: 5,
        })
          .filter((item) => !savedIds.has(item.profile.id))
          .slice(0, batchSize),
        finite: true,
        remaining: 3,
        weeklySeed: "2026-08-10",
        nextBatchAt: "2026-08-17T00:00:00.000Z",
        explorationSlots: 1,
      });
    if (path === "/v1/introductions/mara/decision" && init.method === "POST") {
      connectionActive = body.decision === "interested";
      return response({
        profileId: "mara",
        decision: body.decision,
        mutual: connectionActive,
      });
    }
    if (
      path === "/v1/connections/connection-mara/meeting-preference" &&
      init.method === "PATCH"
    ) {
      meetingPreference = body.meetingPreference;
      return response({ meetingPreference });
    }
    if (path === "/v1/connections")
      return response({
        items: connectionActive
          ? [
              {
                id: "connection-mara",
                profileId: "mara",
                createdAt: "2026-08-12T12:00:00.000Z",
                closedAt: null,
                muted: false,
                meetingPreference,
                profile: toPublicProfile(demoCandidates[0].profile),
              },
            ]
          : [],
      });
    if (
      path === "/v1/connections/connection-mara/messages" &&
      init.method === "POST"
    ) {
      sentMessageBody = body;
      return response(
        {
          id: 1,
          connectionId: "connection-mara",
          senderId: "me",
          text: body.text,
          createdAt: "2026-08-12T12:00:00.000Z",
        },
        201,
      );
    }
    if (path === "/v1/connections/connection-mara/messages")
      return response({ items: [] });
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
  await fireEvent.changeText(
    screen.getByLabelText("Profile prompt answer"),
    "Building a welcoming table.",
  );
  await fireEvent.changeText(
    screen.getByLabelText("Profile values separated by commas"),
    "Care, Curiosity",
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
  expect(demoSessionRequests).toBe(1);
  expect(profile.promptAnswer).toBe("Building a welcoming table.");
  expect(profile.values).toEqual(["Care", "Curiosity"]);
  expect(screen.getByText("Mara, 30")).toBeTruthy();
  expect(screen.getByText("Public lottery slot")).toBeTruthy();
  await fireEvent.press(screen.getByText("See the full calculation"));
  expect(screen.getByText(/Selection exploration/)).toBeTruthy();
  expect(screen.getByText(/public seed s0/)).toBeTruthy();
  await fireEvent.press(screen.getByText("Hide calculation"));
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
  await fireEvent.press(screen.getByText("Interested"));
  await waitFor(() => expect(connectionActive).toBe(true));
  await fireEvent.press(screen.getByText("Connections"));
  expect(
    screen.getByText("Would you like to plan a first meeting?"),
  ).toBeTruthy();
  await fireEvent.press(screen.getByText("Open to planning"));
  await waitFor(() => expect(meetingPreference).toBe("open_to_plan"));
  expect(screen.getByText("Saved privately: open to planning.")).toBeTruthy();
  expect(screen.getByText("✓ Choose a busy public place.")).toBeTruthy();
  const warningSpy = jest.spyOn(Alert, "alert");
  await fireEvent.changeText(
    screen.getByLabelText("Message Mara"),
    "See https://example.com",
  );
  await fireEvent.press(screen.getByText("Send"));
  const warningCall = warningSpy.mock.calls.find(
    ([title]) => title === "Pause before sending",
  );
  expect(warningCall?.[1]).toMatch(/External link/);
  expect(sentMessageBody).toBeNull();
  warningCall?.[2]?.[1].onPress?.();
  await waitFor(() =>
    expect(sentMessageBody).toMatchObject({
      text: "See https://example.com",
      safetyAcknowledged: true,
    }),
  );
  await waitFor(() =>
    expect(screen.getByText("See https://example.com")).toBeTruthy(),
  );
  warningSpy.mockRestore();
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
  await fireEvent.changeText(
    screen.getByLabelText("Profile values separated by commas"),
    "Care, Community",
  );
  await fireEvent.press(screen.getByText("Flexible"));
  await fireEvent.press(screen.getByText("Done"));
  await waitFor(() => expect(profile.name).toBe("Taylor Two"));
  expect(profile.values).toEqual(["Care", "Community"]);
  expect(profile.lifestyle.schedule).toBe("flexible");
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
  expect(screen.getByText(/temporary bearer token only gates/)).toBeTruthy();
  expect(screen.getByText("Open matching source code")).toBeTruthy();
  expect(screen.getByText("Open data inventory")).toBeTruthy();
  expect(screen.getByText("Safer dating")).toBeTruthy();
  expect(screen.getByText("Open FTC romance-scam guidance")).toBeTruthy();
  expect(screen.getByText("Independent support in Switzerland")).toBeTruthy();
  expect(screen.getByText("Immediate danger · Police 117")).toBeTruthy();
  expect(screen.getByText("Victim support · 142")).toBeTruthy();
  expect(
    screen.getByText(/You do not need to file an OpenMatch report/),
  ).toBeTruthy();
  await fireEvent.press(screen.getByText("Profile"));
  const alertSpy = jest.spyOn(Alert, "alert");
  await fireEvent.press(screen.getByText("Delete local data"));
  const destructiveAction = alertSpy.mock.calls.at(-1)?.[2]?.[1];
  expect(destructiveAction?.text).toBe("Delete");
  destructiveAction?.onPress?.();
  await waitFor(() =>
    expect(screen.getByText("Local data deletion completed")).toBeTruthy(),
  );
  expect(screen.getByText(/No application-managed backups exist/)).toBeTruthy();
  alertSpy.mockRestore();
});
