import { getDivisionRecords } from "@/lib/results";
import { SEASON } from "@/lib/config";
import { CONFERENCES, teamName, type Conference } from "@/lib/teams";
import { TeamLogo } from "@/components/TeamLogo";
import type { DivisionStanding, DivisionTeamRecord } from "@/lib/espn";

export const dynamic = "force-dynamic";

export default async function TeamsPage() {
  const standings = await getDivisionRecords();

  const started =
    !!standings &&
    standings.some((d) => d.teams.some((t) => t.wins + t.losses + t.ties > 0));

  return (
    <div className="narrow">
      <h4 style={{ margin: "0 0 2px" }}>Divisions</h4>
      <p style={{ opacity: 0.6, fontSize: 13, margin: "0 0 14px" }}>
        {SEASON} standings · the top 7 in each conference make the playoffs
      </p>

      <Legend />

      {!standings && (
        <div className="card elev-sm" style={{ padding: 18, textAlign: "center", marginTop: 12 }}>
          <div style={{ fontSize: 13, opacity: 0.7 }}>Standings aren&apos;t available right now.</div>
          <div style={{ fontSize: 12, opacity: 0.5, marginTop: 4 }}>Try again in a few minutes.</div>
        </div>
      )}

      {standings && !started && (
        <div
          className="card elev-sm"
          style={{ padding: 14, marginTop: 12, marginBottom: 4, fontSize: 12.5, opacity: 0.75 }}
        >
          The season hasn&apos;t kicked off yet — records and the playoff picture will fill in
          once games are played.
        </div>
      )}

      {standings &&
        CONFERENCES.map((conf) => (
          <ConferenceSection
            key={conf}
            conf={conf}
            divisions={standings.filter((d) => d.conf === conf)}
            showSeeds={started}
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
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 8,
          marginBottom: 10,
        }}
      >
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
        background: inPlayoffs ? "color-mix(in srgb, var(--color-accent) 12%, transparent)" : "transparent",
        opacity: showSeeds && team.status === "out" ? 0.5 : 1,
      }}
    >
      <TeamLogo id={team.abbr} size={22} />
      <span style={{ flex: 1, fontSize: 13.5, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
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
      {inPlayoffs && team.seed != null ? (
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
  seed: number;
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
      {seed}
    </span>
  );
}
