import app from "./app";
import posthog from "./lib/posthog";

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`🚀 MomentOS API running on http://localhost:${PORT}`);
});

process.on("SIGTERM", async () => {
  await posthog.shutdown();
  process.exit(0);
});

process.on("SIGINT", async () => {
  await posthog.shutdown();
  process.exit(0);
});
