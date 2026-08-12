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
    if (path === "/v1/introductions")
      return response({
        items: createIntroductions(profile, demoCandidates, preferences),
        finite: true,
        remaining: 3,
      });
    if (path === "/v1/connections") return response({ items: [] });
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
  expect(screen.getByLabelText("Lower proximity priority")).toBeTruthy();
  expect(screen.getByLabelText("Raise proximity priority")).toBeTruthy();
  await fireEvent.press(screen.getByText("See my introductions"));
  await waitFor(() =>
    expect(screen.getByText("Your introductions")).toBeTruthy(),
  );
  expect(screen.getByText("Mara, 30")).toBeTruthy();
  expect(profile.name).toBe("Taylor");
  expect(onboardingComplete).toBe(true);
  await fireEvent.press(screen.getByText("Profile"));
  await fireEvent.press(screen.getByText("Pause introductions"));
  await waitFor(() =>
    expect(screen.getByText("Introductions paused")).toBeTruthy(),
  );
  expect(accountStatus).toBe("paused");
});
