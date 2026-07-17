import { AccessToken } from 'livekit-server-sdk';
import { resolveSession } from '@/app/actions/student';
import { getSupabaseAdmin } from '@/lib/supabase';
import { Lesson } from '@/types';

// Mints a LiveKit room-access token for the mobile app's live lesson room.
// Mirrors the room-name scheme the app previously used for its Jitsi WebView
// embed, so students and the instructor land in the same room.
function roomNameForLesson(lesson: Lesson) {
  return `LiveDance_${lesson.meeting_room || lesson.id.substring(0, 8)}`;
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const lessonId = typeof body?.lessonId === 'string' ? body.lessonId : '';
  const token = typeof body?.token === 'string' ? body.token : '';
  const accessToken = typeof body?.accessToken === 'string' ? body.accessToken : '';

  if (!lessonId || !token) {
    return Response.json({ success: false, error: 'Missing lessonId or token' }, { status: 400 });
  }

  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  const livekitUrl = process.env.LIVEKIT_URL;
  if (!apiKey || !apiSecret || !livekitUrl) {
    return Response.json({ success: false, error: 'LiveKit is not configured on the server' }, { status: 500 });
  }

  let lesson: Lesson;
  let identity: string;
  let name: string;

  if (token === 'admin') {
    if (!accessToken) {
      return Response.json({ success: false, error: 'Missing admin access token' }, { status: 401 });
    }
    const supabaseAdmin = getSupabaseAdmin();
    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(accessToken);
    if (userError || !userData?.user) {
      return Response.json({ success: false, error: 'Invalid admin session' }, { status: 401 });
    }

    const { data: lessonRow, error: lessonError } = await supabaseAdmin
      .from('lessons')
      .select('*')
      .eq('id', lessonId)
      .maybeSingle();
    if (lessonError || !lessonRow) {
      return Response.json({ success: false, error: 'Lesson not found' }, { status: 404 });
    }

    lesson = lessonRow as Lesson;
    identity = userData.user.id;
    name = 'Instructor';
  } else {
    const res = await resolveSession(token);
    if (!res.success || !res.lesson || res.lesson.id !== lessonId || res.lesson.status !== 'live' || res.paymentStatus !== 'approved') {
      return Response.json({ success: false, error: res.error || 'Not authorized to join this lesson' }, { status: 403 });
    }

    lesson = res.lesson;
    identity = res.studentId || token;
    name = 'Student';
  }

  const roomName = roomNameForLesson(lesson);
  const at = new AccessToken(apiKey, apiSecret, { identity, name });
  at.addGrant({ room: roomName, roomJoin: true, canPublish: true, canSubscribe: true });

  return Response.json({ success: true, url: livekitUrl, token: await at.toJwt(), roomName });
}
