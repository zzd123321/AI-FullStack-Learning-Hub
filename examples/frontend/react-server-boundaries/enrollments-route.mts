import { revalidateTag } from 'next/cache'
import { NextResponse } from 'next/server'
import { parseEnrollmentJSON } from './action-contract.js'
import { EnrollmentCommandError, enrollLesson } from './enrollment-command.mjs'

export async function POST(request: Request) {
  const parsed = parseEnrollmentJSON(await request.json().catch(() => null))
  if (!parsed.ok) return NextResponse.json({ error: parsed.message }, { status: 400 })

  try {
    const result = await enrollLesson(parsed)
    revalidateTag('published-lessons', 'max')
    return NextResponse.json(
      { ok: true, duplicate: result.duplicate },
      { status: result.duplicate ? 200 : 201 },
    )
  } catch (error) {
    if (error instanceof EnrollmentCommandError) {
      const status = error.code === 'unauthenticated' ? 401
        : error.code === 'not-found' ? 404 : 409
      return NextResponse.json({ error: error.code }, { status })
    }
    console.error('POST enrollment failed', error)
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
}
