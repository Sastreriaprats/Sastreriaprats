import { type NextRequest, NextResponse } from 'next/server'

const COOKIE_NAME = 'x-user-roles'
const MAX_AGE = 60 * 60 * 4 // 4 horas

export function setRolesCookie(response: NextResponse, roles: string[]): void {
  response.cookies.set(COOKIE_NAME, JSON.stringify(roles), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: MAX_AGE,
  })
}

export function getRolesFromCookie(request: NextRequest): string[] | null {
  const cookie = request.cookies.get(COOKIE_NAME)
  if (!cookie?.value) return null
  try {
    const parsed = JSON.parse(cookie.value)
    return Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function clearRolesCookie(response: NextResponse): void {
  response.cookies.delete(COOKIE_NAME)
}
