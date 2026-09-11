export const dynamic = "force-dynamic";

function currentReleaseId() {
  return (
    process.env.VERCEL_DEPLOYMENT_ID ||
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.VERCEL_URL ||
    process.env.npm_package_version ||
    "development"
  );
}

export async function GET() {
  return Response.json(
    {
      release: currentReleaseId(),
      environment: process.env.VERCEL_ENV || process.env.NODE_ENV || "development",
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        Pragma: "no-cache",
      },
    }
  );
}
