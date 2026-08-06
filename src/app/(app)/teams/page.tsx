import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { syncEntry } from "@/lib/sync";
import { SEASON, deadlinePassed } from "@/lib/config";
import { CONFERENCES, DIVISIONS, teamName, type Conference } from "@/lib/teams";
import { emptyPicks, getSeeds, projectedWins, picksMade, REGULAR_SEASON_GAMES } from "@/lib/bracket";
import { TeamLogo } from "@/components/TeamLogo";
import { ChevronRight } from "@/components/icons";

export const dynamic = "force-dynamic";

type Status = "division" | "wildcard" | "out";

interface Row {
  abbr: string;
  status: Status;
  seed: number | null; // this team's seed in the user's bracket (1-7)
  wins: number | null; // projected wins, null when the user hasn't set a total
}

export default async function TeamsPage() {
  const user = await getCurrentUser();
  // Use the effective (track-aware) picks so a matchups-track field shows the
  // same derived winners/wildcards as the bracket page.
  const picks = user ? (await syncEntry(user.id, deadlinePassed())).picks : emptyPicks();
  const hasPicks = picksMade(picks) > 0;

  // Seed each team from the user's own bracket (division winners 1-4, wild
  // cards 5-7, ordered by projected wins).
  const seedByTeam = new Map<string, number>();
  for (const conf of CONFERENCES) {
    for (const s of getSeeds(conf, picks)) seedByTeam.set(s.team, s.seed);
  }

  const rowFor = (conf: Conference, divKey: string, abbr: string): Row => {
    const status: Status =
      picks.divisionPicks[divKey] === abbr
        ? "division"
        : (picks.wildcards[conf] ?? []).includes(abbr)
          ? "wildcard"
          : "out";
    const wins = typeof picks.records?.[abbr] === "number" ? projectedWins(picks, abbr) : null;
    return { abbr, status, seed: seedByTeam.get(abbr) ?? null, wins };
  };

  return (
    <div className="narrow">
      <h4 style={{ margin: "0 0 2px" }}>Divisions</h4>
      <p style={{ opacity: 0.6, fontSize: 13, margin: "0 0 14px" }}>
        {SEASON} · your picks — division winners and wild cards you have making the playoffs
      </p>

      {!hasPicks && (
        <Link href="/picks" style={{ textDecoration: "none", color: "inherit" }}>
          <div
            className="card elev-sm"
            style={{
              padding: 14,
              marginBottom: 12,
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
            }}
          >
            <div style={{ flex: 1, fontSize: 12.5, opacity: 0.85 }}>
              You haven&apos;t made any picks yet. Choose your division winners and wild cards on
              the Bracket page and they&apos;ll show up here.
            </div>
            <span style={{ color: "var(--color-accent)", flex: "none" }}>
              <ChevronRight size={14} />
            </span>
          </div>
        </Link>
      )}

      <Legend />

      {CONFERENCES.map((conf) => (
        <ConferenceSection
          key={conf}
          conf={conf}
          rowFor={rowFor}
          highlight={hasPicks}
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
  rowFor,
  highlight,
}: {
  conf: Conference;
  rowFor: (conf: Conference, divKey: string, abbr: string) => Row;
  highlight: boolean;
}) {
  const divisions = DIVISIONS.filter((d) => d.conf === conf);
  return (
    <section style={{ marginTop: 18 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 10 }}>
        <h5 style={{ margin: 0 }}>{conf}</h5>
        <span style={{ fontSize: 11.5, opacity: 0.5 }}>1 division winner · 3 wild cards</span>
      </div>
      <div className="grid-2">
        {divisions.map((d) => {
          const rows = d.teams
            .map((abbr) => rowFor(conf, d.key, abbr))
            .sort(compareRows);
          return <DivisionCard key={d.key} name={d.key} rows={rows} highlight={highlight} />;
        })}
      </div>
    </section>
  );
}

function compareRows(a: Row, b: Row): number {
  const rank = (s: Status) => (s === "division" ? 0 : s === "wildcard" ? 1 : 2);
  if (rank(a.status) !== rank(b.status)) return rank(a.status) - rank(b.status);
  const sa = a.seed ?? 99;
  const sb = b.seed ?? 99;
  if (sa !== sb) return sa - sb;
  return (b.wins ?? -1) - (a.wins ?? -1);
}

function DivisionCard({
  name,
  rows,
  highlight,
}: {
  name: string;
  rows: Row[];
  highlight: boolean;
}) {
  return (
    <div className="card elev-sm" style={{ padding: "10px 12px 12px", gap: 6 }}>
      <div className="card-kicker" style={{ marginBottom: 2 }}>
        {name}
      </div>
      {rows.map((r) => (
        <TeamRow key={r.abbr} row={r} highlight={highlight} />
      ))}
    </div>
  );
}

function TeamRow({ row, highlight }: { row: Row; highlight: boolean }) {
  const inPlayoffs = highlight && row.status !== "out";
  const record =
    row.wins != null ? `${row.wins}-${Math.max(0, REGULAR_SEASON_GAMES - row.wins)}` : "—";

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 9,
        padding: "6px 8px",
        borderRadius: "var(--radius-sm)",
        background: inPlayoffs
          ? "color-mix(in srgb, var(--color-accent) 12%, transparent)"
          : "transparent",
        opacity: highlight && row.status === "out" ? 0.5 : 1,
      }}
    >
      <TeamLogo id={row.abbr} size={22} />
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
        {teamName(row.abbr)}
      </span>
      <span
        style={{
          fontSize: 13,
          fontVariantNumeric: "tabular-nums",
          opacity: row.wins != null ? 0.8 : 0.4,
          flex: "none",
        }}
      >
        {record}
      </span>
      {inPlayoffs ? (
        <SeedChip seed={row.seed} status={row.status} />
      ) : (
        <span style={{ width: 20, flex: "none" }} aria-hidden />
      )}
    </div>
  );
}

function SeedChip({ seed, status }: { seed: number | null; status: Status }) {
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
