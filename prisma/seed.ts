// The app needs no seed data — NFL teams and divisions are static reference
// data in src/lib/teams.ts, and members create themselves by joining. This
// stub exists so `npm run db:seed` is a no-op rather than an error.

async function main() {
  console.log("Nothing to seed — teams are static, members self-register. ✅");
}

main();
