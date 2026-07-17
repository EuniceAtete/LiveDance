import { API_BASE_URL } from './config';
import { Lesson, PaymentStatus } from '../types';

interface SessionResponse {
  success: boolean;
  error?: string;
  lesson?: Lesson;
  paymentStatus?: PaymentStatus;
  studentId?: string;
  token?: string;
}

interface ActionResponse {
  success: boolean;
  error?: string;
}

interface LiveKitTokenResponse {
  success: boolean;
  error?: string;
  url?: string;
  token?: string;
  roomName?: string;
}

async function post<T>(path: string, body: Record<string, unknown>): Promise<T> {
  try {
    const res = await fetch(`${API_BASE_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return (await res.json()) as T;
  } catch (err) {
    return { success: false, error: 'Could not reach the server. Check EXPO_PUBLIC_API_URL and your Wi-Fi connection.' } as T;
  }
}

// Mirrors app/actions/student.ts, called over HTTP via app/api/mobile/* route handlers.
export const startStudentSession = (phoneNumber: string, lessonCode: string) =>
  post<SessionResponse>('/api/mobile/session/start', { phoneNumber, lessonCode });

export const resolveSession = (token: string) =>
  post<SessionResponse>('/api/mobile/session/resolve', { token });

export const joinLessonAttendance = (token: string) =>
  post<ActionResponse>('/api/mobile/attendance/join', { token });

export const leaveLessonAttendance = (token: string) =>
  post<ActionResponse>('/api/mobile/attendance/leave', { token });

export const getLiveKitToken = (lessonId: string, token: string, accessToken?: string) =>
  post<LiveKitTokenResponse>('/api/mobile/livekit/token', { lessonId, token, accessToken });
