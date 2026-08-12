import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  AppState,
  Linking,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  createApiClient,
  type AccountStatus,
  type Connection,
  type DeliverySettings,
  type Message,
  type ReportRecord,
  type ReportReason,
  type ResearchConsentReceipt,
  type TransparencyVersion,
} from "@openmatch/api-client";
import {
  ALGORITHM_VERSION,
  defaultPreferences,
  demoUser,
  explainMatch,
  nearestPriority,
  PRIORITY_LEVELS,
  priorityLabel,
  type Introduction,
  type Preferences,
  type Profile,
  type WeightSuggestion,
} from "@openmatch/matching";

type Tab = "Today" | "Connections" | "Preferences" | "Profile" | "Method";

export default function App() {
  const api = useMemo(
    () =>
      createApiClient(
        process.env.EXPO_PUBLIC_OPENMATCH_API_URL ?? "http://127.0.0.1:4000",
      ),
    [],
  );
  const [tab, setTab] = useState<Tab>("Today");
  const [preferences, setPreferences] = useState<Preferences>(
    structuredClone(defaultPreferences),
  );
  const [profile, setProfile] = useState<Profile>(demoUser);
  const [introductions, setIntroductions] = useState<Introduction[]>([]);
  const [savedIntroductions, setSavedIntroductions] = useState<Introduction[]>(
    [],
  );
  const [showSaved, setShowSaved] = useState(false);
  const [showMath, setShowMath] = useState(false);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [bio, setBio] = useState(demoUser.bio);
  const [editingProfile, setEditingProfile] = useState(false);
  const [safetyNotice, setSafetyNotice] = useState<string | null>(null);
  const [reports, setReports] = useState<ReportRecord[]>([]);
  const [researchConsent, setResearchConsent] =
    useState<ResearchConsentReceipt | null>(null);
  const [loading, setLoading] = useState(true);
  const [onboarded, setOnboarded] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<WeightSuggestion[]>([]);
  const [accountStatus, setAccountStatus] = useState<AccountStatus>("active");
  const [delivery, setDelivery] = useState<DeliverySettings>({ batchSize: 5 });
  const [draft, setDraft] = useState("");
  const [adultConfirmed, setAdultConfirmed] = useState(false);
  const [dataUseAccepted, setDataUseAccepted] = useState(false);
  const [introductionReportOpen, setIntroductionReportOpen] = useState(false);
  const [connectionReportOpen, setConnectionReportOpen] = useState(false);
  const [transparency, setTransparency] = useState<TransparencyVersion | null>(
    null,
  );
  const visibleIntroductions = showSaved ? savedIntroductions : introductions;
  const current = visibleIntroductions[0];
  const connection = connections[0];
  const load = useCallback(async () => {
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
      ]);
      setProfile(nextProfile);
      setBio(nextProfile.bio);
      setPreferences(nextPreferences);
      setIntroductions(nextIntroductions.items);
      setSavedIntroductions(nextSavedIntroductions.items);
      setConnections(nextConnections.items);
      setOnboarded(onboarding.complete);
      setSuggestions(nextSuggestions.items);
      setAccountStatus(nextAccountStatus.status);
      setDelivery(nextDelivery);
      setTransparency(nextTransparency);
      setReports(nextReports.items);
      setResearchConsent(nextResearchConsent.receipt);
      setMessages(
        nextConnections.items[0]
          ? (await api.messages(nextConnections.items[0].id)).items
          : [],
      );
    } catch {
      setError(
        "Cannot reach the local API. Check EXPO_PUBLIC_OPENMATCH_API_URL and retry.",
      );
    } finally {
      setLoading(false);
    }
  }, [api]);
  useEffect(() => {
    void load();
  }, [load]);
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
      setSuggestions((await api.preferenceSuggestions()).items);
    } catch {
      setError("Preferences could not be saved.");
    }
  };
  const decide = async (value: "interested" | "passed") => {
    if (!current) return;
    try {
      await api.decide(current.profile.id, value);
      setShowMath(false);
      await load();
    } catch {
      setError("Your decision could not be saved.");
    }
  };

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
            <IntentSelector
              value={profile.intent}
              onChange={(intent) => setProfile({ ...profile, intent })}
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
                I understand this local prototype stores what I enter so its
                features can work. I can export or delete it from Profile.
              </Text>
            </Pressable>
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
                    intent: profile.intent,
                    bio: profile.bio.trim(),
                  })
                  .then(() => api.updatePreferences(preferences))
                  .then(() => api.acceptPrototypeConsent())
                  .then(() => api.completeOnboarding())
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
                      {current.profile.pronouns} · {current.profile.city}
                    </Text>
                    <Text style={styles.intent}>{current.profile.intent}</Text>
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
                              void api.block(current.profile.id).then(() => {
                                setSafetyNotice(null);
                                return load();
                              }),
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
                          `Report received. Reference status: ${result.status}.`,
                        );
                        setReports((await api.reports()).items);
                        setIntroductionReportOpen(false);
                      } catch {
                        setSafetyNotice("Report could not be sent. Retry.");
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
                    ? "Saved profiles stay here until you return them, decide, reset, or delete this local prototype."
                    : "No endless feed. New introductions arrive Thursday."}
                </Text>
                <Action
                  label={showSaved ? "Back to current batch" : "Start over"}
                  onPress={() =>
                    showSaved
                      ? setShowSaved(false)
                      : void api.reset().then(load)
                  }
                />
              </View>
            ))}
          {tab === "Preferences" && (
            <PreferencesScreen
              value={preferences}
              suggestions={suggestions}
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
                    messages.map((message) => (
                      <Text style={styles.mobileBubble} key={message.id}>
                        {message.text}
                      </Text>
                    ))
                  )}
                  <TextInput
                    accessibilityLabel={`Message ${connection.profile?.name ?? "connection"}`}
                    value={draft}
                    onChangeText={setDraft}
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
                      void api
                        .sendMessage(connection.id, text)
                        .then((message) => {
                          setMessages((previous) => [...previous, message]);
                          setDraft("");
                        })
                        .catch(() =>
                          setSafetyNotice("Message could not be sent. Retry."),
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
                              void api.unmatch(connection.id).then(load),
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
                              void api.block(connection.profileId).then(load),
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
                            `Report received. Reference status: ${result.status}.`,
                          );
                          setReports((await api.reports()).items);
                          setConnectionReportOpen(false);
                        } catch {
                          setSafetyNotice("Report could not be sent. Retry.");
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
                    <IntentSelector
                      value={profile.intent}
                      onChange={(intent) => setProfile({ ...profile, intent })}
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
                  </>
                ) : (
                  <>
                    <Text style={styles.meta}>
                      {profile.pronouns || "Pronouns not shown"} ·{" "}
                      {profile.city}
                    </Text>
                    <Text style={styles.intent}>{profile.intent}</Text>
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
                      !bio.trim())
                  }
                  onPress={() => {
                    if (editingProfile)
                      void api
                        .updateProfile({
                          name: profile.name.trim(),
                          age: profile.age,
                          city: profile.city.trim(),
                          pronouns: profile.pronouns.trim(),
                          intent: profile.intent,
                          bio: bio.trim(),
                        })
                        .then(setProfile)
                        .catch(() => setError("Profile could not be saved."));
                    setEditingProfile(!editingProfile);
                  }}
                />
              </View>
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
                  Reports are private. This prototype records receipts but has
                  no staffed review operation, response-time promise, or appeal
                  process.
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
                            void api.deleteAccountData().then(load),
                        },
                      ],
                    )
                  }
                >
                  <Text style={styles.safetyLink}>Delete local data</Text>
                </Pressable>
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
              </View>
              <View style={styles.scoreCard}>
                <Text style={styles.name}>Known limits</Text>
                <Text style={styles.scoreNote}>
                  This prototype cannot predict attraction, love, relationship
                  success, or safety. Its small demo pool is not evidence of
                  fairness or effectiveness. Those claims require prospective
                  and independent evaluation.
                </Text>
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
            <Text style={[styles.tabText, tab === item && styles.tabActive]}>
              {item}
            </Text>
          </Pressable>
        ))}
      </View>
    </SafeAreaView>
  );
}

function PreferencesScreen({
  value,
  onChange,
  suggestions,
  delivery,
  setBatchSize,
}: {
  value: Preferences;
  onChange: (value: Preferences) => void;
  suggestions?: WeightSuggestion[];
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
          <Text style={styles.mathNote}>
            Decisions only. Messages, dwell time, taps, and photos are never
            learning inputs. Nothing changes automatically.
          </Text>
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
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  secondary?: boolean;
  disabled?: boolean;
  accessibilityLabel?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
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
  header: {
    height: 58,
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
    height: 68,
    backgroundColor: "#FAFAF7",
    borderTopWidth: 1,
    borderColor: "#DDD",
    flexDirection: "row",
    paddingBottom: 8,
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
  mobileBubble: {
    alignSelf: "flex-end",
    backgroundColor: "#DFEAE3",
    padding: 12,
    borderRadius: 16,
    marginBottom: 12,
    maxWidth: "85%",
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
