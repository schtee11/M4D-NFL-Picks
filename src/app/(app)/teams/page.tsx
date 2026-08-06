import { getDivisionsView } from "@/lib/results";
import { SEASON } from "@/lib/config";
import { CONFERENCES, DIVISIONS, teamName, type Conference } from "@/lib/teams";
import { TeamLogo } from "@/components/TeamLogo";
import type { DivisionStanding, DivisionTeamRecord } from "@/lib/espn";

export const dynamic = "force-dynamic";

// Build the full 8-division / 32-team layout from static reference data, then
// overlay whatever records + seeds ESPN gave us. This way the page always shows
// every team by division even when live standings aren't available.
function buildModel(divisions: DivisionStanding[] | null): DivisionStanding[] {
  const byKey = new Map((divisions ?? []).map((d) => [d.key, d]));
  return DIVISIONS.map(
    (d) =>
      byKey.get(d.key) ?? {
        key: d.key,
        conf: d.conf,
        teams: d.teams.map(
          (abbr): DivisionTeamRecord => ({
            abbr,
            wins: 0,
            losses: 0,
            ties: 0,
            pct: 0,
            seed: null,
            status: "out",
            clinch: null,
          }),
        ),
      },
  );
}

export default async function TeamsPage() {
  const view = await getDivisionsView();
  const model = buildModel(view.divisions);
  const showSeeds = view.live;

  return (
    <div className="narrow">
      <h4 style={{ margin: "0 0 2px" }}>Divisions</h4>
      <p style={{ opacity: 0.6, fontSize: 13, margin: "0 0 14px" }}>
        {view.isFallback
          ? `Final ${view.season} standings · the top 7 in each conference made the playoffs`
          : `${view.season} standings · the top 7 in each conference make the playoffs`}
      </p>

      {view.isFallback && (
        <div
          className="card elev-sm"
          style={{ padding: 14, marginBottom: 12, fontSize: 12.5, opacity: 0.8 }}
        >
          The {SEASON} season hasn&apos;t kicked off yet — showing last season&apos;s final
          results. This page switches to live {SEASON} standings once games are played.
        </div>
      )}

      {!view.isFallback && !view.live && (
        <div
          className="card elev-sm"
          style={{ padding: 14, marginBottom: 12, fontSize: 12.5, opacity: 0.8 }}
        >
          Live standings aren&apos;t available right now. Every team is listed below by division;
          records and the playoff picture will fill in once the season starts.
        </div>
      )}

      <Legend />

      {CONFERENCES.map((conf) => (
        <ConferenceSection
          key={conf}
          conf={conf}
          divisions={model.filter((d) => d.conf === conf)}
          showSeeds={showSeeds}
        />
      ))}
    </div>
  );
}

function Legend() {
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 14,
        alignItems: "center",
        fontSize: 11.5,
        opacity: 0.75,
        marginBottom: 4,
      }}
    >
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
        <SeedChip seed={1} status="division" />
        Division winner
      </span>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
        <SeedChip seed={5} status="wildcard" />
        Wild card
      </span>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
        <span
          style={{
            width: 18,
            height: 18,
            borderRadius: "50%",
            border: "1px dashed var(--color-neutral-700)",
            flex: "none",
          }}
        />
        Missed
      </span>
    </div>
  );
}

function ConferenceSection({
  conf,
  divisions,
  showSeeds,
}: {
  conf: Conference;
  divisions: DivisionStanding[];
  showSeeds: boolean;
}) {
  if (!divisions.length) return null;
  return (
    <section style={{ marginTop: 18 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 10 }}>
        <h5 style={{ margin: 0 }}>{conf}</h5>
        <span style={{ fontSize: 11.5, opacity: 0.5 }}>7 playoff spots</span>
      </div>
      <div className="grid-2">
        {divisions.map((d) => (
          <DivisionCard key={d.key} division={d} showSeeds={showSeeds} />
        ))}
      </div>
    </section>
  );
}

function DivisionCard({
  division,
  showSeeds,
}: {
  division: DivisionStanding;
  showSeeds: boolean;
}) {
  return (
    <div className="card elev-sm" style={{ padding: "10px 12px 12px", gap: 6 }}>
      <div className="card-kicker" style={{ marginBottom: 2 }}>
        {division.key}
      </div>
      {division.teams.map((t) => (
        <TeamRow key={t.abbr} team={t} showSeeds={showSeeds} />
      ))}
    </div>
  );
}

function TeamRow({ team, showSeeds }: { team: DivisionTeamRecord; showSeeds: boolean }) {
  const inPlayoffs = showSeeds && team.status !== "out";
  const record =
    team.ties > 0 ? `${team.wins}-${team.losses}-${team.ties}` : `${team.wins}-${team.losses}`;

  return (
    <div
      title={team.clinch ?? undefined}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 9,
        padding: "6px 8px",
        borderRadius: "var(--radius-sm)",
        background: inPlayoffs
          ? "color-mix(in srgb, var(--color-accent) 12%, transparent)"
          : "transparent",
        opacity: showSeeds && team.status === "out" ? 0.5 : 1,
      }}
    >
      <TeamLogo id={team.abbr} size={22} />
      <span
        style={{
          flex: 1,
          fontSize: 13.5,
          minWidth: 0,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {teamName(team.abbr)}
      </span>
      <span
        style={{
          fontSize: 13,
          fontVariantNumeric: "tabular-nums",
          opacity: 0.8,
          flex: "none",
        }}
      >
        {record}
      </span>
      {inPlayoffs ? (
        <SeedChip seed={team.seed} status={team.status} />
      ) : (
        <span style={{ width: 20, flex: "none" }} aria-hidden />
      )}
    </div>
  );
}

function SeedChip({
  seed,
  status,
}: {
  seed: number | null;
  status: DivisionTeamRecord["status"];
}) {
  const isDivision = status === "division";
  return (
    <span
      style={{
        width: 20,
        height: 20,
        borderRadius: "50%",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 11,
        fontWeight: 600,
        fontVariantNumeric: "tabular-nums",
        flex: "none",
        background: isDivision ? "var(--color-accent)" : "transparent",
        color: isDivision ? "var(--color-bg)" : "var(--color-accent)",
        border: isDivision ? "none" : "1.5px solid var(--color-accent)",
      }}
    >
      {seed ?? (isDivision ? "★" : "•")}
    </span>
  );
}
