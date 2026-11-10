export type UserRole = "super_admin" | "admin" | "student" | "parent";

export type Program = "school" | "jee" | "neet" | "govt";

export interface User {
  id: number;
  email: string;
  full_name: string;
  role: UserRole;
  school_id: number | null;
  class_grade?: number | null;
  program?: Program | string;
  exam_track?: string | null;
  is_active: boolean;
  account_status?: "active" | "suspended" | "service_stopped";
  status_note?: string | null;
  access_role_id?: number | null;
  phone?: string | null;
  parent_name?: string | null;
  parent_phone?: string | null;
  service_permissions?: ServicePermission[];
  subscription_plan?: string | null;
  subscription_status?: string | null;
  subscription_expires_at?: string | null;
}

export type ServicePermission = "schedule" | "lectures" | "recordings" | "practice" | "support";

export interface AccessRole {
  id: number;
  name: string;
  description?: string | null;
  permissions: ServicePermission[];
  is_system: boolean;
}

export interface StudentPerformanceAnalytics {
  students_by_domain: { program: string; label: string; count: number }[];
  top_students: {
    student_id: number;
    full_name: string;
    program: string;
    exam_track?: string | null;
    class_grade?: number | null;
    avg_score: number;
    attempts: number;
    best_mock_score: number | null;
  }[];
  scores_by_exam_type: {
    plan_type: string;
    label: string;
    attempts: number;
    avg_score: number;
  }[];
  domain_leaderboards: Record<string, StudentPerformanceAnalytics["top_students"]>;
}

export interface School {
  id: number;
  name: string;
  organization_type: string;
  default_access_role_id?: number | null;
  address: string | null;
  enabled_class_grades?: number[];
  student_limits?: Record<number, number>;
  admin_count?: number;
  student_count?: number;
}

export interface PlatformOverview {
  schools: number;
  admins: number;
  students: number;
  books: number;
  chapters: number;
  lectures_ready: number;
  schedules: number;
  practice_templates: number;
  practice_submissions: number;
  demo_leads: number;
  demo_leads_new: number;
  student_leads: number;
  student_leads_new: number;
  suspended_users: number;
}

export type DemoLeadStatus = "new" | "contacted" | "qualified" | "closed";

export interface DemoLead {
  id: number;
  full_name: string;
  email: string;
  phone: string;
  organization: string;
  role: string;
  program: string;
  student_count?: string | null;
  message?: string | null;
  status: DemoLeadStatus;
  admin_notes?: string | null;
  created_at: string;
}

export type StudentLeadStatus = "registered" | "verified" | "paid" | "contacted" | "closed";

export interface StudentLead {
  id: number;
  full_name: string;
  email: string;
  phone: string;
  class_grade?: number | null;
  plan_id?: string | null;
  billing_cycle?: string | null;
  parent_name?: string | null;
  parent_phone?: string | null;
  school_name?: string | null;
  city?: string | null;
  board?: string | null;
  status: StudentLeadStatus;
  email_verified: boolean;
  user_id?: number | null;
  admin_notes?: string | null;
  created_at: string;
  updated_at: string;
}

export interface LecturePart {
  id: number;
  part_number: number;
  title: string;
  duration_minutes: number;
  word_count: number;
  status: string;
  audio_url: string | null;
  summary: string | null;
  has_visuals?: boolean;
}

export interface VisualFrame {
  id: number;
  frame_number: number;
  caption: string;
  segment_text: string;
  image_url: string;
  start_seconds: number;
  duration_seconds: number;
  book_page_number?: number | null;
  source_type?: string;
  page_summary?: string | null;
}

export interface LectureSegment {
  index: number;
  text: string;
  start_seconds: number;
  duration_seconds: number;
}

export interface LectureSession {
  lecture_id: number;
  chapter_id: number;
  title: string;
  chapter_title: string;
  subject: string;
  class_grade: number;
  audio_url: string | null;
  duration_minutes: number;
  script: string | null;
  segments: LectureSegment[];
  frames: VisualFrame[];
  visual_status: "ready" | "generating" | "unavailable";
  audio_status: "ready" | "generating" | "unavailable" | "failed";
  audio_error?: string | null;
  audio_chunks_completed?: number | null;
  audio_chunks_total?: number | null;
  live_status?: "none" | "upcoming" | "live" | "ended";
  scheduled_at?: string | null;
  live_position_seconds?: number;
  is_live?: boolean;
  auto_play?: boolean;
  schedule_id?: number | null;
}

export interface LectureSchedule {
  id: number;
  chapter_id: number;
  chapter_title: string;
  chapter_number: number;
  subject: string;
  class_grade: number;
  scheduled_at: string;
  duration_minutes: number;
  status: string;
  lecture_id: number | null;
  has_recording: boolean;
}

export interface Recording {
  lecture_id: number;
  title: string;
  chapter_id: number;
  chapter_title: string;
  chapter_number: number;
  subject: string;
  class_grade: number;
  duration_minutes: number;
  audio_url: string | null;
  completed_at: string | null;
  last_position_seconds: number;
}

export interface Chapter {
  id: number;
  chapter_number: number;
  source_chapter_number?: number | null;
  title: string;
  display_label?: string;
  content: string | null;
  status: string;
  lecture_parts: LecturePart[];
}

export interface Book {
  id: number;
  class_grade: number;
  subject: string;
  title: string;
  file_type: string;
  status: string;
  created_at: string;
  program?: Program | string;
  exam_track?: string | null;
  content_language?: string | null;
  chapters: Chapter[];
  processing_progress?: number;
  processing_message?: string | null;
}

export interface StudentDashboardStats {
  program?: string;
  class_grade?: number | null;
  lectures_completed?: number;
  lectures_in_progress?: number;
  upcoming_classes?: number;
  subjects_available?: number;
  practice_papers?: number;
}

export interface MyStudentPerformanceAnalytics extends StudentDashboardStats {
  student_id: number;
  full_name: string;
  avg_score: number;
  attempts: number;
  best_mock_score: number | null;
  scores_by_exam_type: {
    plan_type: string;
    label: string;
    attempts: number;
    avg_score: number;
  }[];
  progress_by_subject: {
    subject: string;
    completed: number;
    available: number;
    completion_rate: number;
  }[];
  recent_attempts: {
    id: number;
    title: string;
    subject: string;
    plan_type: string;
    label: string;
    score: number | null;
    total_questions: number | null;
    percent: number;
    submitted_at: string | null;
    suggestions?: string[];
  }[];
  improvement?: {
    score_delta: number | null;
    top_weak_areas: Array<{ topic: string; count: number }>;
    latest_suggestions: string[];
    recurring_suggestions: Array<{ suggestion: string; count: number }>;
  };
}

export interface PracticeTemplate {
  id: number;
  title: string;
  plan_type: string;
  class_grade: number;
  subject: string;
  chapter_ids: number[];
  question_count: number;
  program: string;
  created_at: string;
}

export interface ExamQuestion {
  number: number;
  type: "mcq" | "very_short" | "short" | "long" | "case_study" | "map_diagram" | string;
  question: string;
  options?: string[];
  marks: number;
}

export interface ExamSection {
  id: string;
  title: string;
  questions: ExamQuestion[];
}

export interface PracticeExam {
  exam_meta?: {
    board_style?: string;
    class_grade?: number;
    subject?: string;
    plan_type?: string;
    exam_label?: string;
    duration_minutes?: number;
    total_marks?: number;
    written_marks?: number;
    syllabus_note?: string;
    chapters?: string[];
    instructions?: string[];
    general_instructions?: string[];
  };
  sections: ExamSection[];
}

export interface PracticePaper {
  id: number;
  title: string;
  subject: string;
  plan_type?: string;
  questions: Array<{
    question: string;
    options: string[];
    answer: string;
    explanation?: string;
  }>;
  exam?: PracticeExam | null;
  class_grade?: number | null;
  total_marks?: number | null;
  status?: string;
  score?: number | null;
  total_questions?: number | null;
  submitted_at?: string | null;
  created_at: string;
  started_at?: string | null;
  ends_at?: string | null;
  remaining_seconds?: number | null;
  duration_minutes?: number | null;
  upload_url?: string | null;
  evaluation?: {
    total_marks_awarded?: number;
    max_marks?: number;
    percent?: number;
    summary?: string;
    suggestions?: string[];
    questions?: Array<{
      number: number;
      marks_awarded: number;
      max_marks: number;
      feedback: string;
      weak_topic?: string;
    }>;
  } | null;
}
