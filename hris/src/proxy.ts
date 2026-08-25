/**
 * Next 16 renamed the `middleware` file convention to `proxy`. Clerk's
 * clerkMiddleware() is unchanged — it just runs from here now.
 */
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

const isPublicRoute = createRouteMatcher([
  '/',                        // landing
  '/sign-in(.*)',
  '/api/webhooks/(.*)',
]);

export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    // Pass the redirect targets explicitly. Left to infer them, protect()
    // falls through to a Next notFound(), so a signed-out visitor opening
    // /dashboard got a bare 404 instead of the sign-in page.
    await auth.protect({
      unauthenticatedUrl: new URL('/sign-in', req.url).toString(),
      unauthorizedUrl: new URL('/not-authorized', req.url).toString(),
    });
  }
});

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};
