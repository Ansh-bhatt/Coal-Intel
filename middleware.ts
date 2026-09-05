import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Role-based route guard (edge middleware).
 *
 * The auth store mirrors the signed-in user's role into a lightweight
 * `coal_intel_role` cookie (see store/authStore.ts); this middleware reads it
 * on every navigation and enforces strict portal isolation:
 *
 *   /executive, /analytics, /query-system -> EXECUTIVE (or ADMIN) only
 *   /ingestion                            -> SUBSIDIARY (or ADMIN) only
 *
 * Unauthenticated users are bounced to the role-appropriate sign-in page;
 * authenticated users with the wrong role land on /unauthorized.
 */
const EXECUTIVE_ROUTES = ["/executive", "/analytics", "/query-system"];
const SUBSIDIARY_ROUTES = ["/ingestion"];

function matches(pathname: string, routes: string[]): boolean {
  return routes.some((r) => pathname === r || pathname.startsWith(`${r}/`));
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const role = request.cookies.get("coal_intel_role")?.value ?? null;

  // Not signed in -> role-scoped sign-in page.
  if (!role) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set(
      "portal",
      matches(pathname, SUBSIDIARY_ROUTES) ? "subsidiary" : "executive",
    );
    return NextResponse.redirect(loginUrl);
  }

  const isExecutiveArea = matches(pathname, EXECUTIVE_ROUTES);
  const isSubsidiaryArea = matches(pathname, SUBSIDIARY_ROUTES);

  if (isExecutiveArea && role !== "EXECUTIVE" && role !== "ADMIN") {
    return NextResponse.redirect(new URL("/unauthorized", request.url));
  }
  if (isSubsidiaryArea && role !== "SUBSIDIARY" && role !== "ADMIN") {
    return NextResponse.redirect(new URL("/unauthorized", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/executive/:path*",
    "/analytics/:path*",
    "/query-system/:path*",
    "/ingestion/:path*",
  ],
};
