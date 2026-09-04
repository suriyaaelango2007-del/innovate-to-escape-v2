import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Routes are PUBLIC by default under clerkMiddleware, so everything the game
// needs to protect is listed explicitly here.
//
// Deliberately left public:
//   /                     landing page
//   /leaderboard          projected on a screen during the event
//   /api/leaderboard      ditto
//   /api/config           safe public config only
//   /admin, /api/admin/*  gated by ADMIN_PASSWORD, not by Clerk — organisers
//                         shouldn't need a player account to run the console
//   /sign-in, /sign-up    the Clerk pages themselves
const isProtectedRoute = createRouteMatcher([
  "/play(.*)",
  "/my-attempts(.*)",
  "/api/session(.*)",
  "/api/guess(.*)",
  "/api/phase2(.*)",
  "/api/my-attempts(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  if (isProtectedRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
