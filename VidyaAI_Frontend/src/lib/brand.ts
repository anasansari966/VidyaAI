export const PRODUCT_NAME = "VidyaAI";
export const AI_TEACHER_NAME = "Ms. Vidya";
export const APP_DOMAIN = "app.vidyaai.com";
export const LOGO_PATH = "/brand/vidya-logo-white.png";
export const LOGO_ICON_PATH = "/brand/vidya-icon-white.png";
export const BOOK_DEMO_PATH = "/book-demo";
/** Original vidya_logo.png canvas is 612×408 */
export const LOGO_ASPECT_RATIO = 1.5;

export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.NODE_ENV === "development"
    ? "http://localhost:3000"
    : `https://${APP_DOMAIN}`);

export const COMPANY_NAME = "Desalia Solution Pvt Ltd";
export const COMPANY_TAGLINE = `A product of ${COMPANY_NAME}`;
export const COMPANY_EMAIL = "info@desaliasolution.com";
export const COMPANY_LINKEDIN = "https://in.linkedin.com/company/desalia-solution-pvt-ltd";
export const COMPANY_WEBSITE = "https://desaliasolution.com/";
