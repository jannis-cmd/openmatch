import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  AppState,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Crypto from "expo-crypto";
import { resolveApiConfiguration } from "../lib/api-configuration";
import { resolveWebConfiguration } from "../lib/web-configuration";
import {
  clearSessionToken,
  persistSessionToken,
  restoreSessionToken,
} from "../lib/secure-session";
import {
  clearPendingMessageAttempts,
  persistPendingMessageAttempts,
  restorePendingMessageAttempts,
} from "../lib/secure-message-attempts";
import {
  ApiError,
  createApiClient,
  type AccountSession,
  type AccountDeliveryStatus,
  type AccountStatus,
  type Connection,
  type DeletionReceipt,
  type DeliverySettings,
  type DirectoryConsentReceipt,
  type EmailVerificationStatus,
  type Message,
  type NotificationEmailStatus,
  type ReportRecord,
  type ReportReason,
  type ReportUpdateKind,
  type ResearchConsentReceipt,
  type SecurityNotificationDeliveryStatus,
  type SecurityNotificationStatus,
  type TransparencyVersion,
} from "@openmatch/api-client";
import {
  ALGORITHM_VERSION,
  defaultPreferences,
  demoUser,
  explainMatch,
  messageSafetyFlags,
  nearestPriority,
  POLITE_CLOSE_MESSAGE,
  conversationStarter,
  GENDER_DISCOVERY_GROUPS,
  PRIORITY_LEVELS,
  priorityLabel,
  type Introduction,
  type GenderDiscoveryGroup,
  type Preferences,
  type Profile,
  type WeightSuggestion,
} from "@openmatch/matching";

type Tab = "Today" | "Connections" | "Preferences" | "Profile" | "Method";

const operationLimitMessage = (error: unknown, fallback: string) => {
  if (
    !(error instanceof ApiError) ||
    error.code !== "operation_rate_limit_exceeded"
  )
    return fallback;
  const wait = error.retryAfterSeconds
    ? ` Try again in about ${error.retryAfterSeconds} seconds.`
    : " Try again after the short waiting period.";
  return `This action is temporarily limited to protect people and the service.${wait}`;
};

function sessionClientLabel(client: AccountSession["client"]) {
  if (client === "web") return "Web browser";
  if (client === "ios") return "iPhone or iPad app";
  if (client === "android") return "Android app";
  return "Earlier OpenMatch client";
}

function securityNotice(status: SecurityNotificationStatus) {
  return status === "sent"
    ? " A separate security notice was sent to every confirmed notification email."
    : status === "partial"
      ? " The change succeeded, but the security notice reached only some confirmed notification emails."
      : status === "failed"
        ? " The change succeeded, but the security email could not be delivered."
        : status === "unverified"
          ? " The change succeeded, but this inbox is not confirmed, so no security email was sent."
          : " Security-email delivery is not configured on this server.";
}

export default function App() {
  const apiConfiguration = useMemo(
    () =>
      resolveApiConfiguration(
        process.env.EXPO_PUBLIC_OPENMATCH_API_URL,
        __DEV__,
      ),
    [],
  );
  const webConfiguration = useMemo(
    () =>
      resolveWebConfiguration(
        process.env.EXPO_PUBLIC_OPENMATCH_WEB_URL,
        __DEV__,
      ),
    [],
  );
  const [accessMode, setAccessMode] = useState<
    "signed-out" | "demo" | "account"
  >("signed-out");
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [sessionRestored, setSessionRestored] = useState(false);
  const [sessionNotice, setSessionNotice] = useState<string | null>(null);
  const api = useMemo(
    () =>
      createApiClient(
        apiConfiguration.url ?? "https://unconfigured.invalid",
        fetch,
        {
          initialToken: authToken,
          demoSessions: accessMode === "demo",
          client: Platform.OS === "ios" ? "ios" : "android",
          onTokenChange: (token) => {
            if (token !== null) return;
            void clearSessionToken().catch(() => undefined);
            void clearPendingMessageAttempts().catch(() => undefined);
            setAuthToken(null);
            if (accessMode === "account") {
              setAccessMode("signed-out");
            }
          },
          onSessionInvalidated: () =>
            setSessionNotice("Your session ended. Sign in again."),
        },
      ),
    [accessMode, apiConfiguration.url, authToken],
  );
  const [tab, setTab] = useState<Tab>("Today");
  const [preferences, setPreferences] = useState<Preferences>(
    structuredClone(defaultPreferences),
  );
  const [profile, setProfile] = useState<Profile>(demoUser);
  const [introductions, setIntroductions] = useState<Introduction[]>([]);
  const [nextBatchAt, setNextBatchAt] = useState<string | null>(null);
  const [savedIntroductions, setSavedIntroductions] = useState<Introduction[]>(
    [],
  );
  const [showSaved, setShowSaved] = useState(false);
  const [showMath, setShowMath] = useState(false);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [selectedConnectionId, setSelectedConnectionId] = useState<
    string | null
  >(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [bio, setBio] = useState(demoUser.bio);
  const [editingProfile, setEditingProfile] = useState(false);
  const [safetyNotice, setSafetyNotice] = useState<string | null>(null);
  const [reports, setReports] = useState<ReportRecord[]>([]);
  const [reportUpdateId, setReportUpdateId] = useState<number | null>(null);
  const [reportUpdateKind, setReportUpdateKind] =
    useState<ReportUpdateKind>("additional_context");
  const [reportUpdateDetails, setReportUpdateDetails] = useState("");
  const [researchConsent, setResearchConsent] =
    useState<ResearchConsentReceipt | null>(null);
  const [directoryConsent, setDirectoryConsent] =
    useState<DirectoryConsentReceipt | null>(null);
  const [loading, setLoading] = useState(true);
  const [onboarded, setOnboarded] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<WeightSuggestion[]>([]);
  const [preferenceObservationCount, setPreferenceObservationCount] =
    useState(0);
  const [accountStatus, setAccountStatus] = useState<AccountStatus>("active");
  const [accountDeliveryStatus, setAccountDeliveryStatus] =
    useState<AccountDeliveryStatus | null>(null);
  const [securityNotificationDelivery, setSecurityNotificationDelivery] =
    useState<SecurityNotificationDeliveryStatus | null>(null);
  const [accountSessions, setAccountSessions] = useState<AccountSession[]>([]);
  const [emailVerification, setEmailVerification] =
    useState<EmailVerificationStatus | null>(null);
  const [notificationEmail, setNotificationEmail] =
    useState<NotificationEmailStatus | null>(null);
  const [delivery, setDelivery] = useState<DeliverySettings>({ batchSize: 5 });
  const [deletionReceipt, setDeletionReceipt] =
    useState<DeletionReceipt | null>(null);
  const [conversationDrafts, setConversationDrafts] = useState<
    Record<string, string>
  >({});
  const [pendingMessageAttempts, setPendingMessageAttempts] = useState<
    Record<string, { text: string; requestId: string }>
  >({});
  const [messageAttemptsRestored, setMessageAttemptsRestored] = useState(false);
  const [adultConfirmed, setAdultConfirmed] = useState(false);
  const [dataUseAccepted, setDataUseAccepted] = useState(false);
  const [directoryAccepted, setDirectoryAccepted] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordNotice, setPasswordNotice] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [recoveryPassword, setRecoveryPassword] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
  const [recoveryNotice, setRecoveryNotice] = useState<string | null>(null);
  const [verificationCode, setVerificationCode] = useState("");
  const [verificationNotice, setVerificationNotice] = useState<string | null>(
    null,
  );
  const [verificationError, setVerificationError] = useState<string | null>(
    null,
  );
  const [backupEmail, setBackupEmail] = useState("");
  const [backupPassword, setBackupPassword] = useState("");
  const [backupCode, setBackupCode] = useState("");
  const [backupNotice, setBackupNotice] = useState<string | null>(null);
  const [backupError, setBackupError] = useState<string | null>(null);
  const [introductionReportOpen, setIntroductionReportOpen] = useState(false);
  const [connectionReportOpen, setConnectionReportOpen] = useState(false);
  const [transparency, setTransparency] = useState<TransparencyVersion | null>(
    null,
  );
  const visibleIntroductions = showSaved ? savedIntroductions : introductions;
  const current = visibleIntroductions[0];
  const connection =
    connections.find(({ id }) => id === selectedConnectionId) ?? connections[0];
  const draft = connection ? (conversationDrafts[connection.id] ?? "") : "";
  const pendingMessageAttempt = connection
    ? pendingMessageAttempts[connection.id]
    : undefined;
  const setDraft = (value: string) => {
    if (!connection) return;
    setConversationDrafts((current) => ({
      ...current,
      [connection.id]: value,
    }));
  };
  useEffect(() => {
    if (!sessionRestored) return;
    let active = true;
    if (accessMode !== "account") {
      setPendingMessageAttempts({});
      setConversationDrafts({});
      setMessageAttemptsRestored(true);
      void clearPendingMessageAttempts().catch(() => undefined);
      return () => {
        active = false;
      };
    }
    setMessageAttemptsRestored(false);
    void restorePendingMessageAttempts()
      .then((restored) => {
        if (!active) return;
        setPendingMessageAttempts(restored);
        setConversationDrafts((current) => ({
          ...Object.fromEntries(
            Object.entries(restored).map(([id, attempt]) => [id, attempt.text]),
          ),
          ...current,
        }));
        setMessageAttemptsRestored(true);
      })
      .catch(() => {
        if (active) setMessageAttemptsRestored(true);
      });
    return () => {
      active = false;
    };
  }, [accessMode, sessionRestored]);
  useEffect(() => {
    if (
      !sessionRestored ||
      !messageAttemptsRestored ||
      accessMode !== "account"
    )
      return;
    void persistPendingMessageAttempts(pendingMessageAttempts).catch(
      () => undefined,
    );
  }, [
    accessMode,
    messageAttemptsRestored,
    pendingMessageAttempts,
    sessionRestored,
  ]);
  useEffect(() => {
    if (tab === "Profile" && accessMode === "account") return;
    setRecoveryCodes([]);
    setRecoveryPassword("");
    setRecoveryError(null);
  }, [accessMode, tab]);
  useEffect(() => {
    let active = true;
    if (!apiConfiguration.url) {
      setSessionRestored(true);
      return () => {
        active = false;
      };
    }
    void restoreSessionToken()
      .then((token) => {
        if (!active) return;
        if (token) {
          setAuthToken(token);
          setAccessMode("account");
        } else {
          setAccessMode(__DEV__ ? "demo" : "signed-out");
        }
      })
      .catch(() => {
        if (!active) return;
        setAccessMode(__DEV__ ? "demo" : "signed-out");
        setSessionNotice(
          "A saved session could not be restored securely. Sign in again; no token was used.",
        );
      })
      .finally(() => {
        if (active) setSessionRestored(true);
      });
    return () => {
      active = false;
    };
  }, [apiConfiguration.url]);
  const load = useCallback(async () => {
    if (!apiConfiguration.url) {
      setLoading(false);
      return;
    }
    if (!sessionRestored) return;
    if (accessMode === "signed-out") {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [
        nextProfile,
        nextPreferences,
        nextIntroductions,
        nextSavedIntroductions,
        nextConnections,
        onboarding,
        nextSuggestions,
        nextAccountStatus,
        nextDelivery,
        nextTransparency,
        nextReports,
        nextResearchConsent,
        nextAccountSessions,
        nextDirectoryConsent,
        nextEmailVerification,
        nextNotificationEmail,
        nextAccountDeliveryStatus,
        nextSecurityNotificationDelivery,
      ] = await Promise.all([
        api.profile(),
        api.preferences(),
        api.introductions(),
        api.savedIntroductions(),
        api.connections(),
        api.onboarding(),
        api.preferenceSuggestions(),
        api.accountStatus(),
        api.deliverySettings(),
        api.transparencyVersion(),
        api.reports(),
        api.researchConsent(),
        api.sessions(),
        api.directoryConsent(),
        accessMode === "account"
          ? api.emailVerification()
          : Promise.resolve(null),
        accessMode === "account"
          ? api.notificationEmail()
          : Promise.resolve(null),
        api.accountDeliveryStatus(),
        accessMode === "account"
          ? api.securityNotificationStatus()
          : Promise.resolve(null),
      ]);
      setProfile(nextProfile);
      setBio(nextProfile.bio);
      setPreferences(nextPreferences);
      setIntroductions(nextIntroductions.items);
      setNextBatchAt(nextIntroductions.nextBatchAt);
      setSavedIntroductions(nextSavedIntroductions.items);
      setConnections(nextConnections.items);
      setOnboarded(onboarding.complete);
      setSuggestions(nextSuggestions.items);
      setPreferenceObservationCount(nextSuggestions.observationCount);
      setAccountStatus(nextAccountStatus.status);
      setDelivery(nextDelivery);
      setTransparency(nextTransparency);
      setReports(nextReports.items);
      setResearchConsent(nextResearchConsent.receipt);
      setAccountSessions(nextAccountSessions.items);
      setDirectoryConsent(nextDirectoryConsent.receipt);
      setEmailVerification(nextEmailVerification);
      setNotificationEmail(nextNotificationEmail);
      setAccountDeliveryStatus(nextAccountDeliveryStatus);
      setSecurityNotificationDelivery(nextSecurityNotificationDelivery);
    } catch {
      setError(
        "OpenMatch could not reach its configured service. Check your connection and retry.",
      );
    } finally {
      setLoading(false);
    }
  }, [accessMode, api, apiConfiguration.url, sessionRestored]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    let active = true;
    let requestRunning = false;
    const synchronize = async () => {
      if (requestRunning || AppState.currentState !== "active") return;
      requestRunning = true;
      try {
        const { items } = await api.connections();
        if (active) setConnections(items);
      } catch {
        // The full load path owns visible connection errors. Background
        // reconciliation stays quiet and pauses with the app.
      } finally {
        requestRunning = false;
      }
    };
    const timer = setInterval(() => void synchronize(), 10_000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [api]);
  useEffect(() => {
    if (loading || !messageAttemptsRestored) return;
    const activeIds = new Set(connections.map(({ id }) => id));
    setConversationDrafts((current) => {
      const next = Object.fromEntries(
        Object.entries(current).filter(([id]) => activeIds.has(id)),
      );
      return Object.keys(next).length === Object.keys(current).length
        ? current
        : next;
    });
    setPendingMessageAttempts((current) => {
      const next = Object.fromEntries(
        Object.entries(current).filter(([id]) => activeIds.has(id)),
      );
      return Object.keys(next).length === Object.keys(current).length
        ? current
        : next;
    });
  }, [connections, loading, messageAttemptsRestored]);
  useEffect(() => {
    if (
      accountDeliveryStatus?.state !== "retrying" &&
      securityNotificationDelivery?.state !== "retrying"
    )
      return;
    const timer = setInterval(() => {
      if (accountDeliveryStatus?.state === "retrying")
        void api
          .accountDeliveryStatus()
          .then(setAccountDeliveryStatus)
          .catch(() => undefined);
      if (
        accessMode === "account" &&
        securityNotificationDelivery?.state === "retrying"
      )
        void api
          .securityNotificationStatus()
          .then(setSecurityNotificationDelivery)
          .catch(() => undefined);
    }, 5_000);
    return () => clearInterval(timer);
  }, [
    accessMode,
    accountDeliveryStatus?.state,
    api,
    securityNotificationDelivery?.state,
  ]);
  useEffect(() => {
    let active = true;
    setMessages([]);
    if (!connection) {
      setSelectedConnectionId(null);
      return () => {
        active = false;
      };
    }
    setSelectedConnectionId(connection.id);
    let requestRunning = false;
    const synchronize = async (showError: boolean) => {
      if (requestRunning || (!showError && AppState.currentState !== "active"))
        return;
      requestRunning = true;
      try {
        const { items } = await api.messages(connection.id);
        if (active) setMessages(items);
      } catch {
        if (active && showError)
          setSafetyNotice("Messages could not be loaded. Retry.");
      } finally {
        requestRunning = false;
      }
    };
    void synchronize(true);
    const timer = setInterval(() => void synchronize(false), 5_000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [api, connection?.id]);
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void load();
    });
    return () => subscription.remove();
  }, [load]);
  const savePreferences = async (next: Preferences) => {
    setPreferences(next);
    try {
      await api.updatePreferences(next);
      setIntroductions((await api.introductions()).items);
      const nextSuggestions = await api.preferenceSuggestions();
      setSuggestions(nextSuggestions.items);
      setPreferenceObservationCount(nextSuggestions.observationCount);
    } catch {
      setError("Preferences could not be saved.");
    }
  };
  const handleDeliveryFailure = async (error: unknown, fallback: string) => {
    if (
      error instanceof ApiError &&
      error.code === "account_delivery_incomplete"
    ) {
      setError(null);
      setSafetyNotice(
        "This action is safely queued, but delivery is not complete. Do not assume the other person received it yet.",
      );
      try {
        setAccountDeliveryStatus(await api.accountDeliveryStatus());
      } catch {
        // Preserve the explicit queued-delivery notice if status refresh also
        // fails; the unchanged action can still be retried safely.
      }
      return true;
    }
    setError(operationLimitMessage(error, fallback));
    return false;
  };
  const recordSecurityNotification = (status: SecurityNotificationStatus) => {
    void api
      .securityNotificationStatus()
      .then(setSecurityNotificationDelivery)
      .catch(() => undefined);
    return securityNotice(status);
  };
  const runCrossAccountAction = async (
    action: () => Promise<unknown>,
    fallback: string,
  ) => {
    try {
      await action();
      await load();
    } catch (error) {
      await handleDeliveryFailure(error, fallback);
    }
  };
  const decide = async (value: "interested" | "passed") => {
    if (!current) return;
    try {
      await api.decide(current.profile.id, value);
      setShowMath(false);
      setShowSaved(false);
      await load();
    } catch (error) {
      await handleDeliveryFailure(error, "Your decision could not be saved.");
    }
  };

  if (apiConfiguration.error)
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.empty}>
          <Text style={styles.name}>Service not configured</Text>
          <Text style={styles.subtle}>{apiConfiguration.error}</Text>
          <Text style={styles.mathNote}>
            No connection was attempted. This is a build configuration error,
            not an account problem.
          </Text>
        </View>
      </SafeAreaView>
    );
  if (!sessionRestored)
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.empty}>
          <Text style={styles.subtle}>Restoring your private session…</Text>
        </View>
      </SafeAreaView>
    );
  if (accessMode === "signed-out")
    return (
      <MobileAuthentication
        api={api}
        notice={sessionNotice}
        onAuthenticated={async (token, notification) => {
          await clearPendingMessageAttempts().catch(() => undefined);
          await persistSessionToken(token);
          setAuthToken(token);
          if (notification)
            setPasswordNotice(
              "Account recovered. Every previous session and recovery code was invalidated." +
                recordSecurityNotification(notification),
            );
          if (notification) setTab("Profile");
          setAccessMode("account");
          setLoading(true);
        }}
        tryDemo={
          __DEV__
            ? () => {
                setAccessMode("demo");
                setLoading(true);
              }
            : undefined
        }
      />
    );
  if (loading)
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.empty}>
          <Text style={styles.subtle}>Loading your private local data…</Text>
        </View>
      </SafeAreaView>
    );
  if (error)
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.empty}>
          <Text style={styles.name}>Couldn’t connect</Text>
          <Text style={styles.subtle}>{error}</Text>
          <Action label="Retry" onPress={() => void load()} />
        </View>
      </SafeAreaView>
    );
  if (!onboarded)
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <Text style={styles.brand}>OpenMatch</Text>
          <Text style={styles.nonprofit}>Nonprofit · Open</Text>
        </View>
        <ScrollView contentContainerStyle={styles.page}>
          {deletionReceipt && (
            <View style={styles.deletionReceipt} accessibilityRole="alert">
              <Text style={styles.deletionReceiptTitle}>
                Local data deletion completed
              </Text>
              <Text style={styles.scoreNote}>
                Completed synchronously at{" "}
                {new Date(deletionReceipt.completedAt).toLocaleString()}. No
                application-managed backups exist in this prototype.
              </Text>
            </View>
          )}
          <Text style={styles.eyebrow}>A small, honest beginning</Text>
          <Text style={styles.title}>Set your boundaries.</Text>
          <Text style={styles.subtle}>
            Only explicit information affects your introductions. Every input
            remains editable.
          </Text>
          <View style={styles.scoreCard}>
            <Text style={styles.name}>Your public profile</Text>
            <Text style={styles.setting}>Name</Text>
            <TextInput
              accessibilityLabel="Name"
              value={profile.name}
              maxLength={50}
              onChangeText={(name) => setProfile({ ...profile, name })}
              style={styles.bioInput}
            />
            <Text style={styles.setting}>Age · {profile.age}</Text>
            <View style={styles.adjust}>
              <Action
                label="−"
                accessibilityLabel="Lower age"
                secondary
                onPress={() =>
                  setProfile({ ...profile, age: Math.max(18, profile.age - 1) })
                }
              />
              <Action
                label="+"
                accessibilityLabel="Raise age"
                secondary
                onPress={() =>
                  setProfile({
                    ...profile,
                    age: Math.min(120, profile.age + 1),
                  })
                }
              />
            </View>
            <Text style={styles.setting}>Approximate city or region</Text>
            <TextInput
              accessibilityLabel="Approximate city or region"
              value={profile.city}
              maxLength={80}
              onChangeText={(city) => setProfile({ ...profile, city })}
              style={styles.textField}
            />
            <Text style={styles.setting}>Pronouns · optional</Text>
            <TextInput
              accessibilityLabel="Pronouns optional"
              value={profile.pronouns}
              maxLength={50}
              onChangeText={(pronouns) => setProfile({ ...profile, pronouns })}
              style={styles.textField}
            />
            <GenderDiscoveryFields value={profile} onChange={setProfile} />
            <IntentSelector
              value={profile.intent}
              onChange={(intent) => setProfile({ ...profile, intent })}
            />
            <ReadinessSelector
              value={profile.readiness}
              onChange={(readiness) => setProfile({ ...profile, readiness })}
            />
            <Text style={styles.setting}>About you</Text>
            <TextInput
              accessibilityLabel="About you"
              multiline
              value={profile.bio}
              maxLength={500}
              onChangeText={(nextBio) =>
                setProfile({ ...profile, bio: nextBio })
              }
              style={styles.bioInput}
            />
            <MatchingProfileFields value={profile} onChange={setProfile} />
          </View>
          <PreferencesScreen value={preferences} onChange={setPreferences} />
          <View style={styles.scoreCard}>
            <Text style={styles.scoreNote}>
              These settings filter and order mutually eligible people. They do
              not predict chemistry or measure anyone’s worth.
            </Text>
            <Text style={styles.consentTitle}>
              Before opening the prototype
            </Text>
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: adultConfirmed }}
              style={styles.consentRow}
              onPress={() => setAdultConfirmed(!adultConfirmed)}
            >
              <Text style={styles.radioMark}>{adultConfirmed ? "☑" : "☐"}</Text>
              <Text style={styles.consentCopy}>
                I confirm that I am at least 18 years old.
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: dataUseAccepted }}
              style={styles.consentRow}
              onPress={() => setDataUseAccepted(!dataUseAccepted)}
            >
              <Text style={styles.radioMark}>
                {dataUseAccepted ? "☑" : "☐"}
              </Text>
              <Text style={styles.consentCopy}>
                I understand this prototype stores what I enter so its features
                can work. I can export or delete it from Profile.
              </Text>
            </Pressable>
            {accessMode === "account" && (
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{
                  checked: directoryAccepted,
                  disabled:
                    (Boolean(emailVerification?.deliveryConfigured) &&
                      !emailVerification?.verifiedAt) ||
                    !profile.gender.trim() ||
                    !profile.genderGroups.length ||
                    !preferences.genderGroups.length,
                }}
                disabled={
                  (Boolean(emailVerification?.deliveryConfigured) &&
                    !emailVerification?.verifiedAt) ||
                  !profile.gender.trim() ||
                  !profile.genderGroups.length ||
                  !preferences.genderGroups.length
                }
                style={styles.consentRow}
                onPress={() => setDirectoryAccepted(!directoryAccepted)}
              >
                <Text style={styles.radioMark}>
                  {directoryAccepted ? "☑" : "☐"}
                </Text>
                <Text style={styles.consentCopy}>
                  I separately choose to join account matching. After setup
                  while Active, my chosen public profile can be shown to
                  mutually eligible accounts whose approximate city or region
                  text exactly matches mine. My private preferences and
                  one-sided decisions are not shown. I can withdraw this from
                  Profile.
                  {emailVerification?.deliveryConfigured &&
                  !emailVerification.verifiedAt
                    ? " Confirm your email from Profile before enabling this."
                    : ""}
                </Text>
              </Pressable>
            )}
            <Text style={styles.mathNote}>
              Receipt version prototype-0.1. No research consent, advertising,
              contact uploads, or hidden tracking.
            </Text>
            <Action
              label="See my introductions"
              disabled={
                !profile.name.trim() ||
                !profile.city.trim() ||
                !profile.bio.trim() ||
                !profile.prompt.trim() ||
                !profile.promptAnswer.trim() ||
                !profile.values.length ||
                !profile.gender.trim() ||
                !profile.genderGroups.length ||
                !preferences.genderGroups.length ||
                !adultConfirmed ||
                !dataUseAccepted
              }
              onPress={() =>
                void api
                  .updateProfile({
                    name: profile.name.trim(),
                    age: profile.age,
                    city: profile.city.trim(),
                    pronouns: profile.pronouns.trim(),
                    gender: profile.gender.trim(),
                    genderGroups: profile.genderGroups,
                    intent: profile.intent,
                    readiness: profile.readiness,
                    bio: profile.bio.trim(),
                    prompt: profile.prompt.trim(),
                    promptAnswer: profile.promptAnswer.trim(),
                    values: profile.values,
                    lifestyle: profile.lifestyle,
                  })
                  .then(() => api.updatePreferences(preferences))
                  .then(() => api.acceptPrototypeConsent())
                  .then(() =>
                    accessMode === "account" && directoryAccepted
                      ? api.updateDirectoryConsent(true)
                      : undefined,
                  )
                  .then(() => api.completeOnboarding())
                  .then(() => setDeletionReceipt(null))
                  .then(load)
                  .catch(() => setError("Setup could not be saved."))
              }
            />
          </View>
        </ScrollView>
      </SafeAreaView>
    );

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.brand}>OpenMatch</Text>
        <Text style={styles.nonprofit}>Nonprofit · Open</Text>
      </View>
      <ScrollView contentContainerStyle={styles.page}>
        <>
          {accountDeliveryStatus?.state === "retrying" && (
            <View style={styles.statusBanner} accessibilityLiveRegion="polite">
              <View style={styles.statusCopy}>
                <Text style={styles.statusTitle}>Delivery is retrying</Text>
                <Text style={styles.mathNote}>
                  {accountDeliveryStatus.pendingCount} account change
                  {accountDeliveryStatus.pendingCount === 1
                    ? " is"
                    : "s are"}{" "}
                  still queued. OpenMatch keeps it in order and does not discard
                  it automatically. Do not assume the other person received it
                  yet.
                </Text>
              </View>
              <Action label="Check again" onPress={() => void load()} />
            </View>
          )}
          {securityNotificationDelivery?.state === "retrying" && (
            <View style={styles.statusBanner} accessibilityLiveRegion="polite">
              <View style={styles.statusCopy}>
                <Text style={styles.statusTitle}>
                  Security email is retrying
                </Text>
                <Text style={styles.mathNote}>
                  {securityNotificationDelivery.pendingCount} security notice
                  {securityNotificationDelivery.pendingCount === 1
                    ? " has"
                    : "s have"}{" "}
                  not reached every confirmed inbox. It remains queued and is
                  never silently discarded.
                </Text>
              </View>
              <Action
                label="Retry email"
                onPress={() =>
                  void api
                    .retrySecurityNotifications()
                    .then(setSecurityNotificationDelivery)
                    .catch(() => setError("Security email retry failed."))
                }
              />
            </View>
          )}
          {accountStatus !== "active" && (
            <View style={styles.statusBanner} accessibilityLiveRegion="polite">
              <View style={styles.statusCopy}>
                <Text style={styles.statusTitle}>
                  {accountStatus === "paused"
                    ? "Introductions paused"
                    : "Profile hidden"}
                </Text>
                <Text style={styles.mathNote}>
                  No new introductions appear until you resume.
                </Text>
              </View>
              <Action
                label="Resume"
                onPress={() =>
                  void api.updateAccountStatus("active").then(load)
                }
              />
            </View>
          )}
          {tab === "Today" &&
            (current ? (
              <>
                <Text style={styles.eyebrow}>
                  {showSaved ? "Saved introductions" : "Your introductions"}
                </Text>
                <Text accessibilityRole="header" style={styles.title}>
                  {visibleIntroductions.length} remaining
                </Text>
                <Text style={styles.subtle}>A finite set. Take your time.</Text>
                <Action
                  label={
                    showSaved
                      ? "Back to current batch"
                      : `Saved (${savedIntroductions.length})`
                  }
                  secondary
                  onPress={() => {
                    setShowMath(false);
                    setShowSaved(!showSaved);
                  }}
                />
                <View style={styles.card}>
                  <View
                    style={[
                      styles.portrait,
                      { backgroundColor: current.profile.color },
                    ]}
                  >
                    <Text style={styles.initial}>
                      {current.profile.name[0]}
                    </Text>
                    <Text style={styles.distance}>
                      {current.profile.distanceBand}
                    </Text>
                  </View>
                  <View style={styles.cardBody}>
                    <Text style={styles.name}>
                      {current.profile.name}, {current.profile.age}
                    </Text>
                    <Text style={styles.meta}>
                      {current.profile.pronouns} · {current.profile.gender} ·{" "}
                      {current.profile.city}
                    </Text>
                    <Text style={styles.intent}>{current.profile.intent}</Text>
                    <Text style={styles.meta}>{current.profile.readiness}</Text>
                    <Text style={styles.bio}>{current.profile.bio}</Text>
                    <View style={styles.prompt}>
                      <Text style={styles.promptLabel}>
                        {current.profile.prompt}
                      </Text>
                      <Text style={styles.promptAnswer}>
                        {current.profile.promptAnswer}
                      </Text>
                    </View>
                    <View style={styles.chips}>
                      {current.profile.values.map((value) => (
                        <Text style={styles.chip} key={value}>
                          {value}
                        </Text>
                      ))}
                    </View>
                  </View>
                </View>
                <View style={styles.scoreCard}>
                  <Text style={styles.eyebrow}>Why this introduction</Text>
                  {current.explanation.selectionMode === "exploration" && (
                    <View style={styles.explorationNote}>
                      <Text style={styles.explorationTitle}>
                        Public lottery slot
                      </Text>
                      <Text style={styles.scoreNote}>
                        One place in this five-person batch is selected
                        reproducibly from eligible profiles. It does not change
                        anyone’s score.
                      </Text>
                    </View>
                  )}
                  <Text style={styles.score}>
                    {Math.round(current.explanation.finalScore * 100)}%
                  </Text>
                  <Text style={styles.scoreNote}>
                    Fit with explicit preferences you both control—not predicted
                    chemistry.
                  </Text>
                  {current.reasons.map((reason) => (
                    <Text style={styles.reason} key={reason}>
                      ✓ {reason}
                    </Text>
                  ))}
                  <Pressable onPress={() => setShowMath(!showMath)}>
                    <Text style={styles.link}>
                      {showMath
                        ? "Hide calculation"
                        : "See the full calculation"}
                    </Text>
                  </Pressable>
                  {showMath && (
                    <View style={styles.math}>
                      <Text style={styles.mathNote}>
                        Your directed fit ·{" "}
                        {Math.round(current.explanation.directedFitA * 100)}%
                      </Text>
                      {current.explanation.factorsForA.map((factor) => (
                        <View style={styles.mathRow} key={`a-${factor.id}`}>
                          <Text>{factor.label}</Text>
                          <Text style={styles.mathValue}>
                            {Math.round(factor.compatibility * 100)}% ×{" "}
                            {Math.round(factor.weight * 100)}%
                          </Text>
                        </View>
                      ))}
                      <Text style={styles.mathNote}>
                        Their directed fit ·{" "}
                        {Math.round(current.explanation.directedFitB * 100)}%
                      </Text>
                      {current.explanation.factorsForB ? (
                        current.explanation.factorsForB.map((factor) => (
                          <View style={styles.mathRow} key={`b-${factor.id}`}>
                            <Text>{factor.label}</Text>
                            <Text style={styles.mathValue}>
                              {Math.round(factor.compatibility * 100)}% ×{" "}
                              {Math.round(factor.weight * 100)}%
                            </Text>
                          </View>
                        ))
                      ) : (
                        <Text style={styles.mathNote}>
                          Their factor weights are private personal inputs. The
                          score uses the published formula and no undocumented
                          system factors.
                        </Text>
                      )}
                      <Text style={styles.mathNote}>
                        Harmonic mean{" "}
                        {Math.round(current.explanation.reciprocalFit * 100)}% ·
                        Algorithm {ALGORITHM_VERSION} · No undocumented system
                        factors.
                      </Text>
                      <Text style={styles.mathNote}>
                        Selection {current.explanation.selectionMode} ·
                        probability{" "}
                        {Math.round(
                          current.explanation.selectionProbability * 100,
                        )}
                        %
                        {current.explanation.weeklySeed
                          ? ` · public seed ${current.explanation.weeklySeed}`
                          : ""}
                      </Text>
                    </View>
                  )}
                </View>
                <View style={styles.actions}>
                  <Action
                    label={showSaved ? "Return to batch" : "Save for later"}
                    secondary
                    onPress={() =>
                      void (showSaved
                        ? api
                            .unsaveIntroduction(current.profile.id)
                            .then(() => {
                              setShowSaved(false);
                              return load();
                            })
                        : api.saveIntroduction(current.profile.id).then(() => {
                            setSafetyNotice(
                              `${current.profile.name} saved for this prototype batch.`,
                            );
                            return load();
                          }))
                    }
                  />
                  <Action
                    label="Pass"
                    secondary
                    onPress={() => void decide("passed")}
                  />
                  <Action
                    label="Interested"
                    onPress={() => void decide("interested")}
                  />
                </View>
                <Text style={styles.private}>
                  Private unless interest is mutual.
                </Text>
                {safetyNotice && (
                  <Text
                    accessibilityLiveRegion="polite"
                    style={styles.safetyNotice}
                  >
                    {safetyNotice}
                  </Text>
                )}
                <View style={styles.introductionSafety}>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setIntroductionReportOpen(true)}
                  >
                    <Text style={styles.safetyLink}>Report this profile</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() =>
                      Alert.alert(
                        `Block ${current.profile.name}?`,
                        "They will no longer appear in your introductions.",
                        [
                          { text: "Cancel", style: "cancel" },
                          {
                            text: "Block",
                            style: "destructive",
                            onPress: () =>
                              void runCrossAccountAction(
                                () => api.block(current.profile.id),
                                "The block could not be completed.",
                              ),
                          },
                        ],
                      )
                    }
                  >
                    <Text style={styles.safetyLink}>
                      Block {current.profile.name}
                    </Text>
                  </Pressable>
                </View>
                {introductionReportOpen && (
                  <MobileReportForm
                    name={current.profile.name}
                    cancel={() => setIntroductionReportOpen(false)}
                    submit={async (reason, details) => {
                      try {
                        const result = await api.report(
                          current.profile.id,
                          reason,
                          details,
                        );
                        setSafetyNotice(
                          `Report received. This profile is concealed from future introductions. Reference status: ${result.status}.`,
                        );
                        setReports((await api.reports()).items);
                        setIntroductionReportOpen(false);
                        await load();
                      } catch (error) {
                        setSafetyNotice(
                          operationLimitMessage(
                            error,
                            "Report could not be sent. Retry.",
                          ),
                        );
                      }
                    }}
                  />
                )}
              </>
            ) : (
              <View style={styles.empty}>
                <Text style={styles.check}>✓</Text>
                <Text style={styles.name}>
                  {showSaved ? "Nothing saved." : "You’re all caught up."}
                </Text>
                <Text style={styles.subtle}>
                  {showSaved
                    ? "Saved profiles stay here until you return them, decide, or delete this local prototype."
                    : `No endless feed and no recycling decisions. The next weekly batch window begins${
                        nextBatchAt
                          ? ` ${new Date(nextBatchAt).toLocaleDateString(
                              undefined,
                              {
                                weekday: "long",
                                month: "long",
                                day: "numeric",
                                timeZone: "UTC",
                              },
                            )}`
                          : " later"
                      }. Only newly eligible profiles may appear.`}
                </Text>
                {showSaved && (
                  <Action
                    label="Back to current batch"
                    onPress={() => setShowSaved(false)}
                  />
                )}
              </View>
            ))}
          {tab === "Preferences" && (
            <PreferencesScreen
              value={preferences}
              suggestions={suggestions}
              observationCount={preferenceObservationCount}
              clearObservations={() =>
                Alert.alert(
                  "Clear learning examples?",
                  "The decision examples used for preference suggestions will be deleted. Your Interested and Pass decisions will stay unchanged.",
                  [
                    { text: "Cancel", style: "cancel" },
                    {
                      text: "Clear",
                      style: "destructive",
                      onPress: () =>
                        void api
                          .clearPreferenceObservations()
                          .then((result) => {
                            setSuggestions([]);
                            setPreferenceObservationCount(
                              result.observationCount,
                            );
                            setSafetyNotice(
                              result.cleared
                                ? `Cleared ${result.cleared} learning example${result.cleared === 1 ? "" : "s"}.`
                                : "There were no learning examples to clear.",
                            );
                          })
                          .catch(() =>
                            setError("Learning examples could not be cleared."),
                          ),
                    },
                  ],
                )
              }
              delivery={delivery}
              setBatchSize={(batchSize) =>
                void api
                  .updateDeliverySettings(batchSize)
                  .then(async (next) => {
                    setDelivery(next);
                    setIntroductions((await api.introductions()).items);
                  })
              }
              onChange={(next) => void savePreferences(next)}
            />
          )}
          {tab === "Connections" &&
            (connection ? (
              <>
                <Text style={styles.eyebrow}>Connection</Text>
                <Text style={styles.title}>
                  {connection.profile?.name ?? "Connection"}
                </Text>
                <Text style={styles.subtle}>
                  You both expressed interest. Text only, with no read receipts.
                </Text>
                {connections.length > 1 && (
                  <View
                    style={styles.connectionPicker}
                    accessibilityRole="radiogroup"
                    accessibilityLabel="Choose a connection"
                  >
                    {connections.map((item) => (
                      <Pressable
                        accessibilityRole="radio"
                        accessibilityState={{
                          checked: item.id === connection.id,
                        }}
                        style={[
                          styles.connectionChoice,
                          item.id === connection.id &&
                            styles.connectionChoiceSelected,
                        ]}
                        onPress={() => setSelectedConnectionId(item.id)}
                        key={item.id}
                      >
                        <Text
                          style={
                            item.id === connection.id
                              ? styles.connectionChoiceTextSelected
                              : styles.connectionChoiceText
                          }
                        >
                          {item.profile?.name ?? "Connection"}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                )}
                <Action
                  label="Close politely with a standard message"
                  secondary
                  onPress={() =>
                    Alert.alert("Send and close?", POLITE_CLOSE_MESSAGE, [
                      { text: "Cancel", style: "cancel" },
                      {
                        text: "Send and close",
                        onPress: () =>
                          void runCrossAccountAction(
                            () => api.closePolitely(connection.id),
                            "The polite close could not be delivered.",
                          ),
                      },
                    ])
                  }
                />
                <Action
                  label={
                    connection.muted
                      ? "Unmute conversation"
                      : "Mute conversation"
                  }
                  secondary
                  onPress={() =>
                    void api
                      .updateConnectionMute(connection.id, !connection.muted)
                      .then(load)
                  }
                />
                <Text style={styles.mathNote}>
                  {connection.muted
                    ? "Muted. Future message notifications would be suppressed. Messages remain available."
                    : "This prototype sends no notifications yet; the preference is stored for future delivery."}
                </Text>
                <View style={styles.scoreCard}>
                  <Text style={styles.eyebrow}>Optional next step</Text>
                  <Text style={styles.name}>
                    Would you like to plan a first meeting?
                  </Text>
                  <Text style={styles.scoreNote}>
                    This private, reversible preference does not affect matching
                    and is not a claim that a date happened. The prototype does
                    not send it to the other person.
                  </Text>
                  <View style={styles.adjust}>
                    <Action
                      label="Not yet"
                      secondary={connection.meetingPreference !== "not_yet"}
                      selected={connection.meetingPreference === "not_yet"}
                      onPress={() =>
                        void api
                          .updateMeetingPreference(connection.id, "not_yet")
                          .then(load)
                      }
                    />
                    <Action
                      label="Open to planning"
                      secondary={
                        connection.meetingPreference !== "open_to_plan"
                      }
                      selected={connection.meetingPreference === "open_to_plan"}
                      onPress={() =>
                        void api
                          .updateMeetingPreference(
                            connection.id,
                            "open_to_plan",
                          )
                          .then(load)
                      }
                    />
                  </View>
                  {connection.meetingPreference !== "not_asked" && (
                    <Text
                      accessibilityLiveRegion="polite"
                      style={styles.mathNote}
                    >
                      {connection.meetingPreference === "open_to_plan"
                        ? "Saved privately: open to planning."
                        : "Saved privately: not yet."}
                    </Text>
                  )}
                  <Text style={styles.reason}>
                    ✓ Choose a busy public place.
                  </Text>
                  <Text style={styles.reason}>
                    ✓ Keep control of your transport and exact location.
                  </Text>
                  <Text style={styles.reason}>
                    ✓ Tell someone you trust where you are going.
                  </Text>
                </View>
                <View style={styles.scoreCard}>
                  {safetyNotice && (
                    <Text
                      accessibilityLiveRegion="polite"
                      style={styles.scoreNote}
                    >
                      {safetyNotice}
                    </Text>
                  )}
                  {messages.length === 0 ? (
                    <Text style={styles.scoreNote}>
                      Start with something from their profile—not a generated
                      line.
                    </Text>
                  ) : (
                    messages.map((message) => {
                      const sent = message.senderId === "me";
                      const author = sent
                        ? "You"
                        : (connection.profile?.name ?? "Connection");
                      return (
                        <View
                          accessible
                          accessibilityLabel={author + ": " + message.text}
                          style={[
                            styles.mobileBubble,
                            sent
                              ? styles.mobileBubbleSent
                              : styles.mobileBubbleReceived,
                          ]}
                          key={message.id}
                        >
                          <Text style={styles.mobileBubbleAuthor}>
                            {author}
                          </Text>
                          <Text>{message.text}</Text>
                        </View>
                      );
                    })
                  )}
                  {connection.profile && (
                    <>
                      <Action
                        label="Start from their profile"
                        secondary
                        onPress={() => {
                          setPendingMessageAttempts((current) => {
                            const next = { ...current };
                            delete next[connection.id];
                            return next;
                          });
                          setDraft(conversationStarter(connection.profile!));
                        }}
                      />
                      <Text style={styles.mathNote}>
                        Copies a simple profile-specific draft. Review and edit
                        it yourself before sending.
                      </Text>
                    </>
                  )}
                  <TextInput
                    accessibilityLabel={`Message ${connection.profile?.name ?? "connection"}`}
                    value={draft}
                    onChangeText={(value) => {
                      setDraft(value);
                      if (pendingMessageAttempt?.text !== value)
                        setPendingMessageAttempts((current) => {
                          const next = { ...current };
                          delete next[connection.id];
                          return next;
                        });
                    }}
                    maxLength={1000}
                    multiline
                    placeholder="Write a message"
                    style={styles.messageInput}
                  />
                  <Action
                    label="Send"
                    disabled={!draft.trim()}
                    onPress={() => {
                      const text = draft.trim();
                      if (!text) return;
                      const safetyFlags = messageSafetyFlags(text);
                      const sendMessage = async (
                        safetyAcknowledged = false,
                      ) => {
                        const messageAttempt =
                          pendingMessageAttempt?.text === text
                            ? pendingMessageAttempt
                            : {
                                text,
                                requestId: Crypto.randomUUID(),
                              };
                        const nextAttempts = {
                          ...pendingMessageAttempts,
                          [connection.id]: messageAttempt,
                        };
                        setPendingMessageAttempts(nextAttempts);
                        await persistPendingMessageAttempts(nextAttempts).catch(
                          () => undefined,
                        );
                        return api
                          .sendMessage(
                            connection.id,
                            text,
                            safetyAcknowledged,
                            messageAttempt.requestId,
                          )
                          .then((message) => {
                            setMessages((previous) => [...previous, message]);
                            setConversationDrafts((current) => {
                              const next = { ...current };
                              delete next[connection.id];
                              return next;
                            });
                            setPendingMessageAttempts((current) => {
                              const next = { ...current };
                              delete next[connection.id];
                              void persistPendingMessageAttempts(next).catch(
                                () => undefined,
                              );
                              return next;
                            });
                          })
                          .catch((error) =>
                            handleDeliveryFailure(
                              error,
                              "Message could not be sent. Retry.",
                            ),
                          );
                      };
                      if (safetyFlags.length === 0) void sendMessage();
                      else
                        Alert.alert(
                          "Pause before sending",
                          `${safetyFlags
                            .map((flag) => `${flag.label}: ${flag.explanation}`)
                            .join("\n\n")}\n\nThese simple rules can be wrong.`,
                          [
                            { text: "Go back", style: "cancel" },
                            {
                              text: "Send anyway",
                              onPress: () => void sendMessage(true),
                            },
                          ],
                        );
                    }}
                  />
                  <Pressable
                    accessibilityRole="button"
                    onPress={() =>
                      Alert.alert(
                        "Unmatch?",
                        "This closes the conversation for both people.",
                        [
                          { text: "Cancel", style: "cancel" },
                          {
                            text: "Unmatch",
                            style: "destructive",
                            onPress: () =>
                              void runCrossAccountAction(
                                () => api.unmatch(connection.id),
                                "The conversation could not be closed.",
                              ),
                          },
                        ],
                      )
                    }
                  >
                    <Text style={styles.safetyLink}>Unmatch</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() =>
                      Alert.alert(
                        "Block this person?",
                        "They will be removed from your introductions and connections.",
                        [
                          { text: "Cancel", style: "cancel" },
                          {
                            text: "Block",
                            style: "destructive",
                            onPress: () =>
                              void runCrossAccountAction(
                                () => api.block(connection.profileId),
                                "The block could not be completed.",
                              ),
                          },
                        ],
                      )
                    }
                  >
                    <Text style={styles.safetyLink}>Block</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setConnectionReportOpen(true)}
                  >
                    <Text style={styles.safetyLink}>Report</Text>
                  </Pressable>
                  {connectionReportOpen && (
                    <MobileReportForm
                      name={connection.profile?.name ?? "this person"}
                      cancel={() => setConnectionReportOpen(false)}
                      submit={async (reason, details) => {
                        try {
                          const result = await api.report(
                            connection.profileId,
                            reason,
                            details,
                          );
                          setSafetyNotice(
                            `Report received. This profile is concealed from future introductions; this conversation remains available until you unmatch or block. Reference status: ${result.status}.`,
                          );
                          setReports((await api.reports()).items);
                          setConnectionReportOpen(false);
                        } catch (error) {
                          setSafetyNotice(
                            operationLimitMessage(
                              error,
                              "Report could not be sent. Retry.",
                            ),
                          );
                        }
                      }}
                    />
                  )}
                </View>
              </>
            ) : (
              <View style={styles.empty}>
                <Text style={styles.check}>○</Text>
                <Text style={styles.name}>No connections yet</Text>
                <Text style={styles.subtle}>
                  Connections appear only after mutual interest.
                </Text>
              </View>
            ))}
          {tab === "Profile" && (
            <>
              <Text style={styles.eyebrow}>Your profile</Text>
              <Text style={styles.title}>
                {profile.name}, {profile.age}
              </Text>
              <Text style={styles.subtle}>
                What mutually eligible people see.
              </Text>
              <View style={styles.scoreCard}>
                {editingProfile ? (
                  <>
                    <Text style={styles.setting}>Display name</Text>
                    <TextInput
                      accessibilityLabel="Profile display name"
                      value={profile.name}
                      maxLength={50}
                      onChangeText={(name) => setProfile({ ...profile, name })}
                      style={styles.textField}
                    />
                    <Text style={styles.setting}>Age · {profile.age}</Text>
                    <View style={styles.adjust}>
                      <Action
                        label="−"
                        accessibilityLabel="Lower profile age"
                        secondary
                        onPress={() =>
                          setProfile({
                            ...profile,
                            age: Math.max(18, profile.age - 1),
                          })
                        }
                      />
                      <Action
                        label="+"
                        accessibilityLabel="Raise profile age"
                        secondary
                        onPress={() =>
                          setProfile({
                            ...profile,
                            age: Math.min(120, profile.age + 1),
                          })
                        }
                      />
                    </View>
                    <Text style={styles.setting}>
                      Approximate city or region
                    </Text>
                    <TextInput
                      accessibilityLabel="Profile approximate city or region"
                      value={profile.city}
                      maxLength={80}
                      onChangeText={(city) => setProfile({ ...profile, city })}
                      style={styles.textField}
                    />
                    <Text style={styles.setting}>Pronouns · optional</Text>
                    <TextInput
                      accessibilityLabel="Profile pronouns optional"
                      value={profile.pronouns}
                      maxLength={50}
                      onChangeText={(pronouns) =>
                        setProfile({ ...profile, pronouns })
                      }
                      style={styles.textField}
                    />
                    <GenderDiscoveryFields
                      value={profile}
                      onChange={setProfile}
                    />
                    <IntentSelector
                      value={profile.intent}
                      onChange={(intent) => setProfile({ ...profile, intent })}
                    />
                    <ReadinessSelector
                      value={profile.readiness}
                      onChange={(readiness) =>
                        setProfile({ ...profile, readiness })
                      }
                    />
                    <Text style={styles.setting}>Biography</Text>
                    <TextInput
                      accessibilityLabel="Profile bio"
                      multiline
                      value={bio}
                      maxLength={500}
                      onChangeText={setBio}
                      style={styles.bioInput}
                    />
                    <MatchingProfileFields
                      value={profile}
                      onChange={setProfile}
                    />
                  </>
                ) : (
                  <>
                    <Text style={styles.meta}>
                      {profile.pronouns || "Pronouns not shown"} ·{" "}
                      {profile.gender} · {profile.city}
                    </Text>
                    <Text style={styles.intent}>{profile.intent}</Text>
                    <Text style={styles.meta}>{profile.readiness}</Text>
                    <Text style={styles.bio}>{bio}</Text>
                  </>
                )}
                <View style={styles.prompt}>
                  <Text style={styles.promptLabel}>{profile.prompt}</Text>
                  <Text style={styles.promptAnswer}>
                    {profile.promptAnswer}
                  </Text>
                </View>
                <View style={styles.chips}>
                  {profile.values.map((value) => (
                    <Text style={styles.chip} key={value}>
                      {value}
                    </Text>
                  ))}
                </View>
                <Action
                  label={editingProfile ? "Done" : "Edit profile"}
                  secondary
                  disabled={
                    editingProfile &&
                    (!profile.name.trim() ||
                      !profile.city.trim() ||
                      !bio.trim() ||
                      !profile.prompt.trim() ||
                      !profile.promptAnswer.trim() ||
                      !profile.values.length ||
                      !profile.gender.trim() ||
                      !profile.genderGroups.length)
                  }
                  onPress={() => {
                    if (editingProfile)
                      void api
                        .updateProfile({
                          name: profile.name.trim(),
                          age: profile.age,
                          city: profile.city.trim(),
                          pronouns: profile.pronouns.trim(),
                          gender: profile.gender.trim(),
                          genderGroups: profile.genderGroups,
                          intent: profile.intent,
                          readiness: profile.readiness,
                          bio: bio.trim(),
                          prompt: profile.prompt.trim(),
                          promptAnswer: profile.promptAnswer.trim(),
                          values: profile.values,
                          lifestyle: profile.lifestyle,
                        })
                        .then(setProfile)
                        .catch(() => setError("Profile could not be saved."));
                    setEditingProfile(!editingProfile);
                  }}
                />
              </View>
              {accessMode === "account" && emailVerification && (
                <View style={styles.scoreCard}>
                  <Text style={styles.name}>Email for account messages</Text>
                  <Text selectable style={styles.scoreNote}>
                    {emailVerification.email}
                  </Text>
                  {emailVerification.verifiedAt ? (
                    <Text
                      accessibilityLiveRegion="polite"
                      style={styles.mathNote}
                    >
                      Confirmed for account messages on{" "}
                      {new Date(emailVerification.verifiedAt).toLocaleString()}.
                      Confirmation proves access to this inbox—not identity.
                    </Text>
                  ) : emailVerification.deliveryConfigured ? (
                    <>
                      <Text style={styles.scoreNote}>
                        Enter the eight-digit code sent by OpenMatch. It expires
                        after 24 hours and works once. Never send it to another
                        person.
                      </Text>
                      <Text style={styles.setting}>Confirmation code</Text>
                      <TextInput
                        accessibilityLabel="Email confirmation code"
                        autoComplete="one-time-code"
                        keyboardType="number-pad"
                        maxLength={8}
                        value={verificationCode}
                        onChangeText={(value) =>
                          setVerificationCode(
                            value.replace(/\D/g, "").slice(0, 8),
                          )
                        }
                        style={styles.textField}
                      />
                      <Action
                        label="Confirm email"
                        secondary
                        disabled={verificationCode.length !== 8}
                        onPress={() => {
                          setVerificationError(null);
                          setVerificationNotice(null);
                          void api
                            .confirmEmail(verificationCode)
                            .then(async () => {
                              setVerificationCode("");
                              setEmailVerification(
                                await api.emailVerification(),
                              );
                              setVerificationNotice("Email confirmed.");
                            })
                            .catch((error) =>
                              setVerificationError(
                                error instanceof ApiError &&
                                  error.code === "invalid_verification_code"
                                  ? "The code was not accepted or has expired."
                                  : "The email could not be confirmed.",
                              ),
                            );
                        }}
                      />
                      <Action
                        label="Send another code"
                        secondary
                        onPress={() => {
                          setVerificationError(null);
                          setVerificationNotice(null);
                          void api
                            .requestEmailVerification()
                            .then(() =>
                              setVerificationNotice("A new code was sent."),
                            )
                            .catch((error) =>
                              setVerificationError(
                                error instanceof ApiError &&
                                  error.code === "verification_resend_too_soon"
                                  ? "Please wait one minute before requesting another code."
                                  : "A new code could not be sent.",
                              ),
                            );
                        }}
                      />
                      {verificationNotice && (
                        <Text
                          accessibilityLiveRegion="polite"
                          style={styles.mathNote}
                        >
                          {verificationNotice}
                        </Text>
                      )}
                      {verificationError && (
                        <Text
                          accessibilityRole="alert"
                          style={styles.errorText}
                        >
                          {verificationError}
                        </Text>
                      )}
                    </>
                  ) : (
                    <Text style={styles.scoreNote}>
                      Email delivery is not configured on this development
                      service, so the address is not confirmed. A real-person
                      deployment must configure encrypted SMTP delivery before
                      relying on it.
                    </Text>
                  )}
                </View>
              )}
              {accessMode === "account" && notificationEmail && (
                <View style={styles.scoreCard}>
                  <Text style={styles.name}>Backup security email</Text>
                  <Text style={styles.scoreNote}>
                    Add one independently confirmed inbox for sparse account
                    security notices. It cannot sign in, recover the account,
                    affect matching, or prove identity. Your current passphrase
                    is required to add, replace, or remove it.
                  </Text>
                  {notificationEmail.email ? (
                    <>
                      <Text selectable style={styles.setting}>
                        {notificationEmail.email}
                      </Text>
                      <Text style={styles.mathNote}>
                        Confirmed on{" "}
                        {new Date(
                          notificationEmail.verifiedAt!,
                        ).toLocaleString()}
                      </Text>
                      <Text style={styles.setting}>Current passphrase</Text>
                      <TextInput
                        accessibilityLabel="Passphrase to remove backup email"
                        autoCapitalize="none"
                        autoComplete="current-password"
                        secureTextEntry
                        value={backupPassword}
                        maxLength={128}
                        onChangeText={setBackupPassword}
                        style={styles.textField}
                      />
                      <Action
                        label="Remove backup email"
                        secondary
                        disabled={!backupPassword}
                        onPress={() =>
                          Alert.alert(
                            "Remove backup security email?",
                            "Future security notices will use only the primary confirmed inbox.",
                            [
                              { text: "Cancel", style: "cancel" },
                              {
                                text: "Remove",
                                style: "destructive",
                                onPress: () => {
                                  setBackupError(null);
                                  setBackupNotice(null);
                                  void api
                                    .removeNotificationEmail(backupPassword)
                                    .then((result) => {
                                      setNotificationEmail(result);
                                      setBackupPassword("");
                                      setBackupNotice(
                                        "Backup security email removed." +
                                          recordSecurityNotification(
                                            result.securityNotification,
                                          ),
                                      );
                                    })
                                    .catch((error) =>
                                      setBackupError(
                                        error instanceof ApiError &&
                                          error.code ===
                                            "invalid_current_password"
                                          ? "The current passphrase was not accepted."
                                          : "The backup security email could not be removed.",
                                      ),
                                    );
                                },
                              },
                            ],
                          )
                        }
                      />
                    </>
                  ) : notificationEmail.pendingEmail ? (
                    <>
                      <Text style={styles.scoreNote}>
                        Enter the eight-digit code sent to{" "}
                        {notificationEmail.pendingEmail}.
                      </Text>
                      <Text style={styles.setting}>Confirmation code</Text>
                      <TextInput
                        accessibilityLabel="Backup email confirmation code"
                        autoComplete="one-time-code"
                        keyboardType="number-pad"
                        maxLength={8}
                        value={backupCode}
                        onChangeText={(value) =>
                          setBackupCode(value.replace(/\D/g, "").slice(0, 8))
                        }
                        style={styles.textField}
                      />
                      <Action
                        label="Confirm backup email"
                        secondary
                        disabled={backupCode.length !== 8}
                        onPress={() => {
                          setBackupError(null);
                          setBackupNotice(null);
                          void api
                            .confirmNotificationEmail(backupCode)
                            .then((result) => {
                              setNotificationEmail(result);
                              setBackupCode("");
                              setBackupNotice(
                                "Backup security email confirmed." +
                                  recordSecurityNotification(
                                    result.securityNotification,
                                  ),
                              );
                            })
                            .catch((error) =>
                              setBackupError(
                                error instanceof ApiError &&
                                  error.code === "invalid_verification_code"
                                  ? "The code was not accepted or has expired."
                                  : "The backup security email could not be confirmed.",
                              ),
                            );
                        }}
                      />
                    </>
                  ) : (
                    <>
                      <Text style={styles.setting}>Backup email</Text>
                      <TextInput
                        accessibilityLabel="Backup security email"
                        autoCapitalize="none"
                        autoComplete="email"
                        keyboardType="email-address"
                        value={backupEmail}
                        onChangeText={setBackupEmail}
                        style={styles.textField}
                      />
                      <Text style={styles.setting}>Current passphrase</Text>
                      <TextInput
                        accessibilityLabel="Passphrase to add backup email"
                        autoCapitalize="none"
                        autoComplete="current-password"
                        secureTextEntry
                        value={backupPassword}
                        maxLength={128}
                        onChangeText={setBackupPassword}
                        style={styles.textField}
                      />
                      <Action
                        label="Send confirmation code"
                        secondary
                        disabled={!backupEmail || !backupPassword}
                        onPress={() => {
                          setBackupError(null);
                          setBackupNotice(null);
                          void api
                            .requestNotificationEmail(
                              backupEmail,
                              backupPassword,
                            )
                            .then(async () => {
                              setBackupEmail("");
                              setBackupPassword("");
                              setNotificationEmail(
                                await api.notificationEmail(),
                              );
                              setBackupNotice("A confirmation code was sent.");
                            })
                            .catch((error) =>
                              setBackupError(
                                error instanceof ApiError &&
                                  error.code === "invalid_current_password"
                                  ? "The current passphrase was not accepted."
                                  : error instanceof ApiError &&
                                      error.code === "primary_email_unverified"
                                    ? "Confirm the primary account email first."
                                    : "The confirmation code could not be sent.",
                              ),
                            );
                        }}
                      />
                    </>
                  )}
                  {backupNotice && (
                    <Text
                      accessibilityLiveRegion="polite"
                      style={styles.mathNote}
                    >
                      {backupNotice}
                    </Text>
                  )}
                  {backupError && (
                    <Text accessibilityRole="alert" style={styles.errorText}>
                      {backupError}
                    </Text>
                  )}
                </View>
              )}
              {accessMode === "account" && (
                <View style={styles.scoreCard}>
                  <Text style={styles.name}>Account matching</Text>
                  <Text style={styles.scoreNote}>
                    This is a separate, reversible choice. When enabled and your
                    profile is Active, your chosen public profile can appear to
                    mutually eligible accounts whose approximate region text
                    exactly matches yours. Private preferences and one-sided
                    decisions are not shown.
                  </Text>
                  <Action
                    label={
                      directoryConsent?.participating
                        ? "Stop account matching"
                        : "Enable account matching"
                    }
                    secondary
                    disabled={
                      directoryConsent?.participating !== true &&
                      ((Boolean(emailVerification?.deliveryConfigured) &&
                        !emailVerification?.verifiedAt) ||
                        !profile.gender.trim() ||
                        !profile.genderGroups.length ||
                        !preferences.genderGroups.length)
                    }
                    onPress={() =>
                      void api
                        .updateDirectoryConsent(
                          !(directoryConsent?.participating === true),
                        )
                        .then(setDirectoryConsent)
                        .then(load)
                    }
                  />
                  <Text
                    accessibilityLiveRegion="polite"
                    style={styles.mathNote}
                  >
                    {directoryConsent?.participating &&
                    (!profile.gender.trim() ||
                      !profile.genderGroups.length ||
                      !preferences.genderGroups.length)
                      ? "Participation is recorded, but you are excluded from matching until you finish gender discovery in Profile and Preferences."
                      : !directoryConsent?.participating &&
                          (!profile.gender.trim() ||
                            !profile.genderGroups.length ||
                            !preferences.genderGroups.length)
                        ? "Finish gender discovery in Profile and Preferences before joining account matching."
                        : emailVerification?.deliveryConfigured &&
                            !emailVerification.verifiedAt
                          ? "Confirm your email before joining account matching."
                          : directoryConsent
                            ? (directoryConsent.participating
                                ? "Enabled"
                                : "Disabled") +
                              " under " +
                              directoryConsent.noticeVersion +
                              "."
                            : "Disabled. No account-matching consent has been recorded."}
                  </Text>
                </View>
              )}
              {accessMode === "account" && (
                <View style={styles.scoreCard}>
                  <Text style={styles.name}>Recovery codes</Text>
                  <Text style={styles.scoreNote}>
                    Recovery codes let you replace a forgotten passphrase
                    without email. Each code works once. Creating a new set
                    invalidates the old one. Store them outside this device,
                    ideally in a password manager. OpenMatch cannot restore lost
                    codes.
                  </Text>
                  {recoveryCodes.length ? (
                    <>
                      <Text
                        accessibilityLiveRegion="polite"
                        style={styles.setting}
                      >
                        Copy these now. They will not be shown again.
                      </Text>
                      {recoveryCodes.map((code) => (
                        <Text key={code} selectable style={styles.codeText}>
                          {code}
                        </Text>
                      ))}
                      <Action
                        label="Share or save codes"
                        secondary
                        onPress={() =>
                          void Share.share({
                            title: "OpenMatch recovery codes",
                            message: recoveryCodes.join("\n"),
                          })
                        }
                      />
                      <Action
                        label="I saved them—hide codes"
                        secondary
                        onPress={() => setRecoveryCodes([])}
                      />
                    </>
                  ) : (
                    <>
                      <Text style={styles.setting}>Current passphrase</Text>
                      <TextInput
                        accessibilityLabel="Passphrase for recovery codes"
                        autoCapitalize="none"
                        autoComplete="current-password"
                        secureTextEntry
                        value={recoveryPassword}
                        maxLength={128}
                        onChangeText={setRecoveryPassword}
                        style={styles.textField}
                      />
                      <Action
                        label="Create new recovery codes"
                        secondary
                        disabled={!recoveryPassword}
                        onPress={() => {
                          setRecoveryError(null);
                          setRecoveryNotice(null);
                          void api
                            .generateRecoveryCodes(recoveryPassword)
                            .then(({ codes, securityNotification }) => {
                              setRecoveryPassword("");
                              setRecoveryCodes(codes);
                              setRecoveryNotice(
                                "Every older recovery code is now invalid." +
                                  recordSecurityNotification(
                                    securityNotification,
                                  ),
                              );
                            })
                            .catch((error) =>
                              setRecoveryError(
                                error instanceof ApiError &&
                                  error.code === "invalid_current_password"
                                  ? "The current passphrase was not accepted."
                                  : "Recovery codes could not be created.",
                              ),
                            );
                        }}
                      />
                    </>
                  )}
                  {recoveryNotice && (
                    <Text
                      accessibilityLiveRegion="polite"
                      style={styles.mathNote}
                    >
                      {recoveryNotice}
                    </Text>
                  )}
                  {recoveryError && (
                    <Text accessibilityRole="alert" style={styles.errorText}>
                      {recoveryError}
                    </Text>
                  )}
                </View>
              )}
              {accessMode === "account" && (
                <View style={styles.scoreCard}>
                  <Text style={styles.name}>Change passphrase</Text>
                  <Text style={styles.scoreNote}>
                    Enter your current passphrase, then choose at least 15
                    characters. Spaces and password managers are welcome; there
                    are no symbol or periodic-change rules. A successful change
                    signs out every other session and securely replaces this
                    session.
                  </Text>
                  <Text style={styles.setting}>Current passphrase</Text>
                  <TextInput
                    accessibilityLabel="Current passphrase"
                    autoCapitalize="none"
                    autoComplete="current-password"
                    secureTextEntry
                    value={currentPassword}
                    maxLength={128}
                    onChangeText={setCurrentPassword}
                    style={styles.textField}
                  />
                  <Text style={styles.setting}>New passphrase</Text>
                  <TextInput
                    accessibilityLabel="New passphrase"
                    autoCapitalize="none"
                    autoComplete="new-password"
                    secureTextEntry
                    value={newPassword}
                    maxLength={128}
                    onChangeText={setNewPassword}
                    style={styles.textField}
                  />
                  <Text style={styles.setting}>Confirm new passphrase</Text>
                  <TextInput
                    accessibilityLabel="Confirm new passphrase"
                    autoCapitalize="none"
                    autoComplete="new-password"
                    secureTextEntry
                    value={confirmPassword}
                    maxLength={128}
                    onChangeText={setConfirmPassword}
                    style={styles.textField}
                  />
                  <Action
                    label="Change passphrase"
                    secondary
                    disabled={
                      !currentPassword ||
                      newPassword.length < 15 ||
                      confirmPassword.length < 15
                    }
                    onPress={() => {
                      setPasswordNotice(null);
                      setPasswordError(null);
                      if (newPassword !== confirmPassword) {
                        setPasswordError("The new passphrases do not match.");
                        return;
                      }
                      void api
                        .changePassword(currentPassword, newPassword)
                        .then(async (session) => {
                          try {
                            await persistSessionToken(session.token);
                            setAuthToken(session.token);
                            setCurrentPassword("");
                            setNewPassword("");
                            setConfirmPassword("");
                            setPasswordNotice(
                              "Passphrase changed. Every other session was signed out." +
                                recordSecurityNotification(
                                  session.securityNotification,
                                ),
                            );
                          } catch {
                            await api.signOut().catch(() => undefined);
                            setAuthToken(null);
                            setAccessMode("signed-out");
                            setPasswordError(
                              "The passphrase changed, but this device could not protect the new session. Sign in again.",
                            );
                          }
                        })
                        .catch((error) =>
                          setPasswordError(
                            error instanceof ApiError &&
                              error.code === "invalid_current_password"
                              ? "The current passphrase was not accepted."
                              : error instanceof ApiError &&
                                  error.code === "common_password"
                                ? "Choose a less common passphrase."
                                : error instanceof ApiError &&
                                    error.code === "password_unchanged"
                                  ? "Choose a passphrase different from the current one."
                                  : "The passphrase could not be changed.",
                          ),
                        );
                    }}
                  />
                  {passwordNotice && (
                    <Text
                      accessibilityLiveRegion="polite"
                      style={styles.mathNote}
                    >
                      {passwordNotice}
                    </Text>
                  )}
                  {passwordError && (
                    <Text accessibilityRole="alert" style={styles.errorText}>
                      {passwordError}
                    </Text>
                  )}
                </View>
              )}
              {accessMode === "account" && (
                <View style={styles.scoreCard}>
                  <Text style={styles.name}>Active sessions</Text>
                  <Text style={styles.scoreNote}>
                    See where your account is signed in and end sessions you no
                    longer recognize. OpenMatch stores only the broad client
                    type—not an IP address, device fingerprint, activity
                    history, or exact device model.
                  </Text>
                  {accountSessions.map((session) => {
                    const label = sessionClientLabel(session.client);
                    return (
                      <View style={styles.method} key={session.id}>
                        <View style={styles.methodText}>
                          <Text style={styles.name}>
                            {label}
                            {session.current ? " · This session" : ""}
                          </Text>
                          <Text style={styles.mathNote}>
                            Started{" "}
                            {new Date(session.createdAt).toLocaleString()}
                          </Text>
                          <Text style={styles.mathNote}>
                            Expires{" "}
                            {new Date(session.expiresAt).toLocaleDateString()}
                          </Text>
                          {!session.current && (
                            <Action
                              label="Sign out this session"
                              accessibilityLabel={`Revoke ${label} session started ${new Date(session.createdAt).toLocaleString()}`}
                              secondary
                              onPress={() =>
                                void api
                                  .revokeSession(session.id)
                                  .then(async () =>
                                    setAccountSessions(
                                      (await api.sessions()).items,
                                    ),
                                  )
                                  .catch(() =>
                                    setError(
                                      "That session could not be signed out.",
                                    ),
                                  )
                              }
                            />
                          )}
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}
              <View style={styles.scoreCard}>
                <Text style={styles.name}>Optional research</Text>
                <Text style={styles.scoreNote}>
                  Research participation is separate from using OpenMatch and
                  defaults off. No study is active in this prototype, and this
                  choice never changes your introductions.
                </Text>
                <Action
                  label={
                    researchConsent?.participating
                      ? "Withdraw research consent"
                      : "Opt in to future prototype research"
                  }
                  secondary
                  onPress={() =>
                    void api
                      .updateResearchConsent(
                        !(researchConsent?.participating === true),
                      )
                      .then(setResearchConsent)
                  }
                />
                <Text accessibilityLiveRegion="polite" style={styles.mathNote}>
                  {researchConsent
                    ? `${researchConsent.participating ? "Opted in" : "Opted out"} under ${researchConsent.noticeVersion}.`
                    : "Not enrolled. No research consent has been recorded."}
                </Text>
              </View>
              <View style={styles.scoreCard}>
                <Text style={styles.name}>Your safety reports</Text>
                <Text style={styles.scoreNote}>
                  Reports are private. You can append context, correct the
                  record, or request withdrawal without erasing the original.
                  This prototype has no staffed review operation, response-time
                  promise, or moderation decision to appeal.
                </Text>
                {reports.length ? (
                  reports.map((report) => (
                    <View style={styles.method} key={report.id}>
                      <View style={styles.methodText}>
                        <Text style={styles.name}>Report #{report.id}</Text>
                        <Text style={styles.scoreNote}>
                          {report.reason.replaceAll("_", " ")} · {report.status}
                        </Text>
                        <Text style={styles.mathNote}>
                          {new Date(report.createdAt).toLocaleString()}
                        </Text>
                        {report.updates.map((update) => (
                          <Text style={styles.mathNote} key={update.id}>
                            {update.kind.replaceAll("_", " ")} ·{" "}
                            {new Date(update.createdAt).toLocaleString()}:{" "}
                            {update.details}
                          </Text>
                        ))}
                        <Action
                          label="Add context or correction"
                          secondary
                          onPress={() => {
                            setReportUpdateId(report.id);
                            setReportUpdateDetails("");
                          }}
                        />
                        {reportUpdateId === report.id && (
                          <View style={styles.math}>
                            <Text style={styles.setting}>Update type</Text>
                            <ChoiceRows
                              value={reportUpdateKind}
                              options={[
                                ["additional_context", "Additional context"],
                                ["correction", "Correction"],
                                ["withdrawal_request", "Request withdrawal"],
                              ]}
                              onChange={setReportUpdateKind}
                            />
                            <Text style={styles.setting}>
                              What should be added to the record?
                            </Text>
                            <TextInput
                              accessibilityLabel="What should be added to the record?"
                              multiline
                              maxLength={2000}
                              style={styles.bioInput}
                              value={reportUpdateDetails}
                              onChangeText={setReportUpdateDetails}
                            />
                            <Text style={styles.mathNote}>
                              An update is append-only. A withdrawal request
                              records your request but does not silently delete
                              safety data.
                            </Text>
                            <Action
                              label="Add to report"
                              disabled={!reportUpdateDetails.trim()}
                              onPress={() =>
                                void api
                                  .addReportUpdate(
                                    report.id,
                                    reportUpdateKind,
                                    reportUpdateDetails,
                                  )
                                  .then(async () => {
                                    setReports((await api.reports()).items);
                                    setReportUpdateId(null);
                                    setReportUpdateDetails("");
                                    setSafetyNotice(
                                      `Update added to report #${report.id}.`,
                                    );
                                  })
                                  .catch((error) =>
                                    setError(
                                      operationLimitMessage(
                                        error,
                                        "The report update could not be added. Please retry.",
                                      ),
                                    ),
                                  )
                              }
                            />
                            <Action
                              label="Cancel"
                              secondary
                              onPress={() => setReportUpdateId(null)}
                            />
                          </View>
                        )}
                      </View>
                    </View>
                  ))
                ) : (
                  <Text style={styles.scoreNote}>No reports submitted.</Text>
                )}
              </View>
              <View style={styles.scoreCard}>
                <Text style={styles.name}>Private by default</Text>
                <Text style={styles.scoreNote}>
                  Precise location, legal name, contacts, activity time, and
                  decisions are never shown.
                </Text>
                {accessMode === "account" && (
                  <Text style={styles.mathNote}>
                    Active means your chosen public profile may be shown to
                    mutually eligible people whose approximate city or region
                    exactly matches yours. Paused or Hidden removes you from new
                    introductions. The prototype does not geocode or claim an
                    exact distance.
                  </Text>
                )}
                {accountStatus === "active" ? (
                  <>
                    <Action
                      label="Pause introductions"
                      secondary
                      onPress={() =>
                        void api
                          .updateAccountStatus("paused")
                          .then((result) => {
                            setAccountStatus(result.status);
                            setIntroductions([]);
                          })
                      }
                    />
                    <Action
                      label="Hide my profile"
                      secondary
                      onPress={() =>
                        void api
                          .updateAccountStatus("hidden")
                          .then((result) => {
                            setAccountStatus(result.status);
                            setIntroductions([]);
                          })
                      }
                    />
                  </>
                ) : (
                  <Action
                    label="Resume and show profile"
                    secondary
                    onPress={() =>
                      void api.updateAccountStatus("active").then(load)
                    }
                  />
                )}
                <Action
                  label="Export my data"
                  secondary
                  onPress={() =>
                    void api
                      .exportData()
                      .then((data) =>
                        Share.share({
                          title: "OpenMatch data export",
                          message: JSON.stringify(data, null, 2),
                        }),
                      )
                      .catch(() =>
                        setError("Data export could not be created."),
                      )
                  }
                />
                <Pressable
                  accessibilityRole="button"
                  onPress={() =>
                    Alert.alert(
                      "Delete local data?",
                      "This permanently clears the OpenMatch demo on this service.",
                      [
                        { text: "Cancel", style: "cancel" },
                        {
                          text: "Delete",
                          style: "destructive",
                          onPress: () =>
                            void api.deleteAccountData().then((receipt) => {
                              setDeletionReceipt(receipt);
                              return load();
                            }),
                        },
                      ],
                    )
                  }
                >
                  <Text style={styles.safetyLink}>Delete local data</Text>
                </Pressable>
                <Action
                  label={
                    accessMode === "account"
                      ? "Sign out"
                      : "Use a private account"
                  }
                  secondary
                  onPress={() =>
                    void api.signOut().finally(() => {
                      void clearSessionToken().catch(() => undefined);
                      void clearPendingMessageAttempts().catch(() => undefined);
                      setAuthToken(null);
                      setAccessMode("signed-out");
                      setConnections([]);
                      setMessages([]);
                      setIntroductions([]);
                      setSavedIntroductions([]);
                    })
                  }
                />
                {accessMode === "account" && (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() =>
                      Alert.alert(
                        "Delete account permanently?",
                        "This removes credentials, sessions, and all OpenMatch application data. It cannot be undone.",
                        [
                          { text: "Cancel", style: "cancel" },
                          {
                            text: "Delete account",
                            style: "destructive",
                            onPress: () =>
                              void api.deleteAccount().then(async () => {
                                await clearSessionToken().catch(
                                  () => undefined,
                                );
                                await clearPendingMessageAttempts().catch(
                                  () => undefined,
                                );
                                setAuthToken(null);
                                setAccessMode("signed-out");
                              }),
                          },
                        ],
                      )
                    }
                  >
                    <Text style={styles.safetyLink}>
                      Delete account permanently
                    </Text>
                  </Pressable>
                )}
              </View>
            </>
          )}
          {tab === "Method" && (
            <>
              <Text style={styles.eyebrow}>Public method</Text>
              <Text style={styles.title}>Understand every introduction.</Text>
              <Text style={styles.subtle}>
                The score orders eligible people. It does not predict love.
              </Text>
              {[
                [
                  "1",
                  "Boundaries first",
                  "Age, distance, intention, and lifestyle boundaries must work for both people.",
                ],
                [
                  "2",
                  "Two visible scores",
                  "Each person’s priorities create a score. Their harmonic mean makes one-sided fit visible.",
                ],
                [
                  "3",
                  "One public lottery place",
                  "A five-person batch reserves one place for a reproducible weekly lottery. The score never changes.",
                ],
                [
                  "4",
                  "Human judgment",
                  "Feedback may suggest an edit, but never changes preferences silently.",
                ],
              ].map(([n, h, p]) => (
                <View style={styles.method} key={n}>
                  <Text style={styles.methodNo}>{n}</Text>
                  <View style={styles.methodText}>
                    <Text style={styles.name}>{h}</Text>
                    <Text style={styles.scoreNote}>{p}</Text>
                  </View>
                </View>
              ))}
              <Text style={styles.version}>
                Algorithm {transparency?.matching ?? ALGORITHM_VERSION} · No
                hidden factors · Prototype
              </Text>
              {transparency?.deployedCommit ? (
                <Action
                  label={`Open deployed code ${transparency.deployedCommit.slice(0, 12)}`}
                  secondary
                  onPress={() =>
                    void Linking.openURL(
                      `https://github.com/jannis-cmd/openmatch/commit/${transparency.deployedCommit}`,
                    )
                  }
                />
              ) : (
                <Text style={styles.version}>
                  Deployed code: unpinned development build
                </Text>
              )}
              <MobileScoreCalculator />
              <View style={styles.scoreCard}>
                <Text style={styles.name}>Inspect the work</Text>
                <Text style={styles.scoreNote}>
                  The objective is useful introductions, not engagement.
                  Candidate-side personal weights may be private from another
                  user, but they are never hidden system factors.
                </Text>
                <Action
                  label="Open matching source code"
                  secondary
                  onPress={() =>
                    void Linking.openURL(
                      "https://github.com/jannis-cmd/openmatch/blob/main/packages/matching/src/index.ts",
                    )
                  }
                />
                <Action
                  label="Open evidence register"
                  secondary
                  onPress={() =>
                    void Linking.openURL(
                      "https://github.com/jannis-cmd/openmatch/blob/main/research/EVIDENCE_REGISTER.md",
                    )
                  }
                />
                <Action
                  label="Open algorithm decisions"
                  secondary
                  onPress={() =>
                    void Linking.openURL(
                      "https://github.com/jannis-cmd/openmatch/blob/main/docs/ALGORITHM_DECISIONS.md",
                    )
                  }
                />
                <Action
                  label="Open data inventory"
                  secondary
                  onPress={() =>
                    void Linking.openURL(
                      "https://github.com/jannis-cmd/openmatch/blob/main/docs/DATA_INVENTORY.json",
                    )
                  }
                />
                <Action
                  label="Open product boundaries"
                  secondary
                  onPress={() =>
                    void Linking.openURL(
                      "https://github.com/jannis-cmd/openmatch/blob/main/docs/PRODUCT_BOUNDARIES.json",
                    )
                  }
                />
              </View>
              <View style={styles.scoreCard}>
                <Text style={styles.name}>Known limits</Text>
                <Text style={styles.scoreNote}>
                  This prototype cannot predict attraction, love, relationship
                  success, or safety. Its small demo pool is not evidence of
                  fairness or effectiveness. Those claims require prospective
                  and independent evaluation.
                </Text>
                <Text style={styles.scoreNote}>
                  {accessMode === "account"
                    ? "This account has isolated application data, an expiring random session stored in device-secure storage, and a scrypt-protected passphrase. Completed active accounts can currently meet only when their self-entered approximate region text matches exactly; the service does not geocode or estimate distance. Passkeys, email-delivery monitoring, provider-backed recovery notifications, and an independent security review are still required before a real-person pilot."
                    : "The temporary bearer token only gates this shared local demo. It does not verify identity or isolate one person’s data from another client. Do not use this demo with real profiles."}
                </Text>
              </View>
              <View style={styles.scoreCard}>
                <Text style={styles.name}>Privacy and support</Text>
                <Text style={styles.scoreNote}>
                  Read what this prototype stores, why it stores it, how to use
                  account controls, and which support functions do not exist
                  yet.
                </Text>
                {webConfiguration.url ? (
                  <>
                    <Action
                      label="Open privacy notice"
                      secondary
                      onPress={() =>
                        void Linking.openURL(`${webConfiguration.url}/privacy`)
                      }
                    />
                    <Action
                      label="Open prototype support"
                      secondary
                      onPress={() =>
                        void Linking.openURL(`${webConfiguration.url}/support`)
                      }
                    />
                  </>
                ) : (
                  <Text style={styles.mathNote}>{webConfiguration.error}</Text>
                )}
              </View>
              <View style={styles.scoreCard}>
                <Text style={styles.name}>Safer dating</Text>
                <Text style={styles.scoreNote}>
                  No app can guarantee safety. Keep personal details private
                  until you trust someone. For a first meeting, choose a busy
                  public place, tell a trusted person your plans, control your
                  own transport, and leave if you feel uncomfortable.
                </Text>
                <Text style={styles.scoreNote}>
                  Never send money, gift cards, bank transfers, or
                  cryptocurrency to an online love interest. If someone asks,
                  stop contact and report them.
                </Text>
                <Text style={styles.scoreNote}>
                  If you are in immediate danger, contact your local emergency
                  services. OpenMatch cannot provide emergency help.
                </Text>
                <Action
                  label="Open RAINN safer-dating guidance"
                  secondary
                  onPress={() =>
                    void Linking.openURL(
                      "https://rainn.org/strategies-to-reduce-risk-increase-safety/tips-for-safer-dating-online-and-in-person/",
                    )
                  }
                />
                <Action
                  label="Open FTC romance-scam guidance"
                  secondary
                  onPress={() =>
                    void Linking.openURL(
                      "https://consumer.ftc.gov/articles/what-know-about-romance-scams",
                    )
                  }
                />
              </View>
              <View style={styles.scoreCard}>
                <Text style={styles.eyebrow}>Help without reporting here</Text>
                <Text style={styles.name}>
                  Independent support in Switzerland
                </Text>
                <Text style={styles.scoreNote}>
                  You do not need to file an OpenMatch report or tell us what
                  happened. OpenMatch cannot provide emergency help.
                </Text>
                <Action
                  label="Immediate danger · Police 117"
                  onPress={() => void Linking.openURL("tel:117")}
                />
                <Action
                  label="Medical emergency · 144"
                  onPress={() => void Linking.openURL("tel:144")}
                />
                <Action
                  label="Victim support · 142"
                  secondary
                  onPress={() => void Linking.openURL("tel:142")}
                />
                <Text style={styles.scoreNote}>
                  142 offers free, confidential and anonymous support. It is not
                  an emergency number.
                </Text>
                <Action
                  label="Open Victim Support Switzerland"
                  secondary
                  onPress={() =>
                    void Linking.openURL(
                      "https://www.opferhilfe-schweiz.ch/en/",
                    )
                  }
                />
                <Text style={styles.mathNote}>
                  These numbers are for Switzerland. Elsewhere, use local
                  emergency and victim-support services. Calling or opening
                  another site leaves OpenMatch and may appear in device,
                  phone-provider, or website records. OpenMatch sends no report
                  or profile data when you use these links.
                </Text>
              </View>
            </>
          )}
        </>
      </ScrollView>
      <View style={styles.tabs}>
        {(
          ["Today", "Connections", "Preferences", "Profile", "Method"] as Tab[]
        ).map((item) => (
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === item }}
            style={styles.tab}
            onPress={() => setTab(item)}
            key={item}
          >
            <Text
              maxFontSizeMultiplier={2}
              style={[styles.tabText, tab === item && styles.tabActive]}
            >
              {item}
            </Text>
          </Pressable>
        ))}
      </View>
    </SafeAreaView>
  );
}

function MobileAuthentication({
  api,
  onAuthenticated,
  tryDemo,
  notice,
}: {
  api: ReturnType<typeof createApiClient>;
  onAuthenticated: (
    token: string,
    notification?: SecurityNotificationStatus,
  ) => Promise<void>;
  tryDemo?: () => void;
  notice?: string | null;
}) {
  const [mode, setMode] = useState<"sign-in" | "create" | "recover">("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [recoveryCode, setRecoveryCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const submit = async () => {
    setSubmitting(true);
    setAuthError(null);
    try {
      const session =
        mode === "create"
          ? await api.createAccount(email, password)
          : mode === "recover"
            ? await api.recoverAccount(email, recoveryCode, password)
            : await api.signIn(email, password);
      try {
        await onAuthenticated(
          session.token,
          mode === "recover" && "securityNotification" in session
            ? (session.securityNotification as SecurityNotificationStatus)
            : undefined,
        );
      } catch {
        await api.signOut().catch(() => undefined);
        throw new ApiError(503, "secure_session_storage_unavailable");
      }
    } catch (error) {
      const code = error instanceof ApiError ? error.code : "";
      setAuthError(
        code === "account_exists"
          ? "An account already uses that email. Sign in instead."
          : code === "invalid_email"
            ? "Enter a valid email address."
            : code === "common_password"
              ? "Choose a less common passphrase."
              : code === "invalid_password"
                ? "Use a passphrase between 15 and 128 characters."
                : code === "secure_session_storage_unavailable"
                  ? "This device could not protect the session. No account session was kept."
                  : code === "invalid_recovery"
                    ? "The email or unused recovery code was not accepted."
                    : code === "password_unchanged"
                      ? "Choose a new passphrase different from the current one."
                      : "Email or passphrase was not accepted.",
      );
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.authPage}>
        <Text style={styles.brand}>OpenMatch</Text>
        <Text style={styles.eyebrow}>Private account</Text>
        <Text style={styles.title}>
          {mode === "create"
            ? "Create your account."
            : mode === "recover"
              ? "Recover your account."
              : "Welcome back."}
        </Text>
        <Text style={styles.subtle}>
          Your private data and conversations stay isolated. After setup, the
          public profile you choose can appear to mutually eligible active
          accounts in the same approximate region. OpenMatch stores a protected
          passphrase hash—not your passphrase.
        </Text>
        {notice && <Text style={styles.mathNote}>{notice}</Text>}
        <Text style={styles.setting}>Email</Text>
        <TextInput
          accessibilityLabel="Email"
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
          style={styles.textField}
        />
        {mode === "recover" && (
          <>
            <Text style={styles.setting}>Unused recovery code</Text>
            <TextInput
              accessibilityLabel="Unused recovery code"
              autoCapitalize="none"
              autoComplete="one-time-code"
              value={recoveryCode}
              onChangeText={setRecoveryCode}
              style={styles.textField}
            />
          </>
        )}
        <Text style={styles.setting}>
          {mode === "recover" ? "New passphrase" : "Passphrase"}
        </Text>
        <TextInput
          accessibilityLabel="Passphrase"
          autoCapitalize="none"
          autoComplete={
            mode === "create" || mode === "recover"
              ? "new-password"
              : "current-password"
          }
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          style={styles.textField}
        />
        {authError && (
          <Text accessibilityRole="alert" style={styles.errorText}>
            {authError}
          </Text>
        )}
        <Action
          label={
            submitting
              ? "Please wait…"
              : mode === "create"
                ? "Create account"
                : mode === "recover"
                  ? "Recover account"
                  : "Sign in"
          }
          disabled={
            submitting ||
            !email.trim() ||
            (mode === "create" || mode === "recover"
              ? password.length < 15
              : !password) ||
            (mode === "recover" && !recoveryCode.trim())
          }
          onPress={() => void submit()}
        />
        <Action
          label={mode === "recover" ? "Back to sign in" : "Use a recovery code"}
          secondary
          onPress={() => {
            setAuthError(null);
            setRecoveryCode("");
            setMode(mode === "recover" ? "sign-in" : "recover");
          }}
        />
        <Action
          label={
            mode === "create"
              ? "I already have an account"
              : "Create an account"
          }
          secondary
          onPress={() => {
            setAuthError(null);
            setMode(mode === "create" ? "sign-in" : "create");
          }}
        />
        {tryDemo && (
          <Action label="Use local demo" secondary onPress={tryDemo} />
        )}
        <Text style={styles.mathNote}>
          Account sessions currently last up to 12 hours. Recovery codes are
          one-time secrets, not email verification or identity proofing. Do not
          use a valuable password in this prototype.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function PreferencesScreen({
  value,
  onChange,
  suggestions,
  observationCount = 0,
  clearObservations = () => undefined,
  delivery,
  setBatchSize,
}: {
  value: Preferences;
  onChange: (value: Preferences) => void;
  suggestions?: WeightSuggestion[];
  observationCount?: number;
  clearObservations?: () => void;
  delivery?: DeliverySettings;
  setBatchSize?: (batchSize: DeliverySettings["batchSize"]) => void;
}) {
  const bump = (key: keyof Preferences["weights"], delta: -1 | 1) => {
    const current = nearestPriority(value.weights[key]);
    const index = PRIORITY_LEVELS.indexOf(current);
    const next =
      PRIORITY_LEVELS[
        Math.max(0, Math.min(PRIORITY_LEVELS.length - 1, index + delta))
      ];
    onChange({ ...value, weights: { ...value.weights, [key]: next } });
  };
  return (
    <>
      <Text style={styles.eyebrow}>Preferences</Text>
      <Text style={styles.title}>What matters to you</Text>
      <Text style={styles.subtle}>
        Boundaries filter. Priorities order. Every change is yours.
      </Text>
      {delivery && setBatchSize && (
        <View style={styles.scoreCard}>
          <Text style={styles.name}>Finite batch size</Text>
          <Text style={styles.scoreNote}>
            Choose up to how many mutually eligible people appear at once. One
            to five is a product hypothesis, not a scientifically optimal
            number.
          </Text>
          <View style={styles.adjust}>
            {([1, 2, 3, 4, 5] as const).map((size) => (
              <Pressable
                key={size}
                accessibilityRole="button"
                accessibilityState={{ selected: delivery.batchSize === size }}
                accessibilityLabel={`${size} introductions per batch`}
                style={[
                  styles.smallButton,
                  delivery.batchSize === size && styles.selectedButton,
                ]}
                onPress={() => setBatchSize(size)}
              >
                <Text>{size}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.mathNote}>
            Saved profiles are separate. Pause introductions from Profile.
          </Text>
        </View>
      )}
      <View style={styles.scoreCard}>
        <Text style={styles.name}>Mutual boundaries</Text>
        <Text style={styles.setting}>
          Youngest age <Text style={styles.settingValue}>{value.ageMin}</Text>
        </Text>
        <View style={styles.adjust}>
          <Action
            label="−"
            accessibilityLabel="Lower youngest age"
            secondary
            onPress={() =>
              onChange({ ...value, ageMin: Math.max(18, value.ageMin - 1) })
            }
          />
          <Action
            label="+"
            accessibilityLabel="Raise youngest age"
            secondary
            onPress={() =>
              onChange({
                ...value,
                ageMin: Math.min(value.ageMax, value.ageMin + 1),
              })
            }
          />
        </View>
        <Text style={styles.setting}>
          Oldest age <Text style={styles.settingValue}>{value.ageMax}</Text>
        </Text>
        <View style={styles.adjust}>
          <Action
            label="−"
            accessibilityLabel="Lower oldest age"
            secondary
            onPress={() =>
              onChange({
                ...value,
                ageMax: Math.max(value.ageMin, value.ageMax - 1),
              })
            }
          />
          <Action
            label="+"
            accessibilityLabel="Raise oldest age"
            secondary
            onPress={() =>
              onChange({ ...value, ageMax: Math.min(120, value.ageMax + 1) })
            }
          />
        </View>
        <Text style={styles.setting}>People you are open to meeting</Text>
        {GENDER_DISCOVERY_GROUPS.map((group) => {
          const checked = value.genderGroups.includes(group);
          return (
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked }}
              style={styles.radioRow}
              onPress={() =>
                onChange({
                  ...value,
                  genderGroups: checked
                    ? value.genderGroups.filter((item) => item !== group)
                    : [...value.genderGroups, group],
                })
              }
              key={group}
            >
              <Text style={styles.radioMark}>{checked ? "☑" : "☐"}</Text>
              <Text style={styles.radioLabel}>{genderGroupLabel(group)}</Text>
            </Pressable>
          );
        })}
        <Text style={styles.mathNote}>
          Private boundary. An introduction appears only when both people’s
          discovery choices include one another.
        </Text>
        <Text style={styles.setting}>
          Relationship intentions you are open to
        </Text>
        {(
          [
            "Long-term relationship",
            "Long-term, open to short",
            "Still figuring it out",
          ] as Profile["intent"][]
        ).map((intent) => {
          const checked = value.intents.includes(intent);
          return (
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked }}
              style={styles.radioRow}
              onPress={() => {
                const next = checked
                  ? value.intents.filter((item) => item !== intent)
                  : [...value.intents, intent];
                if (next.length) onChange({ ...value, intents: next });
              }}
              key={intent}
            >
              <Text style={styles.radioMark}>{checked ? "☑" : "☐"}</Text>
              <Text style={styles.radioLabel}>{intent}</Text>
            </Pressable>
          );
        })}
        <Text style={styles.setting}>Smoking boundary</Text>
        <ChoiceRows
          value={value.smoking}
          options={[
            ["no", "Non-smoking only"],
            ["any", "No boundary"],
          ]}
          onChange={(smoking) => onChange({ ...value, smoking })}
        />
        <Text style={styles.setting}>Children boundary</Text>
        <ChoiceRows
          value={value.children}
          options={[
            ["want", "Wants children"],
            ["open", "Open to children"],
            ["do not want", "Does not want children"],
            ["any", "No boundary"],
          ]}
          onChange={(children) => onChange({ ...value, children })}
        />
        <Text style={styles.mathNote}>
          A person is introduced only when both people’s stated boundaries are
          satisfied.
        </Text>
      </View>
      <View style={styles.scoreCard}>
        <Text style={styles.name}>Distance</Text>
        <Text style={styles.setting}>
          Ideal{" "}
          <Text style={styles.settingValue}>{value.idealDistanceKm} km</Text>
        </Text>
        <View style={styles.adjust}>
          <Action
            label="−"
            accessibilityLabel="Lower ideal distance"
            secondary
            onPress={() =>
              onChange({
                ...value,
                idealDistanceKm: Math.max(1, value.idealDistanceKm - 5),
              })
            }
          />
          <Action
            label="+"
            accessibilityLabel="Raise ideal distance"
            secondary
            onPress={() =>
              onChange({
                ...value,
                idealDistanceKm: Math.min(
                  value.maximumDistanceKm,
                  value.idealDistanceKm + 5,
                ),
              })
            }
          />
        </View>
        <Text style={styles.setting}>
          Maximum{" "}
          <Text style={styles.settingValue}>{value.maximumDistanceKm} km</Text>
        </Text>
        <View style={styles.adjust}>
          <Action
            label="−"
            accessibilityLabel="Lower maximum distance"
            secondary
            onPress={() =>
              onChange({
                ...value,
                maximumDistanceKm: Math.max(
                  value.idealDistanceKm,
                  value.maximumDistanceKm - 5,
                ),
              })
            }
          />
          <Action
            label="+"
            accessibilityLabel="Raise maximum distance"
            secondary
            onPress={() =>
              onChange({
                ...value,
                maximumDistanceKm: Math.min(100, value.maximumDistanceKm + 5),
              })
            }
          />
        </View>
      </View>
      {suggestions && (
        <View style={styles.scoreCard}>
          <Text style={styles.name}>Preference suggestions</Text>
          {suggestions.length === 0 ? (
            <Text style={styles.scoreNote}>
              Nothing suggested yet. The learner waits for at least 20 explicit
              decisions, including five Interested and five Pass choices.
            </Text>
          ) : (
            suggestions.map((suggestion) => (
              <View style={styles.weightRow} key={suggestion.factorId}>
                <View style={styles.methodText}>
                  <Text style={styles.capitalize}>{suggestion.factorId}</Text>
                  <Text style={styles.scoreNote}>
                    {priorityLabel(suggestion.currentWeight)} →{" "}
                    {priorityLabel(suggestion.suggestedWeight)} ·{" "}
                    {suggestion.sampleSize} decisions · {suggestion.confidence}
                  </Text>
                  <Text style={styles.mathNote}>{suggestion.caveat}</Text>
                  <Action
                    label="Accept suggestion"
                    secondary
                    onPress={() =>
                      onChange({
                        ...value,
                        weights: {
                          ...value.weights,
                          [suggestion.factorId]: nearestPriority(
                            suggestion.suggestedWeight,
                          ),
                        },
                      })
                    }
                  />
                </View>
              </View>
            ))
          )}
          <Text
            style={styles.mathNote}
            accessibilityLabel={`${observationCount} decision ${observationCount === 1 ? "example is" : "examples are"} currently stored for preference suggestions`}
          >
            Decisions only. Messages, dwell time, taps, and photos are never
            learning inputs. Nothing changes automatically. {observationCount}{" "}
            decision {observationCount === 1 ? "example is" : "examples are"}{" "}
            currently stored for this purpose.
          </Text>
          <Action
            label="Clear learning examples"
            secondary
            disabled={observationCount === 0}
            onPress={clearObservations}
          />
        </View>
      )}
      <View style={styles.scoreCard}>
        <Text style={styles.name}>Order eligible people</Text>
        {Object.entries(value.weights).map(([key, weight]) => (
          <View style={styles.weightRow} key={key}>
            <View>
              <Text style={styles.capitalize}>{key}</Text>
              <Text style={styles.settingValue}>{priorityLabel(weight)}</Text>
            </View>
            <View style={styles.adjustSmall}>
              <Pressable
                accessibilityLabel={`Lower ${key} priority`}
                style={styles.smallButton}
                onPress={() => bump(key as keyof Preferences["weights"], -1)}
              >
                <Text>−</Text>
              </Pressable>
              <Pressable
                accessibilityLabel={`Raise ${key} priority`}
                style={styles.smallButton}
                onPress={() => bump(key as keyof Preferences["weights"], 1)}
              >
                <Text>+</Text>
              </Pressable>
            </View>
          </View>
        ))}
        <Text style={styles.mathNote}>
          Off, Low, Medium, or High—relative priorities, not judgments of
          anyone’s worth.
        </Text>
      </View>
    </>
  );
}

function MobileScoreCalculator() {
  const [yourFit, setYourFit] = useState(80);
  const [theirFit, setTheirFit] = useState(60);
  const [boundaryWorks, setBoundaryWorks] = useState(true);
  const explanation = explainMatch({
    boundaries: [
      {
        id: "synthetic-boundary",
        label: "Synthetic mutual boundary",
        satisfiedForA: boundaryWorks,
        satisfiedForB: boundaryWorks,
      },
    ],
    factors: [
      {
        id: "synthetic-fit",
        label: "Synthetic fit",
        compatibilityA: yourFit / 100,
        compatibilityB: theirFit / 100,
        weightA: 1,
        weightB: 1,
      },
    ],
  });
  const reciprocal = Math.round(explanation.reciprocalFit * 100);
  const final = Math.round(explanation.finalScore * 100);
  const adjust = (value: number, change: number) =>
    Math.max(0, Math.min(100, value + change));

  return (
    <View style={styles.scoreCard}>
      <Text style={styles.eyebrow}>Try it locally</Text>
      <Text style={styles.name}>Reciprocal score calculator</Text>
      <Text style={styles.scoreNote}>
        Synthetic values only. Nothing is sent to the server.
      </Text>
      <Text style={styles.setting}>Your directed fit: {yourFit}%</Text>
      <View style={styles.adjust}>
        <Action
          label="− 10"
          accessibilityLabel="Lower your directed fit"
          secondary
          onPress={() => setYourFit(adjust(yourFit, -10))}
        />
        <Action
          label="+ 10"
          accessibilityLabel="Raise your directed fit"
          secondary
          onPress={() => setYourFit(adjust(yourFit, 10))}
        />
      </View>
      <Text style={styles.setting}>Their directed fit: {theirFit}%</Text>
      <View style={styles.adjust}>
        <Action
          label="− 10"
          accessibilityLabel="Lower their directed fit"
          secondary
          onPress={() => setTheirFit(adjust(theirFit, -10))}
        />
        <Action
          label="+ 10"
          accessibilityLabel="Raise their directed fit"
          secondary
          onPress={() => setTheirFit(adjust(theirFit, 10))}
        />
      </View>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: boundaryWorks }}
        style={styles.radioRow}
        onPress={() => setBoundaryWorks(!boundaryWorks)}
      >
        <Text style={styles.radioMark}>{boundaryWorks ? "☑" : "☐"}</Text>
        <Text style={styles.radioLabel}>Mutual boundaries are satisfied</Text>
      </Pressable>
      <Text style={styles.name}>Reciprocal fit: {reciprocal}%</Text>
      <Text accessibilityLiveRegion="polite" style={styles.name}>
        Final score: {final}%
      </Text>
      <Text style={styles.mathNote}>
        {yourFit + theirFit === 0
          ? "When both directed fits are 0, reciprocal fit is defined as 0."
          : `Harmonic mean: 2 × ${yourFit} × ${theirFit} ÷ (${yourFit} + ${theirFit}) = ${reciprocal}.`}{" "}
        {!boundaryWorks && "A failed boundary makes the final score 0."}
      </Text>
    </View>
  );
}

function MobileReportForm({
  name,
  cancel,
  submit,
}: {
  name: string;
  cancel: () => void;
  submit: (reason: ReportReason, details: string) => Promise<void>;
}) {
  const [reason, setReason] = useState<ReportReason>("harassment");
  const [details, setDetails] = useState("");
  const [submitting, setSubmitting] = useState(false);
  return (
    <View style={styles.reportForm}>
      <Text style={styles.name}>Report {name}</Text>
      <Text style={styles.scoreNote}>
        Your report is not shown to this person. Choose the closest reason and
        add only useful context.
      </Text>
      <Text style={styles.setting}>Reason</Text>
      <ChoiceRows
        value={reason}
        options={[
          ["harassment", "Harassment"],
          ["scam", "Scam"],
          ["impersonation", "Impersonation"],
          ["offline_safety", "Offline safety"],
          ["other", "Other"],
        ]}
        onChange={setReason}
      />
      <Text style={styles.setting}>Details · optional</Text>
      <TextInput
        accessibilityLabel="Report details optional"
        value={details}
        onChangeText={setDetails}
        maxLength={2000}
        multiline
        style={styles.messageInput}
      />
      <View style={styles.actions}>
        <Action label="Cancel" secondary onPress={cancel} />
        <Action
          label={submitting ? "Sending…" : "Submit report"}
          disabled={submitting}
          onPress={() => {
            setSubmitting(true);
            void submit(reason, details.trim()).finally(() =>
              setSubmitting(false),
            );
          }}
        />
      </View>
    </View>
  );
}

function MatchingProfileFields({
  value,
  onChange,
}: {
  value: Profile;
  onChange: (value: Profile) => void;
}) {
  const [valuesText, setValuesText] = useState(value.values.join(", "));
  return (
    <View>
      <Text style={styles.setting}>Profile prompt</Text>
      <TextInput
        accessibilityLabel="Profile prompt"
        value={value.prompt}
        maxLength={100}
        onChangeText={(prompt) => onChange({ ...value, prompt })}
        style={styles.textField}
      />
      <Text style={styles.setting}>Your answer</Text>
      <TextInput
        accessibilityLabel="Profile prompt answer"
        multiline
        value={value.promptAnswer}
        maxLength={500}
        onChangeText={(promptAnswer) => onChange({ ...value, promptAnswer })}
        style={styles.bioInput}
      />
      <Text style={styles.setting}>Values · 1–5, separated by commas</Text>
      <TextInput
        accessibilityLabel="Profile values separated by commas"
        value={valuesText}
        maxLength={210}
        onChangeText={(text) => {
          setValuesText(text);
          onChange({
            ...value,
            values: text
              .split(",")
              .map((item) => item.trim())
              .filter(Boolean)
              .slice(0, 5),
          });
        }}
        style={styles.textField}
      />
      <Text style={styles.setting}>Smoking</Text>
      <ChoiceRows
        value={value.lifestyle.smoking}
        options={[
          ["no", "Do not smoke"],
          ["sometimes", "Smoke sometimes"],
        ]}
        onChange={(smoking) =>
          onChange({
            ...value,
            lifestyle: { ...value.lifestyle, smoking },
          })
        }
      />
      <Text style={styles.setting}>Children</Text>
      <ChoiceRows
        value={value.lifestyle.children}
        options={[
          ["want", "Want children"],
          ["open", "Open to children"],
          ["do not want", "Do not want children"],
        ]}
        onChange={(children) =>
          onChange({
            ...value,
            lifestyle: { ...value.lifestyle, children },
          })
        }
      />
      <Text style={styles.setting}>Typical schedule</Text>
      <ChoiceRows
        value={value.lifestyle.schedule}
        options={[
          ["early", "Usually early"],
          ["flexible", "Flexible"],
          ["late", "Usually late"],
        ]}
        onChange={(schedule) =>
          onChange({
            ...value,
            lifestyle: { ...value.lifestyle, schedule },
          })
        }
      />
      <Text style={styles.mathNote}>
        These are matching inputs. They are never inferred from your behavior,
        and every change takes effect when you save.
      </Text>
    </View>
  );
}

function IntentSelector({
  value,
  onChange,
}: {
  value: Profile["intent"];
  onChange: (value: Profile["intent"]) => void;
}) {
  const options: Profile["intent"][] = [
    "Long-term relationship",
    "Long-term, open to short",
    "Still figuring it out",
  ];
  return (
    <View>
      <Text style={styles.setting}>Relationship intention</Text>
      {options.map((option) => (
        <Pressable
          accessibilityRole="radio"
          accessibilityState={{ checked: value === option }}
          style={styles.radioRow}
          onPress={() => onChange(option)}
          key={option}
        >
          <Text style={styles.radioMark}>{value === option ? "●" : "○"}</Text>
          <Text style={styles.radioLabel}>{option}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function ReadinessSelector({
  value,
  onChange,
}: {
  value: Profile["readiness"];
  onChange: (value: Profile["readiness"]) => void;
}) {
  return (
    <View>
      <Text style={styles.setting}>Meeting readiness</Text>
      <ChoiceRows
        value={value}
        options={[
          ["Prefer to chat first", "Prefer to chat first"],
          ["Ready to meet in person", "Ready to meet in person"],
        ]}
        onChange={onChange}
      />
    </View>
  );
}

const genderGroupLabel = (group: GenderDiscoveryGroup) =>
  ({
    women: "Women",
    men: "Men",
    nonbinary_people: "Nonbinary people",
  })[group];

function GenderDiscoveryFields({
  value,
  onChange,
}: {
  value: Profile;
  onChange: (value: Profile) => void;
}) {
  return (
    <View>
      <Text style={styles.setting}>How you describe your gender</Text>
      <TextInput
        accessibilityLabel="How you describe your gender"
        value={value.gender}
        maxLength={50}
        placeholder="For example: woman, man, nonbinary, agender"
        onChangeText={(gender) => onChange({ ...value, gender })}
        style={styles.textField}
      />
      <Text style={styles.setting}>Your discovery groups</Text>
      {GENDER_DISCOVERY_GROUPS.map((group) => {
        const checked = value.genderGroups.includes(group);
        return (
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked }}
            style={styles.radioRow}
            onPress={() =>
              onChange({
                ...value,
                genderGroups: checked
                  ? value.genderGroups.filter((item) => item !== group)
                  : [...value.genderGroups, group],
              })
            }
            key={group}
          >
            <Text style={styles.radioMark}>{checked ? "☑" : "☐"}</Text>
            <Text style={styles.radioLabel}>
              Include me in discovery for{" "}
              {genderGroupLabel(group).toLowerCase()}
            </Text>
          </Pressable>
        );
      })}
      <Text style={styles.mathNote}>
        Your description is public to eligible people. Your selected routing
        groups stay private. Groups may overlap and are not a complete
        definition of identity. OpenMatch never infers them.
      </Text>
    </View>
  );
}

function ChoiceRows<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: Array<readonly [T, string]>;
  onChange: (value: T) => void;
}) {
  return (
    <View>
      {options.map(([option, label]) => (
        <Pressable
          accessibilityRole="radio"
          accessibilityState={{ checked: value === option }}
          style={styles.radioRow}
          onPress={() => onChange(option)}
          key={option}
        >
          <Text style={styles.radioMark}>{value === option ? "●" : "○"}</Text>
          <Text style={styles.radioLabel}>{label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function Action({
  label,
  onPress,
  secondary = false,
  disabled = false,
  selected,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  secondary?: boolean;
  disabled?: boolean;
  selected?: boolean;
  accessibilityLabel?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled, selected }}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.button,
        secondary && styles.buttonSecondary,
        disabled && styles.buttonDisabled,
      ]}
    >
      <Text
        style={[styles.buttonText, secondary && styles.buttonTextSecondary]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#F5F5F1" },
  authPage: { padding: 24, gap: 14, justifyContent: "center", flexGrow: 1 },
  errorText: { color: "#8A2727", lineHeight: 21 },
  codeText: {
    color: "#294536",
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace" }),
    fontSize: 13,
    lineHeight: 22,
  },
  header: {
    minHeight: 58,
    paddingVertical: 10,
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    borderColor: "#DFDFD8",
  },
  brand: { fontSize: 19, fontWeight: "700", letterSpacing: -0.6 },
  nonprofit: { marginLeft: "auto", fontSize: 11, color: "#757970" },
  page: { padding: 20, paddingBottom: 110, gap: 12 },
  eyebrow: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: "#39715A",
    marginTop: 10,
  },
  title: {
    fontSize: 40,
    fontWeight: "700",
    letterSpacing: -1.8,
    lineHeight: 43,
  },
  subtle: { fontSize: 16, lineHeight: 23, color: "#686C64", marginBottom: 12 },
  card: {
    backgroundColor: "#FFF",
    borderRadius: 24,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#E2E2DC",
  },
  portrait: { height: 300, alignItems: "center", justifyContent: "center" },
  initial: { fontSize: 110, fontWeight: "700", color: "rgba(255,255,255,.7)" },
  distance: {
    position: "absolute",
    left: 16,
    bottom: 16,
    backgroundColor: "rgba(255,255,255,.9)",
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 20,
    fontSize: 12,
  },
  cardBody: { padding: 23 },
  name: { fontSize: 24, fontWeight: "700", letterSpacing: -0.7 },
  meta: { color: "#74786F", marginTop: 3 },
  intent: { color: "#5B665E", marginTop: 10, marginBottom: 16 },
  bio: { fontSize: 17, lineHeight: 25 },
  bioInput: {
    fontSize: 17,
    lineHeight: 25,
    minHeight: 110,
    textAlignVertical: "top",
    borderWidth: 1,
    borderColor: "#CED1CA",
    borderRadius: 12,
    padding: 12,
    backgroundColor: "#FAFAF7",
  },
  textField: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: "#CED1CA",
    borderRadius: 12,
    paddingHorizontal: 12,
    backgroundColor: "#FAFAF7",
    fontSize: 16,
  },
  radioRow: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderBottomWidth: 1,
    borderColor: "#ECECE7",
  },
  radioMark: { width: 22, color: "#286249", fontSize: 18 },
  radioLabel: { flex: 1, color: "#32352F" },
  prompt: {
    marginTop: 22,
    paddingTop: 18,
    borderTopWidth: 1,
    borderColor: "#ECECE7",
  },
  promptLabel: {
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    color: "#777B73",
  },
  promptAnswer: { fontSize: 17, lineHeight: 24, marginTop: 7 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 18 },
  chip: {
    fontSize: 12,
    color: "#395144",
    backgroundColor: "#F0F2ED",
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 20,
  },
  scoreCard: {
    backgroundColor: "#FFF",
    borderRadius: 22,
    padding: 22,
    borderWidth: 1,
    borderColor: "#E2E2DC",
    marginTop: 6,
  },
  deletionReceipt: {
    backgroundColor: "#EAF4ED",
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: "#B8D2C0",
  },
  deletionReceiptTitle: {
    color: "#234A34",
    fontSize: 17,
    fontWeight: "700",
    marginBottom: 5,
  },
  explorationNote: {
    backgroundColor: "#F1F5F1",
    borderRadius: 12,
    padding: 13,
    borderWidth: 1,
    borderColor: "#CBD5CD",
    marginTop: 10,
  },
  explorationTitle: {
    color: "#294536",
    fontWeight: "700",
    marginBottom: 4,
  },
  score: {
    fontSize: 60,
    fontWeight: "700",
    letterSpacing: -3,
    marginVertical: 8,
  },
  scoreNote: { color: "#646860", fontSize: 15, lineHeight: 22 },
  reason: { paddingTop: 11, fontSize: 15, color: "#334A3E" },
  link: { color: "#286249", fontWeight: "600", paddingTop: 20 },
  math: {
    backgroundColor: "#F4F5F1",
    padding: 12,
    borderRadius: 12,
    marginTop: 12,
  },
  mathRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 5,
  },
  mathValue: { fontWeight: "600", fontSize: 12 },
  mathNote: { fontSize: 11, color: "#757970", lineHeight: 16, marginTop: 8 },
  actions: { flexDirection: "row", gap: 10, marginTop: 8 },
  button: {
    flex: 1,
    backgroundColor: "#173F32",
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 28,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#173F32",
    marginTop: 12,
  },
  buttonSecondary: { backgroundColor: "#FFF", borderColor: "#CED1CA" },
  buttonDisabled: { opacity: 0.45 },
  buttonText: { color: "#FFF", fontWeight: "700" },
  buttonTextSecondary: { color: "#32352F" },
  private: { fontSize: 11, color: "#858981", textAlign: "center" },
  empty: { alignItems: "center", gap: 16, paddingVertical: 90 },
  check: {
    fontSize: 24,
    color: "#286249",
    backgroundColor: "#DFEAE3",
    width: 58,
    height: 58,
    textAlign: "center",
    paddingTop: 13,
    borderRadius: 30,
  },
  tabs: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    minHeight: 68,
    backgroundColor: "#FAFAF7",
    borderTopWidth: 1,
    borderColor: "#DDD",
    flexDirection: "row",
    paddingVertical: 8,
  },
  tab: { flex: 1, alignItems: "center", justifyContent: "center" },
  tabText: { fontSize: 9.5, color: "#777B73" },
  tabActive: { color: "#24513E", fontWeight: "700" },
  setting: { fontSize: 16, marginTop: 22 },
  settingValue: { color: "#39715A", fontWeight: "700" },
  adjust: { flexDirection: "row", gap: 8, marginTop: 10 },
  weightRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 17,
    borderBottomWidth: 1,
    borderColor: "#ECECE7",
  },
  capitalize: { fontSize: 16, textTransform: "capitalize" },
  adjustSmall: { flexDirection: "row", gap: 8 },
  smallButton: {
    width: 42,
    height: 38,
    borderWidth: 1,
    borderColor: "#CED1CA",
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFF",
  },
  selectedButton: {
    backgroundColor: "#CFE5D8",
    borderColor: "#39715A",
  },
  method: {
    flexDirection: "row",
    gap: 14,
    borderTopWidth: 1,
    borderColor: "#DADCD5",
    paddingVertical: 22,
  },
  methodNo: { color: "#39715A", fontWeight: "700", fontSize: 16 },
  methodText: { flex: 1, gap: 4 },
  version: {
    fontFamily: "monospace",
    fontSize: 11,
    color: "#365043",
    backgroundColor: "#E7EBE5",
    padding: 15,
    borderRadius: 12,
  },
  connectionPicker: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 18,
    marginBottom: 6,
  },
  connectionChoice: {
    minHeight: 44,
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#CED1CA",
    borderRadius: 24,
    backgroundColor: "#FFF",
    paddingHorizontal: 16,
  },
  connectionChoiceSelected: {
    borderColor: "#39715A",
    backgroundColor: "#DFEAE3",
  },
  connectionChoiceText: { color: "#555B55" },
  connectionChoiceTextSelected: { color: "#24513E", fontWeight: "700" },
  mobileBubble: {
    padding: 12,
    borderRadius: 16,
    marginBottom: 12,
    maxWidth: "85%",
    gap: 3,
  },
  mobileBubbleSent: {
    alignSelf: "flex-end",
    backgroundColor: "#DFEAE3",
    borderBottomRightRadius: 4,
  },
  mobileBubbleReceived: {
    alignSelf: "flex-start",
    backgroundColor: "#F1F1ED",
    borderBottomLeftRadius: 4,
  },
  mobileBubbleAuthor: {
    color: "#62675F",
    fontSize: 12,
    fontWeight: "700",
  },
  safetyLink: { color: "#8A4040", textAlign: "center", paddingTop: 20 },
  safetyNotice: {
    marginTop: 10,
    padding: 12,
    borderRadius: 12,
    backgroundColor: "#E7EEE8",
    color: "#294536",
    textAlign: "center",
  },
  introductionSafety: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 24,
    paddingBottom: 8,
  },
  reportForm: {
    marginTop: 12,
    padding: 18,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#DED8D2",
    backgroundColor: "#F8F6F2",
  },
  messageInput: {
    minHeight: 88,
    marginTop: 14,
    padding: 13,
    textAlignVertical: "top",
    borderWidth: 1,
    borderColor: "#CED1CA",
    borderRadius: 14,
    backgroundColor: "#FAFAF7",
    fontSize: 16,
  },
  statusBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 15,
    borderWidth: 1,
    borderColor: "#CBD5CD",
    borderRadius: 16,
    backgroundColor: "#E7EEE8",
  },
  statusCopy: { flex: 2 },
  statusTitle: { color: "#294536", fontWeight: "700", fontSize: 15 },
  consentTitle: { marginTop: 24, marginBottom: 8, fontWeight: "700" },
  consentRow: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    paddingVertical: 9,
  },
  consentCopy: { flex: 1, color: "#4F554F", lineHeight: 21 },
});
