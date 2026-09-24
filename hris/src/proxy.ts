/**
 * Next 16 renamed the `middleware` file convention to `proxy`. We keep
 * clerkMiddleware() so Clerk can attach its auth context to every request,
 * but no path-based `auth.protect()` here — Clerk deprecated
 * `createRouteMatcher` in favour of resource-based auth checks, which the
 * app already does:
 *
 *   • /(app)/* pages: AppLayout → ensureUserInDb() → redirect('/sign-in')
 *   • /(app)/admin/* pages: additional role check via requireUser() + role guard
 *   • /api/*         : each route calls requireAuth() → 401 if unauth
 *   • /api/webhooks  : validated via signed payload
 *   • /api/biometric : bearer-token auth handled in the route
 *   • /               : public landing
 *   • /sign-in        : public
 *
 * Migration ref: https://clerk.com/docs/guides/development/upgrading/upgrade-guides/migrate-from-create-route-matcher
 */
import { clerkMiddleware } from '@clerk/nextjs/server';

export default clerkMiddleware();

export const config = {
  matcher: [
    // Skip Next internals and static asset extensions
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run on API + tRPC so Clerk injects auth() for those handlers.
    '/(api|trpc)(.*)',
  ],
};
